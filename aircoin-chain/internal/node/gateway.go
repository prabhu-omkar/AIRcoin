package node

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	cmtlog "github.com/cometbft/cometbft/libs/log"
	cmtnode "github.com/cometbft/cometbft/node"
	"github.com/cometbft/cometbft/rpc/client/local"
	ctypes "github.com/cometbft/cometbft/rpc/core/types"
	"github.com/gorilla/websocket"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/chain"
)

// Gateway serves the C3/C4 API that miner-core, the twin and the marketplace already
// speak, straight from this node's copy of the chain. Every node runs one, so apps can
// talk to whichever miner is closest.
type Gateway struct {
	App    *App
	Client *local.Local
	Node   *cmtnode.Node
	Logger cmtlog.Logger
}

func (g *Gateway) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("POST /v1/attestations", g.postAttestation)
	m.HandleFunc("POST /v1/tx", g.postTx)
	m.HandleFunc("POST /v1/tx/prepare", g.prepareTx)
	m.HandleFunc("GET /v1/status", g.status)
	m.HandleFunc("GET /v1/params", g.params)
	m.HandleFunc("GET /v1/miners", g.miners)
	m.HandleFunc("GET /v1/miners/{id}", g.miner)
	m.HandleFunc("GET /v1/miners/{id}/balance", g.minerBalance)
	m.HandleFunc("GET /v1/miners/{id}/mints", g.minerMints)
	m.HandleFunc("GET /v1/accounts/{addr}", g.account)
	m.HandleFunc("GET /v1/balance/{addr}", g.account)
	m.HandleFunc("GET /v1/validators", g.validators)
	m.HandleFunc("GET /v1/applications", g.applications)
	m.HandleFunc("GET /v1/obligations", g.obligations)
	m.HandleFunc("GET /v1/listings", g.listings)
	m.HandleFunc("GET /v1/totals", g.totals)
	m.HandleFunc("GET /v1/events/recent", g.recentEvents)
	m.HandleFunc("GET /v1/events", g.events)
	m.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			writeErr(w, 404, "not_found", "no route "+r.URL.Path)
			return
		}
		writeJSON(w, 200, map[string]any{"name": "aircoind", "docs": "see aircoin-chain/README.md", "status": "/v1/status"})
	})
	return cors(m)
}

// ------------------------------------------------------------------ writes

const maxBody = 1 << 20

func (g *Gateway) postAttestation(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
	if err != nil {
		writeErr(w, 400, "bad_request", err.Error())
		return
	}
	var hdr struct {
		MinerID string `json:"miner_id"`
		Epoch   int64  `json:"epoch"`
	}
	if err := json.Unmarshal(raw, &hdr); err != nil || hdr.MinerID == "" {
		writeErr(w, 400, "malformed", "body must be a C3 attestation JSON object")
		return
	}
	reject := func(status int, code, reason string) {
		writeJSON(w, status, map[string]any{"v": 1, "miner_id": hdr.MinerID, "epoch": hdr.Epoch,
			"status": "rejected", "reason_code": code, "reason": reason})
	}
	if s := g.App.View(); s != nil && s.Minted[chain.MintedKey(hdr.MinerID, hdr.Epoch)] {
		reject(409, "epoch_already_minted", "epoch "+strconv.FormatInt(hdr.Epoch, 10)+" is already minted for "+hdr.MinerID)
		return
	}
	tx, err := json.Marshal(chain.Tx{Type: "attest", Body: raw})
	if err != nil {
		reject(422, "malformed", err.Error())
		return
	}
	hash := chain.TxHash(tx)
	res, err := g.broadcast(r.Context(), tx)
	switch {
	case errors.Is(err, errPending):
		writeJSON(w, 200, map[string]any{"v": 1, "miner_id": hdr.MinerID, "epoch": hdr.Epoch, "status": "pending", "tx_hash": hash})
		return
	case err != nil:
		reject(503, "chain_error", err.Error())
		return
	}
	code, reason, log := res.CheckTx.Code, res.CheckTx.Info, res.CheckTx.Log
	if code == 0 {
		code, reason, log = res.TxResult.Code, res.TxResult.Info, res.TxResult.Log
	}
	if code != 0 {
		status := 422
		if reason == "epoch_already_minted" {
			status = 409
		}
		if reason == "" {
			reason = "chain_error"
		}
		reject(status, reason, log)
		return
	}
	var data struct {
		Amount string `json:"amount"`
	}
	_ = json.Unmarshal(res.TxResult.Data, &data)
	writeJSON(w, 200, map[string]any{"v": 1, "miner_id": hdr.MinerID, "epoch": hdr.Epoch, "status": "accepted",
		"tx_hash": hash, "amount": data.Amount})
}

// postTx takes a signed envelope {type, body, sig} and waits for it to be committed.
func (g *Gateway) postTx(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
	if err != nil {
		writeErr(w, 400, "bad_request", err.Error())
		return
	}
	var t chain.Tx
	if err := json.Unmarshal(raw, &t); err != nil {
		writeErr(w, 400, "malformed", "body must be {type, body, sig}")
		return
	}
	tx, _ := json.Marshal(t) // compact, so the hash does not depend on whitespace
	hash := chain.TxHash(tx)
	res, err := g.broadcast(r.Context(), tx)
	if errors.Is(err, errPending) {
		writeJSON(w, 202, map[string]any{"tx_hash": hash, "status": "pending"})
		return
	}
	if err != nil {
		writeErr(w, 503, "chain_error", err.Error())
		return
	}
	out := map[string]any{"tx_hash": hash, "height": res.Height}
	if res.CheckTx.Code != 0 {
		out["status"], out["reason_code"], out["log"] = "rejected", res.CheckTx.Info, res.CheckTx.Log
		writeJSON(w, 422, out)
		return
	}
	if res.TxResult.Code != 0 {
		out["status"], out["reason_code"], out["log"] = "failed", res.TxResult.Info, res.TxResult.Log
		writeJSON(w, 422, out)
		return
	}
	out["status"] = "committed"
	writeJSON(w, 200, out)
}

// prepareTx returns the exact text a wallet must personal_sign for {type, body}, so a
// browser with MetaMask can sign transactions without a JCS library.
func (g *Gateway) prepareTx(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type string          `json:"type"`
		Body json.RawMessage `json:"body"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBody)).Decode(&req); err != nil || req.Type == "" {
		writeErr(w, 400, "malformed", "body must be {type, body}")
		return
	}
	s := g.App.View()
	msg, err := chain.SignBytes(s.ChainID, req.Type, req.Body)
	if err != nil {
		writeErr(w, 400, "malformed", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"chain_id": s.ChainID, "message": string(msg)})
}

var errPending = errors.New("pending")

func (g *Gateway) broadcast(ctx context.Context, tx []byte) (*ctypes.ResultBroadcastTxCommit, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	res, err := g.Client.BroadcastTxCommit(ctx, tx)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "timed out") || strings.Contains(msg, "already exists in cache") ||
			errors.Is(err, context.DeadlineExceeded) {
			return nil, errPending
		}
		return nil, err
	}
	return res, nil
}

// ------------------------------------------------------------------ reads (C4)

func (g *Gateway) state(w http.ResponseWriter) *chain.State {
	s := g.App.View()
	if s == nil {
		writeErr(w, 503, "chain_error", "chain not initialised yet")
	}
	return s
}

func (g *Gateway) findMiner(w http.ResponseWriter, r *http.Request) (*chain.State, *chain.Miner) {
	s := g.state(w)
	if s == nil {
		return nil, nil
	}
	id := r.PathValue("id")
	m := s.Miners[id]
	if m == nil {
		writeErr(w, 404, "miner_not_found", "No miner with id "+id)
		return nil, nil
	}
	return s, m
}

// MinerC4 renders a miner exactly as the c4-chain-api "miner" schema expects.
func MinerC4(m *chain.Miner) map[string]any {
	loc := map[string]any{"lat": m.Location.Lat, "lon": m.Location.Lon, "geofence_m": m.Location.GeofenceM}
	gh := m.Location.Geohash
	if gh == "" {
		gh = Geohash(m.Location.Lat, m.Location.Lon, 9)
	}
	loc["geohash"] = gh
	if m.Location.Label != "" {
		loc["label"] = m.Location.Label
	} else if m.Label != "" {
		loc["label"] = m.Label
	}
	return map[string]any{
		"v": 1, "miner_id": m.MinerID, "device_address": m.DeviceAddress, "owner_wallet": m.OwnerWallet,
		"sticker_ids": m.StickerIDs, "sticker_set_hash": m.StickerSetHash, "status": m.Status,
		"location": loc, "registered_at": m.RegisteredAt,
		"totals": map[string]any{"minted": m.Minted, "epochs_minted": m.EpochsMinted,
			"epochs_rejected": m.EpochsRejected, "last_mint_epoch": m.LastMintEpoch},
	}
}

func (g *Gateway) miner(w http.ResponseWriter, r *http.Request) {
	if _, m := g.findMiner(w, r); m != nil {
		writeJSON(w, 200, MinerC4(m))
	}
}

func (g *Gateway) minerBalance(w http.ResponseWriter, r *http.Request) {
	s, m := g.findMiner(w, r)
	if m == nil {
		return
	}
	a := s.PeekAccount(m.OwnerWallet)
	writeJSON(w, 200, map[string]any{"v": 1, "miner_id": m.MinerID, "address": m.OwnerWallet,
		"air": a.AIR, "tinr": a.TINR, "block_number": s.Height})
}

func (g *Gateway) minerMints(w http.ResponseWriter, r *http.Request) {
	_, m := g.findMiner(w, r)
	if m == nil {
		return
	}
	limit := 50
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 500 {
		limit = v
	}
	before := int64(-1)
	if v, err := strconv.ParseInt(r.URL.Query().Get("before_epoch"), 10, 64); err == nil {
		before = v
	}
	items := []chain.MintRecord{}
	for i := len(m.Mints) - 1; i >= 0; i-- { // newest first
		if before >= 0 && m.Mints[i].Epoch >= before {
			continue
		}
		items = append(items, m.Mints[i])
		if len(items) > limit {
			break
		}
	}
	out := map[string]any{"v": 1, "miner_id": m.MinerID}
	if len(items) > limit {
		items = items[:limit]
		out["next_before_epoch"] = items[len(items)-1].Epoch
	}
	out["items"] = items
	writeJSON(w, 200, out)
}

func (g *Gateway) account(w http.ResponseWriter, r *http.Request) {
	s := g.state(w)
	if s == nil {
		return
	}
	addr := strings.ToLower(r.PathValue("addr"))
	a := s.PeekAccount(addr)
	owns := []string{}
	for id, m := range s.Miners {
		if m.OwnerWallet == addr {
			owns = append(owns, id)
		}
	}
	sort.Strings(owns)
	writeJSON(w, 200, map[string]any{"v": 1, "address": addr, "air": a.AIR, "tinr": a.TINR, "nonce": a.Nonce,
		"is_admin": s.IsAdmin(addr), "miners": owns, "block_number": s.Height})
}

func (g *Gateway) miners(w http.ResponseWriter, _ *http.Request) {
	s := g.state(w)
	if s == nil {
		return
	}
	ids := make([]string, 0, len(s.Miners))
	for id := range s.Miners {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	items := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		m := s.Miners[id]
		row := MinerC4(m)
		row["node"] = map[string]any{"validator_pubkey": m.ValidatorPubKey, "validator_address": chain.ValidatorAddress(m.ValidatorPubKey),
			"power": m.Power, "blocks_proposed": m.BlocksProposed, "proposer_rewards": m.ProposerRewards}
		items = append(items, row)
	}
	writeJSON(w, 200, map[string]any{"v": 1, "items": items, "block_number": s.Height})
}

func (g *Gateway) validators(w http.ResponseWriter, r *http.Request) {
	s := g.state(w)
	if s == nil {
		return
	}
	res, err := g.Client.Validators(r.Context(), nil, nil, nil)
	if err != nil {
		writeErr(w, 503, "chain_error", err.Error())
		return
	}
	byAddr := map[string]*chain.Miner{}
	for _, m := range s.Miners {
		if m.ValidatorPubKey != "" {
			byAddr[chain.ValidatorAddress(m.ValidatorPubKey)] = m
		}
	}
	items := []map[string]any{}
	for _, v := range res.Validators {
		addr := strings.ToUpper(v.Address.String())
		row := map[string]any{"address": addr, "power": v.VotingPower, "proposer_priority": v.ProposerPriority}
		if m := byAddr[addr]; m != nil {
			row["miner_id"], row["owner_wallet"], row["blocks_proposed"] = m.MinerID, m.OwnerWallet, m.BlocksProposed
		}
		items = append(items, row)
	}
	writeJSON(w, 200, map[string]any{"v": 1, "height": res.BlockHeight, "items": items})
}

func (g *Gateway) status(w http.ResponseWriter, r *http.Request) {
	s := g.state(w)
	if s == nil {
		return
	}
	st, err := g.Client.Status(r.Context())
	if err != nil {
		writeErr(w, 503, "chain_error", err.Error())
		return
	}
	ni, _ := g.Client.NetInfo(r.Context())
	peers := 0
	if ni != nil {
		peers = ni.NPeers
	}
	var self string
	if m := chain.ProposerMiner(s, st.ValidatorInfo.Address); m != nil {
		self = m.MinerID
	}
	writeJSON(w, 200, map[string]any{
		"chain_id": s.ChainID, "height": s.Height, "block_time": s.LastBlockTimeMs,
		"app_hash": strings.ToLower(st.SyncInfo.LatestAppHash.String()),
		"catching_up": st.SyncInfo.CatchingUp, "peers": peers,
		"node_id": string(st.NodeInfo.DefaultNodeID), "moniker": st.NodeInfo.Moniker,
		"validator": map[string]any{"address": st.ValidatorInfo.Address.String(), "power": st.ValidatorInfo.VotingPower, "miner_id": self},
		"epoch": time.Now().UnixMilli() / s.Params.EpochMs,
	})
}

func (g *Gateway) params(w http.ResponseWriter, _ *http.Request) {
	if s := g.state(w); s != nil {
		writeJSON(w, 200, map[string]any{"chain_id": s.ChainID, "params": s.Params, "admins": s.Admins})
	}
}

func (g *Gateway) applications(w http.ResponseWriter, r *http.Request) {
	s := g.state(w)
	if s == nil {
		return
	}
	status := r.URL.Query().Get("status")
	items := []*chain.Application{}
	for _, a := range s.Applications {
		if status == "" || a.Status == status {
			items = append(items, a)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	writeJSON(w, 200, map[string]any{"v": 1, "items": items})
}

func (g *Gateway) obligations(w http.ResponseWriter, _ *http.Request) {
	s := g.state(w)
	if s == nil {
		return
	}
	items := []*chain.Obligation{}
	for _, o := range s.Obligations {
		items = append(items, o)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Company+items[i].Period < items[j].Company+items[j].Period })
	writeJSON(w, 200, map[string]any{"v": 1, "items": items})
}

func (g *Gateway) listings(w http.ResponseWriter, r *http.Request) {
	s := g.state(w)
	if s == nil {
		return
	}
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "open"
	}
	items := []*chain.Listing{}
	for _, l := range s.Listings {
		if status == "all" || l.Status == status {
			items = append(items, l)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	writeJSON(w, 200, map[string]any{"v": 1, "items": items})
}

func (g *Gateway) totals(w http.ResponseWriter, _ *http.Request) {
	s := g.state(w)
	if s == nil {
		return
	}
	active := 0
	for _, m := range s.Miners {
		if m.Status == "active" {
			active++
		}
	}
	open := 0
	for _, l := range s.Listings {
		if l.Status == "open" {
			open++
		}
	}
	pending := 0
	for _, a := range s.Applications {
		if a.Status == "pending" {
			pending++
		}
	}
	circ := chain.Big(s.Supply.Minted)
	circ.Sub(circ, chain.Big(s.Supply.Burned))
	writeJSON(w, 200, map[string]any{"v": 1, "block_number": s.Height, "minted": s.Supply.Minted, "burned": s.Supply.Burned,
		"circulating": circ.String(), "miners": len(s.Miners), "active_miners": active, "open_listings": open,
		"pending_applications": pending, "accounts": len(s.Accounts)})
}

// ------------------------------------------------------------------ events

func (g *Gateway) recentEvents(w http.ResponseWriter, r *http.Request) {
	n, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if n <= 0 || n > 1000 {
		n = 100
	}
	f := g.filter(r)
	all := g.App.Events.Recent(0)
	items := []chain.Event{}
	for i := len(all) - 1; i >= 0 && len(items) < n; i-- {
		if f(all[i]) {
			items = append(items, all[i])
		}
	}
	writeJSON(w, 200, map[string]any{"v": 1, "items": items})
}

var upgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

func (g *Gateway) events(w http.ResponseWriter, r *http.Request) {
	if !websocket.IsWebSocketUpgrade(r) {
		g.recentEvents(w, r)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	f := g.filter(r)
	ch := g.App.Events.Subscribe()
	defer g.App.Events.Unsubscribe(ch)
	done := make(chan struct{})
	go func() { // drain reads so close frames are noticed
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
	ping := time.NewTicker(30 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-done:
			return
		case e := <-ch:
			if !f(e) {
				continue
			}
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteJSON(e); err != nil {
				return
			}
		case <-ping.C:
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

var addrKeys = []string{"from", "to", "seller", "buyer", "company"}

// filter matches ?miner_id= (its mints plus anything touching its owner wallet) and
// ?address= (anything touching that address).
func (g *Gateway) filter(r *http.Request) func(chain.Event) bool {
	minerID := r.URL.Query().Get("miner_id")
	addr := strings.ToLower(r.URL.Query().Get("address"))
	if minerID != "" && addr == "" {
		if s := g.App.View(); s != nil && s.Miners[minerID] != nil {
			addr = s.Miners[minerID].OwnerWallet
		}
	}
	return func(e chain.Event) bool {
		if minerID == "" && addr == "" {
			return true
		}
		if minerID != "" && e.Data["miner_id"] == minerID {
			return true
		}
		if addr != "" {
			for _, k := range addrKeys {
				if v, ok := e.Data[k].(string); ok && strings.EqualFold(v, addr) {
					return true
				}
			}
		}
		return false
	}
}

// ------------------------------------------------------------------ helpers

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": msg}})
}

func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		h.ServeHTTP(w, r)
	})
}

const ghAlphabet = "0123456789bcdefghjkmnpqrstuvwxyz"

// Geohash encodes lat/lon (standard base32 geohash).
func Geohash(lat, lon float64, precision int) string {
	latR, lonR := [2]float64{-90, 90}, [2]float64{-180, 180}
	var out []byte
	bit, ch, even := 0, 0, true
	for len(out) < precision {
		if even {
			mid := (lonR[0] + lonR[1]) / 2
			if lon >= mid {
				ch |= 1 << (4 - bit)
				lonR[0] = mid
			} else {
				lonR[1] = mid
			}
		} else {
			mid := (latR[0] + latR[1]) / 2
			if lat >= mid {
				ch |= 1 << (4 - bit)
				latR[0] = mid
			} else {
				latR[1] = mid
			}
		}
		even = !even
		if bit < 4 {
			bit++
		} else {
			out = append(out, ghAlphabet[ch])
			bit, ch = 0, 0
		}
	}
	return string(out)
}
