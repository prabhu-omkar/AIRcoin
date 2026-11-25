package chain

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"strings"
	"testing"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/crypto"
)

type fixture struct {
	s                     *State
	admin, owner, company *crypto.Key
	device                *crypto.Key
	height                int64
	now                   int64
}

const epochMs = 60000

func newFixture(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{now: 1_800_000_000_000}
	f.admin, _ = crypto.NewKey()
	f.owner, _ = crypto.NewKey()
	f.company, _ = crypto.NewKey()
	f.device, _ = crypto.NewKey()
	stickers := make([]int, 20)
	for i := range stickers {
		stickers[i] = i
	}
	g := GenesisState{
		Admins:   []string{f.admin.Address()},
		Accounts: map[string]*Account{f.company.Address(): {AIR: "0", TINR: "1000000000000000000000"}},
		Miners: []ApproveMinerBody{{MinerID: "miner-001", DeviceAddress: f.device.Address(), OwnerWallet: f.owner.Address(),
			StickerIDs: stickers, ValidatorPubKey: base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32)),
			Location: Location{Lat: 12.9716, Lon: 77.5946, GeofenceM: 50}}},
		Obligations: []Obligation{{Company: f.company.Address(), CompanyName: "Demo Steel", Period: "2026", Amount: "5000000000000000000"}},
	}
	s, err := BuildState("test-1", g, f.now)
	if err != nil {
		t.Fatal(err)
	}
	f.s = s
	return f
}

func (f *fixture) ctx() *Ctx {
	f.height++
	return &Ctx{Height: f.height, TimeMs: f.now, TxHash: "0xtest", MintedInBlock: new(big.Int)}
}

func attestation(minerID string, epoch int64, tags []int, air float64, lat float64) map[string]any {
	plants := []any{}
	micro := int64(0)
	for _, t := range tags {
		plants = append(plants, map[string]any{"tag_id": t, "species": "neem", "status": "present", "air": air})
		micro += int64(air*1e6 + 0.5)
	}
	start := epoch * epochMs
	return map[string]any{"v": 1, "miner_id": minerID, "epoch": epoch, "start": start, "end": start + epochMs,
		"gps": map[string]any{"lat": lat, "lon": 77.5946}, "plants": plants,
		"amount":           new(big.Int).Mul(big.NewInt(micro), big.NewInt(1e12)).String(),
		"calibration_hash": "0x" + strings.Repeat("0", 64)}
}

func (f *fixture) attest(t *testing.T, signer *crypto.Key, att map[string]any) Result {
	t.Helper()
	signed, err := SignAttestation(signer, att)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(signed)
	tx, _ := json.Marshal(Tx{Type: "attest", Body: body})
	return Exec(f.s, f.ctx(), tx)
}

func (f *fixture) send(t *testing.T, k *crypto.Key, typ string, body map[string]any) Result {
	t.Helper()
	body["from"], body["nonce"] = k.Address(), f.s.PeekAccount(k.Address()).Nonce
	tx, err := Sign(k, f.s.ChainID, typ, body)
	if err != nil {
		t.Fatal(err)
	}
	return Exec(f.s, f.ctx(), tx)
}

func tags(n int) []int {
	out := make([]int, n)
	for i := range out {
		out[i] = i
	}
	return out
}

func TestAttestationRules(t *testing.T) {
	f := newFixture(t)
	closed := f.now/epochMs - 2

	cases := []struct {
		name   string
		signer *crypto.Key
		att    map[string]any
		want   string
	}{
		{"wrong key", f.owner, attestation("miner-001", closed, tags(20), 0.0015, 12.9716), "bad_signature"},
		{"unknown miner", f.device, attestation("miner-999", closed, tags(20), 0.0015, 12.9716), "unknown_miner"},
		{"outside geofence", f.device, attestation("miner-001", closed, tags(20), 0.0015, 12.99), "gps_outside_geofence"},
		{"foreign sticker", f.device, attestation("miner-001", closed, []int{25}, 0.0015, 12.9716), "sticker_not_registered"},
		{"plant over cap", f.device, attestation("miner-001", closed, tags(3), 0.02, 12.9716), "amount_over_cap"},
		{"future epoch", f.device, attestation("miner-001", f.now/epochMs+2, tags(20), 0.0015, 12.9716), "epoch_not_closed"},
		{"too old", f.device, attestation("miner-001", closed-50, tags(20), 0.0015, 12.9716), "malformed"},
	}
	for _, c := range cases {
		if r := f.attest(t, c.signer, c.att); r.ReasonCode != c.want {
			t.Errorf("%s: got %q (%s), want %q", c.name, r.ReasonCode, r.Log, c.want)
		}
	}

	// Inflated amount: the plants add up to less than claimed.
	a := attestation("miner-001", closed, tags(20), 0.0015, 12.9716)
	a["amount"] = "100000000000000000"
	if r := f.attest(t, f.device, a); r.ReasonCode != "amount_over_cap" {
		t.Errorf("inflated amount: got %q", r.ReasonCode)
	}

	// Honest proof mints to the owner, once.
	r := f.attest(t, f.device, attestation("miner-001", closed, tags(20), 0.0015, 12.9716))
	if r.Code != 0 || r.Amount != "30000000000000000" {
		t.Fatalf("honest: %+v", r)
	}
	if got := f.s.PeekAccount(f.owner.Address()).AIR; got != "30000000000000000" {
		t.Fatalf("owner balance %s", got)
	}
	if r := f.attest(t, f.device, attestation("miner-001", closed, tags(20), 0.0015, 12.9716)); r.ReasonCode != "epoch_already_minted" {
		t.Errorf("replay: got %q", r.ReasonCode)
	}
	m := f.s.Miners["miner-001"]
	// Device-signed cheats are recorded (geofence, sticker, cap, future, old, inflated);
	// unsigned junk and retries are not.
	if m.EpochsMinted != 1 || m.EpochsRejected != 6 || len(m.Rejections) != 6 {
		t.Errorf("totals: minted %d rejected %d log %d", m.EpochsMinted, m.EpochsRejected, len(m.Rejections))
	}
	if m.Rejections[0].ReasonCode != "gps_outside_geofence" {
		t.Errorf("first rejection %+v", m.Rejections[0])
	}
}

func TestMarketAndBurn(t *testing.T) {
	f := newFixture(t)
	f.attest(t, f.device, attestation("miner-001", f.now/epochMs-1, tags(20), 0.0015, 12.9716))

	if r := f.send(t, f.owner, "list", map[string]any{"amount_air": "20000000000000000", "price_tinr": "3000000000000000000"}); r.Code != 0 {
		t.Fatalf("list: %+v", r)
	}
	if r := f.send(t, f.company, "buy", map[string]any{"listing_id": 1}); r.Code != 0 {
		t.Fatalf("buy: %+v", r)
	}
	if got := f.s.PeekAccount(f.owner.Address()).TINR; got != "3000000000000000000" {
		t.Errorf("seller tINR %s", got)
	}
	if r := f.send(t, f.company, "burn", map[string]any{"amount": "20000000000000000", "period": "2026"}); r.Code != 0 {
		t.Fatalf("burn: %+v", r)
	}
	o := f.s.Obligations[ObligationKey(f.company.Address(), "2026")]
	if o.Burned != "20000000000000000" || f.s.Supply.Burned != "20000000000000000" {
		t.Errorf("burned %s supply %s", o.Burned, f.s.Supply.Burned)
	}
	if r := f.send(t, f.company, "burn", map[string]any{"amount": "1"}); r.ReasonCode != "insufficient_funds" {
		t.Errorf("overburn: %q", r.ReasonCode)
	}
	if r := f.send(t, f.owner, "faucet", map[string]any{"to": f.owner.Address(), "amount": "1000000000000000000000"}); r.Code != 0 {
		t.Errorf("self faucet: %+v", r)
	}
	if r := f.send(t, f.owner, "faucet", map[string]any{"to": f.owner.Address(), "amount": "1000000000000000000001"}); r.Code == 0 {
		t.Error("over-cap self faucet succeeded")
	}
	if r := f.send(t, f.owner, "faucet", map[string]any{"to": f.company.Address(), "amount": "1"}); r.Code == 0 {
		t.Error("non-admin faucet to someone else succeeded")
	}
}

func TestReplayedSignedTxFails(t *testing.T) {
	f := newFixture(t)
	body := map[string]any{"from": f.admin.Address(), "nonce": 0, "to": f.company.Address(), "amount": "5"}
	tx, _ := Sign(f.admin, f.s.ChainID, "faucet", body)
	if r := Exec(f.s, f.ctx(), tx); r.Code != 0 {
		t.Fatalf("first: %+v", r)
	}
	if r := Exec(f.s, f.ctx(), tx); r.ReasonCode != "bad_nonce" {
		t.Fatalf("replay: %q", r.ReasonCode)
	}
	other, _ := BuildState("other-chain", GenesisState{Admins: []string{f.admin.Address()}}, 0)
	if r := Exec(other, f.ctx(), tx); r.ReasonCode != "bad_signature" {
		t.Fatalf("cross-chain replay: %q", r.ReasonCode)
	}
}

// Two nodes that apply the same txs must end with byte-identical state.
func TestDeterministicHash(t *testing.T) {
	f := newFixture(t)
	other := f.s.Clone()
	att, _ := SignAttestation(f.device, attestation("miner-001", f.now/epochMs-1, tags(20), 0.0015, 12.9716))
	body, _ := json.Marshal(att)
	tx, _ := json.Marshal(Tx{Type: "attest", Body: body})
	for _, s := range []*State{f.s, other} {
		c := &Ctx{Height: 5, TimeMs: f.now, TxHash: TxHash(tx), MintedInBlock: new(big.Int)}
		Exec(s, c, tx)
		PayProposer(s, []byte{1}, c.MintedInBlock)
		UpdatePowers(s, f.now)
	}
	if !bytes.Equal(f.s.Hash(), other.Hash()) {
		t.Fatal("state hashes differ")
	}
}

func TestPowerBoost(t *testing.T) {
	f := newFixture(t)
	m := f.s.Miners["miner-001"]
	m.Power = 10
	base := f.now/epochMs - 100
	for i := int64(0); i < 90; i++ {
		m.RecentEpochs = append(m.RecentEpochs, base+i)
	}
	ups := UpdatePowers(f.s, f.now)
	if len(ups) != 1 || ups[0].Power != 11 {
		t.Fatalf("90 epochs → power 11, got %+v", ups)
	}
	m.Status = "suspended"
	if ups := UpdatePowers(f.s, f.now); len(ups) != 0 {
		t.Fatalf("last validator must not be removed, got %+v", ups)
	}
}
