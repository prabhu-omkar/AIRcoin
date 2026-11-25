package chain

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"strings"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/crypto"
)

// Tx is the wire format of every transaction. An "attest" tx carries a C3 attestation as
// its body and needs no envelope signature: the device signature inside it is the proof.
// Every other type is signed by its sender over SignBytes (EIP-191 personal_sign), so any
// Ethereum wallet key works as an AIRcoin account.
type Tx struct {
	Type string          `json:"type"`
	Body json.RawMessage `json:"body"`
	Sig  string          `json:"sig,omitempty"`
}

// Header fields shared by every signed body.
type Header struct {
	From  string `json:"from"`
	Nonce uint64 `json:"nonce"`
}

type TransferBody struct {
	Header
	To     string `json:"to"`
	Token  string `json:"token"` // AIR or TINR
	Amount string `json:"amount"`
}

type BurnBody struct {
	Header
	Amount string `json:"amount"`
	Period string `json:"period,omitempty"`
	Memo   string `json:"memo,omitempty"`
}

type ApplyMinerBody struct {
	Header
	Name          string   `json:"name"`
	Location      Location `json:"location"`
	PlantsPlanned int      `json:"plants_planned"`
	Note          string   `json:"note,omitempty"`
}

type ApproveMinerBody struct {
	Header
	ApplicationID   int64    `json:"application_id,omitempty"`
	MinerID         string   `json:"miner_id"`
	Label           string   `json:"label,omitempty"`
	DeviceAddress   string   `json:"device_address"`
	DevicePublicKey string   `json:"device_public_key,omitempty"`
	OwnerWallet     string   `json:"owner_wallet"`
	StickerIDs      []int    `json:"sticker_ids"`
	Location        Location `json:"location"`
	ValidatorPubKey string   `json:"validator_pubkey,omitempty"`
}

type RejectApplicationBody struct {
	Header
	ApplicationID int64  `json:"application_id"`
	Reason        string `json:"reason"`
}

type SetMinerStatusBody struct {
	Header
	MinerID string `json:"miner_id"`
	Status  string `json:"status"` // active | suspended
}

type SetValidatorBody struct {
	Header
	MinerID         string `json:"miner_id"`
	ValidatorPubKey string `json:"validator_pubkey"`
}

type SetObligationBody struct {
	Header
	Company     string `json:"company"`
	CompanyName string `json:"company_name"`
	Period      string `json:"period"`
	Amount      string `json:"amount"`
}

type FaucetBody struct {
	Header
	To     string `json:"to"`
	Amount string `json:"amount"` // test INR only
}

type ListBody struct {
	Header
	AmountAIR string `json:"amount_air"`
	PriceTINR string `json:"price_tinr"`
}

type ListingRefBody struct {
	Header
	ListingID int64 `json:"listing_id"`
}

// SignBytes is what a sender signs: JCS({chain_id, type, body}). The chain id stops a
// transaction from one network being replayed on another.
func SignBytes(chainID, txType string, body json.RawMessage) ([]byte, error) {
	return crypto.Canonical(map[string]any{"chain_id": chainID, "type": txType, "body": body})
}

// Sign builds a signed transaction.
func Sign(k *crypto.Key, chainID, txType string, body any) ([]byte, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	msg, err := SignBytes(chainID, txType, raw)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Tx{Type: txType, Body: raw, Sig: k.SignPersonal(msg)})
}

// DecodeTx parses the envelope.
func DecodeTx(b []byte) (*Tx, error) {
	var t Tx
	if err := json.Unmarshal(b, &t); err != nil {
		return nil, err
	}
	if t.Type == "" || len(t.Body) == 0 {
		return nil, errors.New("tx needs type and body")
	}
	return &t, nil
}

// VerifySender checks the envelope signature and returns the lowercase sender address,
// which must equal body.from.
func (t *Tx) VerifySender(chainID string) (string, error) {
	var h Header
	if err := json.Unmarshal(t.Body, &h); err != nil {
		return "", err
	}
	msg, err := SignBytes(chainID, t.Type, t.Body)
	if err != nil {
		return "", err
	}
	addr, err := crypto.Recover(msg, t.Sig)
	if err != nil {
		return "", err
	}
	if !strings.EqualFold(addr, h.From) {
		return "", errors.New("signature does not match body.from")
	}
	return addr, nil
}

// TxHash is sha256 of the raw tx bytes, the same hash CometBFT reports.
func TxHash(tx []byte) string {
	h := sha256.Sum256(tx)
	return crypto.Hex(h[:])
}
