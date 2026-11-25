// Package node runs an AIRcoin node: the chain application inside an in-process
// CometBFT consensus engine, plus the HTTP gateway.
package node

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"sync"
	"time"

	abci "github.com/cometbft/cometbft/abci/types"
	cmtlog "github.com/cometbft/cometbft/libs/log"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/chain"
)

// App is the CometBFT application. CometBFT decides the order of blocks; App decides
// what each block means. CometBFT's local client serialises every call into App, so
// only the gateway's reads need the lock.
type App struct {
	abci.BaseApplication

	file   string
	logger cmtlog.Logger
	Events *EventLog

	mu        sync.RWMutex
	committed *chain.State
	hash      []byte

	check   *chain.State // mempool view: committed + pending txs
	working *chain.State // the block being finalised
	pending []chain.Event
}

type savedState struct {
	State   *chain.State `json:"state"`
	AppHash string       `json:"app_hash"`
}

// NewApp loads saved state from <home>/data/aircoin_state.json, if any.
func NewApp(home string, logger cmtlog.Logger) (*App, error) {
	a := &App{file: filepath.Join(home, "data", "aircoin_state.json"), logger: logger, Events: NewEventLog(5000)}
	b, err := os.ReadFile(a.file)
	if err == nil {
		var s savedState
		if err := json.Unmarshal(b, &s); err != nil {
			return nil, fmt.Errorf("read %s: %w", a.file, err)
		}
		a.committed = s.State
		a.hash, _ = hex.DecodeString(s.AppHash)
		a.check = a.committed.Clone()
		logger.Info("loaded AIRcoin state", "height", s.State.Height)
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	return a, nil
}

// View returns the last committed state. Callers must not modify it.
func (a *App) View() *chain.State {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.committed
}

func (a *App) Info(_ context.Context, _ *abci.RequestInfo) (*abci.ResponseInfo, error) {
	res := &abci.ResponseInfo{Data: "aircoin", Version: "0.1.0", AppVersion: 1}
	if a.committed != nil {
		res.LastBlockHeight = a.committed.Height
		res.LastBlockAppHash = a.hash
	}
	return res, nil
}

func (a *App) InitChain(_ context.Context, req *abci.RequestInitChain) (*abci.ResponseInitChain, error) {
	var g chain.GenesisState
	if len(req.AppStateBytes) > 0 {
		if err := json.Unmarshal(req.AppStateBytes, &g); err != nil {
			return nil, fmt.Errorf("app_state: %w", err)
		}
	}
	s, err := chain.BuildState(req.ChainId, g, req.Time.UnixMilli())
	if err != nil {
		return nil, err
	}
	// Record the genesis validators' power on their miners.
	for _, v := range req.Validators {
		for _, m := range s.Miners {
			if m.ValidatorPubKey != "" && base64Eq(m.ValidatorPubKey, v.PubKey.GetEd25519()) {
				m.Power = v.Power
			}
		}
	}
	a.mu.Lock()
	a.committed, a.hash = s, s.Hash()
	a.mu.Unlock()
	a.check = s.Clone()
	return &abci.ResponseInitChain{AppHash: a.hash}, nil
}

func (a *App) CheckTx(_ context.Context, req *abci.RequestCheckTx) (*abci.ResponseCheckTx, error) {
	if a.check == nil {
		return &abci.ResponseCheckTx{Code: 1, Log: "chain not initialised"}, nil
	}
	ctx := &chain.Ctx{Height: a.check.Height + 1, TimeMs: time.Now().UnixMilli(), TxHash: chain.TxHash(req.Tx),
		MintedInBlock: new(big.Int), LogIndexStart: 0}
	// Run on a copy so a refused tx (which never enters the mempool) leaves no trace,
	// not even a nonce bump.
	trial := a.check.Clone()
	r := chain.Exec(trial, ctx, req.Tx)
	if r.Code == 0 || r.Recorded {
		a.check = trial
	}
	if r.Recorded { // let it into a block so the rejection is on the record everywhere
		return &abci.ResponseCheckTx{Code: 0, Log: r.Log, Info: r.ReasonCode}, nil
	}
	return &abci.ResponseCheckTx{Code: r.Code, Log: r.Log, Info: r.ReasonCode, Codespace: codespace(r)}, nil
}

func (a *App) FinalizeBlock(_ context.Context, req *abci.RequestFinalizeBlock) (*abci.ResponseFinalizeBlock, error) {
	a.working = a.committed.Clone()
	timeMs := req.Time.UnixMilli()
	minted := new(big.Int)
	logIndex := 0
	a.pending = nil
	results := make([]*abci.ExecTxResult, len(req.Txs))
	for i, tx := range req.Txs {
		ctx := &chain.Ctx{Height: req.Height, TimeMs: timeMs, TxHash: chain.TxHash(tx), MintedInBlock: minted, LogIndexStart: logIndex}
		r := chain.Exec(a.working, ctx, tx)
		logIndex = ctx.NextLogIndex()
		data, _ := json.Marshal(map[string]string{"amount": r.Amount, "reason_code": r.ReasonCode})
		results[i] = &abci.ExecTxResult{Code: r.Code, Log: r.Log, Info: r.ReasonCode, Data: data, Codespace: codespace(r)}
		a.pending = append(a.pending, r.Events...)
		a.working.Record(r.Events)
	}
	chain.PayProposer(a.working, req.ProposerAddress, minted)
	var vu []abci.ValidatorUpdate
	for _, u := range chain.UpdatePowers(a.working, timeMs) {
		vu = append(vu, abci.Ed25519ValidatorUpdate(u.PubKey, u.Power))
	}
	a.working.Height = req.Height
	a.working.LastBlockTimeMs = timeMs
	return &abci.ResponseFinalizeBlock{TxResults: results, ValidatorUpdates: vu, AppHash: a.working.Hash()}, nil
}

func (a *App) Commit(_ context.Context, _ *abci.RequestCommit) (*abci.ResponseCommit, error) {
	a.mu.Lock()
	a.committed, a.hash = a.working, a.working.Hash()
	a.mu.Unlock()
	a.working = nil
	if err := a.save(); err != nil {
		return nil, err
	}
	a.check = a.committed.Clone()
	for _, e := range a.pending {
		a.Events.Publish(e)
	}
	a.pending = nil
	return &abci.ResponseCommit{}, nil
}

func (a *App) Query(_ context.Context, req *abci.RequestQuery) (*abci.ResponseQuery, error) {
	s := a.View()
	if s == nil {
		return &abci.ResponseQuery{Code: 1, Log: "not initialised"}, nil
	}
	switch req.Path {
	case "/state":
		b, _ := json.Marshal(s)
		return &abci.ResponseQuery{Value: b, Height: s.Height}, nil
	}
	return &abci.ResponseQuery{Code: 1, Log: "unknown path; use the HTTP gateway"}, nil
}

func (a *App) save() error {
	b, err := json.Marshal(savedState{State: a.committed, AppHash: hex.EncodeToString(a.hash)})
	if err != nil {
		return err
	}
	tmp := a.file + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, a.file)
}

func codespace(r chain.Result) string {
	if r.Code == 0 {
		return ""
	}
	return "aircoin"
}
