package chain

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"math/big"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/crypto"
)

// Attestation is the C3 payload (contracts-schema/schemas/c3-attestation.schema.json),
// carried unchanged inside an "attest" transaction. Raw keeps the exact JSON the
// miner signed, so the evidence hash is recomputed from what the device produced.
type Attestation struct {
	V               int             `json:"v"`
	MinerID         string          `json:"miner_id"`
	Epoch           int64           `json:"epoch"`
	Start           int64           `json:"start"`
	End             int64           `json:"end"`
	GPS             GPS             `json:"gps"`
	Plants          []Plant         `json:"plants"`
	Amount          string          `json:"amount"`
	CalibrationHash string          `json:"calibration_hash"`
	EvidenceHash    string          `json:"evidence_hash"`
	Signature       string          `json:"signature"`
	Raw             json.RawMessage `json:"-"`
}

type GPS struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type Plant struct {
	TagID  int     `json:"tag_id"`
	Status string  `json:"status"`
	Air    float64 `json:"air"`
}

// ParseAttestation decodes a C3 attestation and keeps its raw bytes.
func ParseAttestation(raw []byte) (*Attestation, error) {
	var a Attestation
	if err := json.Unmarshal(raw, &a); err != nil {
		return nil, err
	}
	a.Raw = append(json.RawMessage(nil), raw...)
	return &a, nil
}

// EvidenceHash recomputes keccak256(JCS(attestation without amount, evidence_hash, signature)).
func (a *Attestation) RecomputeEvidenceHash() (string, error) {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(a.Raw, &m); err != nil {
		return "", err
	}
	delete(m, "amount")
	delete(m, "evidence_hash")
	delete(m, "signature")
	b, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return crypto.KeccakCanonical(b)
}

// MintDigest is keccak256(abi.encodePacked(bytes32 keccak(miner_id), uint64 epoch,
// uint256 amount, bytes32 evidence_hash)): the message the device key signs.
func MintDigest(minerID string, epoch int64, amount *big.Int, evidenceHash string) ([]byte, error) {
	ev, err := crypto.DecodeHex(evidenceHash)
	if err != nil || len(ev) != 32 {
		return nil, errors.New("evidence_hash must be 32 bytes")
	}
	if amount.Sign() < 0 || amount.BitLen() > 256 {
		return nil, errors.New("amount out of range")
	}
	var ep [8]byte
	binary.BigEndian.PutUint64(ep[:], uint64(epoch))
	amt := make([]byte, 32)
	amount.FillBytes(amt)
	return crypto.Keccak256(crypto.Keccak256([]byte(minerID)), ep[:], amt, ev), nil
}


// Signer recovers the device address that signed this attestation.
func (a *Attestation) Signer() (string, error) {
	amt, ok := new(big.Int).SetString(a.Amount, 10)
	if !ok {
		return "", errors.New("amount is not an integer")
	}
	digest, err := MintDigest(a.MinerID, a.Epoch, amt, a.EvidenceHash)
	if err != nil {
		return "", err
	}
	return crypto.Recover(digest, a.Signature)
}
