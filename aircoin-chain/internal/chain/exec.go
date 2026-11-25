package chain

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"regexp"
	"sort"
	"strings"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/crypto"
)

// Event is a C4 chain event (contracts-schema/schemas/c4-chain-event.schema.json).
type Event struct {
	V           int            `json:"v"`
	Type        string         `json:"type"`
	TxHash      string         `json:"tx_hash"`
	LogIndex    int            `json:"log_index"`
	BlockNumber int64          `json:"block_number"`
	Ts          int64          `json:"ts"`
	Data        map[string]any `json:"data"`
}

// Result is the outcome of one transaction. Code 0 is success. ReasonCode is a C3
// rejection code for attestations, or a short code for other txs.
type Result struct {
	Code       uint32
	ReasonCode string
	Log        string
	Amount     string
	Events     []Event
	// Recorded: a rejection of a claim the miner's own device signed. These still go
	// into a block (as a failed tx) so every node keeps the same anti-cheat record.
	Recorded bool
}

// SelfFaucetMax is the most tINR a non-admin can take from the faucet per tx.
var SelfFaucetMax, _ = new(big.Int).SetString("1000000000000000000000", 10)

// EpochCloseSlackMs is how far before block time an epoch may end and still be attested.
const EpochCloseSlackMs = 15_000

// Ctx is the block a transaction runs in.
type Ctx struct {
	Height int64
	TimeMs int64
	TxHash string
	// MintedInBlock accumulates AIR minted by attestations, for the proposer reward.
	MintedInBlock *big.Int
	// LogIndexStart is the block-wide index of this tx's first event.
	LogIndexStart int
	emitted       int
}

// NextLogIndex is the log index the next tx in the block should start at.
func (c *Ctx) NextLogIndex() int { return c.LogIndexStart + c.emitted }

func fail(code, format string, args ...any) Result {
	return Result{Code: 1, ReasonCode: code, Log: fmt.Sprintf(format, args...)}
}

var minerIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{2,63}$`)
var addrRe = regexp.MustCompile(`^0x[0-9a-f]{40}$`)

func normAddr(a string) (string, bool) {
	a = strings.ToLower(strings.TrimSpace(a))
	return a, addrRe.MatchString(a)
}

func (c *Ctx) emit(r *Result, typ string, data map[string]any) {
	r.Events = append(r.Events, Event{V: 1, Type: typ, TxHash: c.TxHash, LogIndex: c.LogIndexStart + c.emitted,
		BlockNumber: c.Height, Ts: c.TimeMs, Data: data})
	c.emitted++
}

// Exec runs one raw transaction against s. On failure s may hold partial writes only for
// counters that are meant to persist (rejected-epoch counts); balances never change.
func Exec(s *State, c *Ctx, raw []byte) Result {
	tx, err := DecodeTx(raw)
	if err != nil {
		return fail("malformed", "cannot decode tx: %v", err)
	}
	if tx.Type == "attest" {
		return execAttest(s, c, tx.Body)
	}
	from, err := tx.VerifySender(s.ChainID)
	if err != nil {
		return fail("bad_signature", "%v", err)
	}
	var h Header
	_ = json.Unmarshal(tx.Body, &h)
	acct := s.Account(from)
	if h.Nonce != acct.Nonce {
		return fail("bad_nonce", "nonce %d, expected %d", h.Nonce, acct.Nonce)
	}
	var r Result
	switch tx.Type {
	case "transfer":
		r = execTransfer(s, c, from, tx.Body)
	case "burn":
		r = execBurn(s, c, from, tx.Body)
	case "apply_miner":
		r = execApply(s, c, from, tx.Body)
	case "approve_miner":
		r = execApprove(s, c, from, tx.Body)
	case "reject_application":
		r = execReject(s, c, from, tx.Body)
	case "set_miner_status":
		r = execSetStatus(s, c, from, tx.Body)
	case "set_validator":
		r = execSetValidator(s, c, from, tx.Body)
	case "set_obligation":
		r = execSetObligation(s, c, from, tx.Body)
	case "faucet":
		r = execFaucet(s, c, from, tx.Body)
	case "list":
		r = execList(s, c, from, tx.Body)
	case "buy":
		r = execBuy(s, c, from, tx.Body)
	case "cancel":
		r = execCancel(s, c, from, tx.Body)
	default:
		return fail("unknown_tx", "unknown tx type %q", tx.Type)
	}
	// The nonce advances for every signed tx that reached its handler, failed or not,
	// so a failed tx cannot be replayed.
	acct.Nonce++
	return r
}

// ---------------------------------------------------------------- attestations (PoUW)

func execAttest(s *State, c *Ctx, body json.RawMessage) Result {
	a, err := ParseAttestation(body)
	if err != nil {
		return fail("malformed", "cannot decode attestation: %v", err)
	}
	if a.V != 1 || !minerIDRe.MatchString(a.MinerID) || a.Signature == "" || len(a.Plants) == 0 {
		return fail("malformed", "missing or invalid required fields")
	}
	amount, err := ParseAmount(a.Amount)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	ep := s.Params.EpochMs
	if a.Start != a.Epoch*ep || a.End != a.Start+ep {
		return fail("malformed", "start/end must be epoch*%d and start+%d", ep, ep)
	}
	ev, err := a.RecomputeEvidenceHash()
	if err != nil || !strings.EqualFold(ev, a.EvidenceHash) {
		return fail("evidence_hash_mismatch", "evidence hash does not match payload")
	}
	m, ok := s.Miners[a.MinerID]
	if !ok {
		return fail("unknown_miner", "miner %s is not registered", a.MinerID)
	}
	signer, err := a.Signer()
	if err != nil || signer != strings.ToLower(m.DeviceAddress) {
		return fail("bad_signature", "attestation not signed by %s's device key", a.MinerID)
	}
	// From here the miner itself signed the claim, so a rejection counts against it.
	reject := func(code, format string, args ...any) Result {
		r := fail(code, format, args...)
		if code == "epoch_already_minted" { // a retry, not cheating
			return r
		}
		m.EpochsRejected++
		m.Rejections = append(m.Rejections, Rejection{Epoch: a.Epoch, ReasonCode: code, Reason: r.Log,
			TxHash: c.TxHash, BlockNumber: c.Height, Ts: c.TimeMs})
		if len(m.Rejections) > MaxRejections {
			m.Rejections = m.Rejections[len(m.Rejections)-MaxRejections:]
		}
		r.Recorded = true
		return r
	}
	if m.Status != "active" {
		return reject("miner_inactive", "miner %s is %s", a.MinerID, m.Status)
	}
	// Block time trails wall-clock time by about one block, so allow a little slack.
	if a.End > c.TimeMs+EpochCloseSlackMs {
		return reject("epoch_not_closed", "epoch %d ends after this block", a.Epoch)
	}
	if lag := s.Params.MaxEpochLag; lag > 0 && a.End+lag*s.Params.EpochMs < c.TimeMs {
		return reject("malformed", "epoch %d is more than %d epochs old", a.Epoch, lag)
	}
	if s.Params.CalibrationHash != "" && !strings.EqualFold(a.CalibrationHash, s.Params.CalibrationHash) {
		return reject("calibration_mismatch", "unknown calibration table")
	}
	if s.Minted[MintedKey(a.MinerID, a.Epoch)] {
		return reject("epoch_already_minted", "epoch %d already minted", a.Epoch)
	}
	own := map[int]bool{}
	for _, t := range m.StickerIDs {
		own[t] = true
	}
	for _, p := range a.Plants {
		if own[p.TagID] {
			continue
		}
		if other, ok := s.StickerOwner[StickerKey(p.TagID)]; ok && other != a.MinerID {
			return reject("sticker_claimed_by_other_miner", "Sticker %d is registered to %s", p.TagID, other)
		}
		return reject("sticker_not_registered", "sticker %d is not registered to %s", p.TagID, a.MinerID)
	}
	if d := distanceM(m.Location.Lat, m.Location.Lon, a.GPS.Lat, a.GPS.Lon); d > m.Location.GeofenceM {
		return reject("gps_outside_geofence", "miner is %.0f m from its registered spot (fence %.0f m)", d, m.Location.GeofenceM)
	}
	if amount.Cmp(Big(s.Params.PerMinerEpochCap)) > 0 {
		return reject("amount_over_cap", "amount %s over the per-epoch cap %s", amount, s.Params.PerMinerEpochCap)
	}
	for _, p := range a.Plants {
		if p.Air > s.Params.PerPlantAirCap || (p.Status != "present" && p.Air != 0) || p.Air < 0 {
			return reject("amount_over_cap", "plant %d claims %v AIR (cap %v, status %s)", p.TagID, p.Air, s.Params.PerPlantAirCap, p.Status)
		}
	}
	// The minted amount may not exceed what the plants add up to (plus rounding slack).
	if amount.Cmp(plantsTotal(a.Plants)) > 0 {
		return reject("amount_over_cap", "amount %s is more than the plants' total %s", amount, plantsTotal(a.Plants))
	}

	// Verified useful work: mint to the owner.
	owner := strings.ToLower(m.OwnerWallet)
	acct := s.Account(owner)
	acct.AIR = add(acct.AIR, amount)
	s.Supply.Minted = add(s.Supply.Minted, amount)
	s.Minted[MintedKey(a.MinerID, a.Epoch)] = true
	m.Minted = add(m.Minted, amount)
	m.EpochsMinted++
	if a.Epoch > m.LastMintEpoch {
		m.LastMintEpoch = a.Epoch
	}
	m.RecentEpochs = append(m.RecentEpochs, a.Epoch)
	rec := MintRecord{MinerID: a.MinerID, Epoch: a.Epoch, Amount: amount.String(), To: owner,
		EvidenceHash: strings.ToLower(a.EvidenceHash), TxHash: c.TxHash, BlockNumber: c.Height, Ts: c.TimeMs}
	m.Mints = append(m.Mints, rec)
	if len(m.Mints) > 500 {
		m.Mints = m.Mints[len(m.Mints)-500:]
	}
	c.MintedInBlock.Add(c.MintedInBlock, amount)
	r := Result{Amount: amount.String()}
	c.emit(&r, "mint", map[string]any{"miner_id": a.MinerID, "epoch": a.Epoch, "to": owner,
		"amount": amount.String(), "evidence_hash": rec.EvidenceHash})
	return r
}

// distanceM is an equirectangular distance, fine for a 50 m fence. Each step is an
// explicit float64 conversion so no platform fuses multiply-adds: every node, x86 or
// Raspberry Pi ARM, gets the same answer.
// plantsTotal is sum(plant.air) in base units, rounded up, plus 1e12 (0.000001 AIR) slack.
func plantsTotal(ps []Plant) *big.Int {
	sum := new(big.Float).SetPrec(200)
	for _, p := range ps {
		sum.Add(sum, new(big.Float).SetPrec(200).SetFloat64(p.Air))
	}
	sum.Mul(sum, new(big.Float).SetPrec(200).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)))
	out, _ := sum.Int(nil)
	return out.Add(out, big.NewInt(1_000_000_000_000))
}

func distanceM(lat1, lon1, lat2, lon2 float64) float64 {
	const r = 6371000.0
	rad := math.Pi / 180
	mid := float64(float64(lat1+lat2) / 2)
	x := float64(float64(lon2-lon1)*rad) * float64(math.Cos(float64(mid*rad)))
	y := float64(float64(lat2-lat1) * rad)
	return float64(math.Sqrt(float64(float64(x*x)+float64(y*y)))) * r
}

// ---------------------------------------------------------------- tokens

func decode[T any](body json.RawMessage) (*T, error) {
	var v T
	d := json.NewDecoder(strings.NewReader(string(body)))
	d.DisallowUnknownFields()
	if err := d.Decode(&v); err != nil {
		return nil, err
	}
	return &v, nil
}

func execTransfer(s *State, c *Ctx, from string, body json.RawMessage) Result {
	b, err := decode[TransferBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	to, ok := normAddr(b.To)
	if !ok {
		return fail("malformed", "bad recipient")
	}
	amt, err := ParseAmount(b.Amount)
	if err != nil || amt.Sign() == 0 {
		return fail("malformed", "amount must be a positive integer string")
	}
	src, dst := s.Account(from), s.Account(to)
	switch strings.ToUpper(b.Token) {
	case "AIR":
		if Big(src.AIR).Cmp(amt) < 0 {
			return fail("insufficient_funds", "not enough AIR")
		}
		src.AIR, dst.AIR = sub(src.AIR, amt), add(dst.AIR, amt)
	case "TINR":
		if Big(src.TINR).Cmp(amt) < 0 {
			return fail("insufficient_funds", "not enough tINR")
		}
		src.TINR, dst.TINR = sub(src.TINR, amt), add(dst.TINR, amt)
	default:
		return fail("malformed", "token must be AIR or TINR")
	}
	r := Result{}
	c.emit(&r, "transfer", map[string]any{"token": strings.ToUpper(b.Token), "from": from, "to": to, "amount": amt.String()})
	return r
}

func execBurn(s *State, c *Ctx, from string, body json.RawMessage) Result {
	b, err := decode[BurnBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	amt, err := ParseAmount(b.Amount)
	if err != nil || amt.Sign() == 0 {
		return fail("malformed", "amount must be a positive integer string")
	}
	acct := s.Account(from)
	if Big(acct.AIR).Cmp(amt) < 0 {
		return fail("insufficient_funds", "not enough AIR to burn")
	}
	acct.AIR = sub(acct.AIR, amt)
	s.Supply.Burned = add(s.Supply.Burned, amt)
	data := map[string]any{"company": from, "amount": amt.String(), "period": b.Period}
	if ob, ok := s.Obligations[ObligationKey(from, b.Period)]; ok {
		ob.Burned = add(ob.Burned, amt)
		data["company_name"] = ob.CompanyName
		data["obligation"] = ob.Amount
		data["burned_to_date"] = ob.Burned
	}
	if b.Memo != "" {
		data["memo"] = b.Memo
	}
	r := Result{}
	c.emit(&r, "burn", data)
	return r
}

func execFaucet(s *State, c *Ctx, from string, body json.RawMessage) Result {
	b, err := decode[FaucetBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	to, ok := normAddr(b.To)
	amt, err := ParseAmount(b.Amount)
	if !ok || err != nil {
		return fail("malformed", "bad recipient or amount")
	}
	// Test rupees are free: anyone may top themselves up by up to 1,000 tINR per tx;
	// the regulator may send any amount to anyone.
	if !s.IsAdmin(from) && (to != from || amt.Cmp(SelfFaucetMax) > 0) {
		return fail("unauthorized", "the faucet gives up to 1000 tINR to yourself")
	}
	a := s.Account(to)
	a.TINR = add(a.TINR, amt)
	r := Result{}
	c.emit(&r, "transfer", map[string]any{"token": "TINR", "from": "0x0000000000000000000000000000000000000000", "to": to, "amount": amt.String()})
	return r
}

// ---------------------------------------------------------------- miners and applications

func execApply(s *State, c *Ctx, from string, body json.RawMessage) Result {
	b, err := decode[ApplyMinerBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	if strings.TrimSpace(b.Name) == "" || b.PlantsPlanned < 1 || b.PlantsPlanned > 20 {
		return fail("malformed", "name and 1-20 planned plants are required")
	}
	id := s.NextApplication
	s.NextApplication++
	s.Applications[fmt.Sprint(id)] = &Application{ID: id, Applicant: from, Name: b.Name, Location: b.Location,
		PlantsPlanned: b.PlantsPlanned, Note: b.Note, Status: "pending", SubmittedAt: c.TimeMs}
	return Result{Log: fmt.Sprintf("application %d submitted", id), Amount: fmt.Sprint(id)}
}

func execApprove(s *State, c *Ctx, from string, body json.RawMessage) Result {
	if !s.IsAdmin(from) {
		return fail("unauthorized", "only the regulator can approve miners")
	}
	b, err := decode[ApproveMinerBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	var app *Application
	if b.ApplicationID != 0 {
		var ok bool
		app, ok = s.Applications[fmt.Sprint(b.ApplicationID)]
		if !ok || app.Status != "pending" {
			return fail("not_found", "no pending application %d", b.ApplicationID)
		}
	}
	m, res := NewMiner(s, b, c.TimeMs, c.TxHash)
	if res != nil {
		return *res
	}
	if app != nil {
		app.Status, app.MinerID, app.DecidedAt = "approved", m.MinerID, c.TimeMs
	}
	return Result{Log: fmt.Sprintf("miner %s registered", m.MinerID)}
}

// NewMiner validates and registers a miner (used by approve_miner and genesis).
func NewMiner(s *State, b *ApproveMinerBody, ts int64, txHash string) (*Miner, *Result) {
	if !minerIDRe.MatchString(b.MinerID) {
		r := fail("malformed", "bad miner_id")
		return nil, &r
	}
	if _, exists := s.Miners[b.MinerID]; exists {
		r := fail("malformed", "miner %s already exists", b.MinerID)
		return nil, &r
	}
	dev, ok1 := normAddr(b.DeviceAddress)
	owner, ok2 := normAddr(b.OwnerWallet)
	if !ok1 || !ok2 || len(b.StickerIDs) == 0 || len(b.StickerIDs) > 20 {
		r := fail("malformed", "device_address, owner_wallet and 1-20 sticker_ids are required")
		return nil, &r
	}
	for _, t := range b.StickerIDs {
		if other, ok := s.StickerOwner[StickerKey(t)]; ok {
			r := fail("sticker_claimed_by_other_miner", "Sticker %d is registered to %s", t, other)
			return nil, &r
		}
	}
	if b.Location.GeofenceM <= 0 {
		b.Location.GeofenceM = 50
	}
	if b.ValidatorPubKey != "" {
		if res := checkValidatorKey(s, b.ValidatorPubKey, ""); res != nil {
			return nil, res
		}
	}
	stickers := append([]int(nil), b.StickerIDs...)
	sort.Ints(stickers)
	packed := make([]byte, 0, 2*len(stickers))
	for _, t := range stickers {
		packed = append(packed, byte(t>>8), byte(t))
	}
	m := &Miner{MinerID: b.MinerID, Label: b.Label, DeviceAddress: dev, DevicePublicKey: b.DevicePublicKey,
		OwnerWallet: owner, StickerIDs: stickers, StickerSetHash: crypto.Hex(crypto.Keccak256(packed)),
		Location: b.Location, Status: "active", RegisteredAt: ts, RegistrationTx: txHash,
		ValidatorPubKey: b.ValidatorPubKey, Minted: "0", ProposerRewards: "0"}
	s.Miners[m.MinerID] = m
	for _, t := range stickers {
		s.StickerOwner[StickerKey(t)] = m.MinerID
	}
	return m, nil
}

func checkValidatorKey(s *State, key, self string) *Result {
	pk, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(pk) != 32 {
		r := fail("malformed", "validator_pubkey must be a base64 ed25519 public key")
		return &r
	}
	for id, o := range s.Miners {
		if id != self && o.ValidatorPubKey == key {
			r := fail("malformed", "validator key already used by %s", id)
			return &r
		}
	}
	return nil
}

func execReject(s *State, c *Ctx, from string, body json.RawMessage) Result {
	if !s.IsAdmin(from) {
		return fail("unauthorized", "only the regulator can reject applications")
	}
	b, err := decode[RejectApplicationBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	app, ok := s.Applications[fmt.Sprint(b.ApplicationID)]
	if !ok || app.Status != "pending" {
		return fail("not_found", "no pending application %d", b.ApplicationID)
	}
	app.Status, app.Reason, app.DecidedAt = "rejected", b.Reason, c.TimeMs
	return Result{}
}

func execSetStatus(s *State, c *Ctx, from string, body json.RawMessage) Result {
	if !s.IsAdmin(from) {
		return fail("unauthorized", "only the regulator can suspend miners")
	}
	b, err := decode[SetMinerStatusBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	m, ok := s.Miners[b.MinerID]
	if !ok || (b.Status != "active" && b.Status != "suspended") {
		return fail("not_found", "unknown miner or status")
	}
	m.Status = b.Status
	return Result{}
}

// execSetValidator lets a miner's owner (or the regulator) attach the node key of the
// Raspberry Pi that runs this miner, which makes it a block-producing validator.
func execSetValidator(s *State, c *Ctx, from string, body json.RawMessage) Result {
	b, err := decode[SetValidatorBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	m, ok := s.Miners[b.MinerID]
	if !ok {
		return fail("not_found", "unknown miner %s", b.MinerID)
	}
	if from != m.OwnerWallet && !s.IsAdmin(from) {
		return fail("unauthorized", "only the miner's owner or the regulator can set its validator key")
	}
	if res := checkValidatorKey(s, b.ValidatorPubKey, m.MinerID); res != nil {
		return *res
	}
	m.ValidatorPubKey = b.ValidatorPubKey
	return Result{}
}

func execSetObligation(s *State, c *Ctx, from string, body json.RawMessage) Result {
	if !s.IsAdmin(from) {
		return fail("unauthorized", "only the regulator can set obligations")
	}
	b, err := decode[SetObligationBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	company, ok := normAddr(b.Company)
	amt, err := ParseAmount(b.Amount)
	if !ok || err != nil || b.Period == "" {
		return fail("malformed", "company, period and amount are required")
	}
	key := ObligationKey(company, b.Period)
	ob, exists := s.Obligations[key]
	if !exists {
		ob = &Obligation{Company: company, Period: b.Period, Burned: "0"}
		s.Obligations[key] = ob
	}
	ob.CompanyName, ob.Amount = b.CompanyName, amt.String()
	return Result{}
}

// ---------------------------------------------------------------- marketplace (AIR for test INR)

func execList(s *State, c *Ctx, from string, body json.RawMessage) Result {
	b, err := decode[ListBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	amt, err1 := ParseAmount(b.AmountAIR)
	price, err2 := ParseAmount(b.PriceTINR)
	if err1 != nil || err2 != nil || amt.Sign() == 0 {
		return fail("malformed", "amount_air and price_tinr must be integer strings")
	}
	acct := s.Account(from)
	if Big(acct.AIR).Cmp(amt) < 0 {
		return fail("insufficient_funds", "not enough AIR to list")
	}
	acct.AIR = sub(acct.AIR, amt) // escrowed in the listing
	id := s.NextListing
	s.NextListing++
	s.Listings[fmt.Sprint(id)] = &Listing{ID: id, Seller: from, AmountAIR: amt.String(), PriceTINR: price.String(),
		Status: "open", CreatedAt: c.TimeMs}
	return Result{Log: fmt.Sprintf("listing %d open", id), Amount: fmt.Sprint(id)}
}

func execBuy(s *State, c *Ctx, from string, body json.RawMessage) Result {
	b, err := decode[ListingRefBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	l, ok := s.Listings[fmt.Sprint(b.ListingID)]
	if !ok || l.Status != "open" {
		return fail("not_found", "no open listing %d", b.ListingID)
	}
	if l.Seller == from {
		return fail("malformed", "cannot buy your own listing")
	}
	buyer, seller := s.Account(from), s.Account(l.Seller)
	price := Big(l.PriceTINR)
	if Big(buyer.TINR).Cmp(price) < 0 {
		return fail("insufficient_funds", "not enough tINR")
	}
	buyer.TINR, seller.TINR = sub(buyer.TINR, price), add(seller.TINR, price)
	buyer.AIR = add(buyer.AIR, Big(l.AmountAIR))
	l.Status, l.Buyer, l.ClosedAt = "sold", from, c.TimeMs
	r := Result{}
	c.emit(&r, "trade", map[string]any{"listing_id": l.ID, "seller": l.Seller, "buyer": from,
		"amount_air": l.AmountAIR, "price_tinr": l.PriceTINR})
	return r
}

func execCancel(s *State, c *Ctx, from string, body json.RawMessage) Result {
	b, err := decode[ListingRefBody](body)
	if err != nil {
		return fail("malformed", "%v", err)
	}
	l, ok := s.Listings[fmt.Sprint(b.ListingID)]
	if !ok || l.Status != "open" || l.Seller != from {
		return fail("not_found", "no open listing %d of yours", b.ListingID)
	}
	a := s.Account(from)
	a.AIR = add(a.AIR, Big(l.AmountAIR))
	l.Status, l.ClosedAt = "cancelled", c.TimeMs
	return Result{}
}
