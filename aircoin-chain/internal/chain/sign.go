package chain

import (
	"encoding/json"
	"fmt"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/crypto"
)

// SignAttestation fills evidence_hash and signature on an unsigned C3 attestation, the
// same way miner-core's Python Signer does. Used by simulate-miner and tests.
func SignAttestation(k *crypto.Key, att map[string]any) (map[string]any, error) {
	unsigned := map[string]any{}
	for key, v := range att {
		if key != "amount" && key != "evidence_hash" && key != "signature" {
			unsigned[key] = v
		}
	}
	ev, err := crypto.KeccakCanonical(unsigned)
	if err != nil {
		return nil, err
	}
	minerID, _ := att["miner_id"].(string)
	epoch, ok := toInt64(att["epoch"])
	if !ok {
		return nil, fmt.Errorf("epoch must be an integer")
	}
	amountStr, _ := att["amount"].(string)
	amount, err := ParseAmount(amountStr)
	if err != nil {
		return nil, err
	}
	digest, err := MintDigest(minerID, epoch, amount, ev)
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	for key, v := range att {
		out[key] = v
	}
	out["evidence_hash"] = ev
	out["signature"] = k.SignPersonal(digest)
	return out, nil
}

func toInt64(v any) (int64, bool) {
	switch n := v.(type) {
	case int:
		return int64(n), true
	case int64:
		return n, true
	case float64:
		return int64(n), float64(int64(n)) == n
	case json.Number:
		i, err := n.Int64()
		return i, err == nil
	}
	return 0, false
}
