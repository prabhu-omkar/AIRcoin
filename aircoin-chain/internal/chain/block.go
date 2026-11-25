package chain

import (
	"crypto/sha256"
	"encoding/base64"
	"math/big"
	"sort"
	"strings"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/crypto"
)

// ValidatorAddress is CometBFT's address for an ed25519 key: the first 20 bytes of sha256(pubkey).
func ValidatorAddress(pubB64 string) string {
	pk, err := base64.StdEncoding.DecodeString(pubB64)
	if err != nil {
		return ""
	}
	h := sha256.Sum256(pk)
	return strings.ToUpper(crypto.Hex(h[:20])[2:])
}

// ProposerMiner finds the miner whose node proposed a block.
func ProposerMiner(s *State, proposer []byte) *Miner {
	want := strings.ToUpper(crypto.Hex(proposer)[2:])
	for _, m := range s.Miners {
		if m.ValidatorPubKey != "" && ValidatorAddress(m.ValidatorPubKey) == want {
			return m
		}
	}
	return nil
}

// PayProposer is the block reward: a share of the AIR minted from verified plant work in
// this block, paid to the owner of the miner that proposed it. Empty blocks pay nothing,
// so block producers earn only by carrying useful work.
func PayProposer(s *State, proposer []byte, mintedInBlock *big.Int) {
	m := ProposerMiner(s, proposer)
	if m == nil {
		return
	}
	m.BlocksProposed++
	if mintedInBlock.Sign() == 0 || s.Params.ProposerRewardBps <= 0 {
		return
	}
	reward := new(big.Int).Mul(mintedInBlock, big.NewInt(s.Params.ProposerRewardBps))
	reward.Div(reward, big.NewInt(10_000))
	if reward.Sign() == 0 {
		return
	}
	a := s.Account(m.OwnerWallet)
	a.AIR = add(a.AIR, reward)
	s.Supply.Minted = add(s.Supply.Minted, reward)
	m.ProposerRewards = add(m.ProposerRewards, reward)
}

// ValidatorUpdate is a voting-power change for CometBFT.
type ValidatorUpdate struct {
	PubKey []byte
	Power  int64
}

// UpdatePowers recomputes every miner-validator's voting power:
// base power for an active miner, plus a capped boost for verified plant work in the last
// window. Useful work can raise a miner's say, but never decide consensus alone.
func UpdatePowers(s *State, nowMs int64) []ValidatorUpdate {
	p := s.Params
	nowEpoch := nowMs / p.EpochMs
	ids := make([]string, 0, len(s.Miners))
	for id := range s.Miners {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	want := map[string]int64{}
	active := 0
	for _, id := range ids {
		m := s.Miners[id]
		// Trim the work window.
		kept := m.RecentEpochs[:0]
		for _, e := range m.RecentEpochs {
			if e > nowEpoch-p.BoostWindowEpochs {
				kept = append(kept, e)
			}
		}
		m.RecentEpochs = kept
		if m.ValidatorPubKey == "" {
			continue
		}
		w := int64(0)
		if m.Status == "active" {
			boost := int64(0)
			if p.BoostPerEpochs > 0 {
				boost = int64(len(m.RecentEpochs)) / p.BoostPerEpochs
			}
			if boost > p.MaxBoost {
				boost = p.MaxBoost
			}
			w = p.BasePower + boost
			active++
		}
		want[id] = w
	}

	var updates []ValidatorUpdate
	for _, id := range ids {
		w, ok := want[id]
		m := s.Miners[id]
		if !ok || w == m.Power {
			continue
		}
		// Never remove the last miner-validators: a chain with none cannot make blocks.
		if w == 0 && active == 0 {
			continue
		}
		pk, _ := base64.StdEncoding.DecodeString(m.ValidatorPubKey)
		updates = append(updates, ValidatorUpdate{PubKey: pk, Power: w})
		m.Power = w
	}
	return updates
}
