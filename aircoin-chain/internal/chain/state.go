package chain

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
)

// Params are the chain's rules, fixed at genesis.
type Params struct {
	// EpochMs is the plant-work epoch length (60 s for the demo, contracts-schema conventions).
	EpochMs int64 `json:"epoch_ms"`
	// CalibrationHash, when set, is the only species catalogue attestations may use.
	CalibrationHash string `json:"calibration_hash,omitempty"`
	// PerMinerEpochCap is the most AIR (base units) one miner can mint per epoch.
	PerMinerEpochCap string `json:"per_miner_epoch_cap"`
	// PerPlantAirCap is the most AIR (display units) one plant may claim per epoch.
	PerPlantAirCap float64 `json:"per_plant_air_cap"`
	// ProposerRewardBps is the block reward, in basis points of the AIR minted in that block,
	// paid to the owner of the miner whose node proposed the block.
	ProposerRewardBps int64 `json:"proposer_reward_bps"`
	// Validator voting power = BasePower + min(MaxBoost, epochs minted in the window / BoostPerEpochs).
	BasePower         int64 `json:"base_power"`
	MaxBoost          int64 `json:"max_boost"`
	BoostPerEpochs    int64 `json:"boost_per_epochs"`
	BoostWindowEpochs int64 `json:"boost_window_epochs"`
	// MaxEpochLag: an epoch older than this many epochs can no longer be attested.
	MaxEpochLag int64 `json:"max_epoch_lag"`
}

// DefaultParams matches the frozen species catalogue caps (0.2 AIR per miner, 0.01 per plant per epoch).
func DefaultParams() Params {
	return Params{
		EpochMs:           60_000,
		PerMinerEpochCap:  "200000000000000000",
		PerPlantAirCap:    0.01,
		ProposerRewardBps: 200,
		BasePower:         10,
		MaxBoost:          10,
		BoostPerEpochs:    60,
		BoostWindowEpochs: 1440,
		MaxEpochLag:       10,
	}
}

type Account struct {
	AIR   string `json:"air"`
	TINR  string `json:"tinr"`
	Nonce uint64 `json:"nonce"`
}

type Location struct {
	Lat       float64 `json:"lat"`
	Lon       float64 `json:"lon"`
	Geohash   string  `json:"geohash,omitempty"`
	GeofenceM float64 `json:"geofence_m"`
	Label     string  `json:"label,omitempty"`
}

type MintRecord struct {
	MinerID      string `json:"miner_id"`
	Epoch        int64  `json:"epoch"`
	Amount       string `json:"amount"`
	To           string `json:"to"`
	EvidenceHash string `json:"evidence_hash"`
	TxHash       string `json:"tx_hash"`
	BlockNumber  int64  `json:"block_number"`
	Ts           int64  `json:"ts"`
}

type Miner struct {
	MinerID         string   `json:"miner_id"`
	Label           string   `json:"label,omitempty"`
	DeviceAddress   string   `json:"device_address"`
	DevicePublicKey string   `json:"device_public_key,omitempty"`
	OwnerWallet     string   `json:"owner_wallet"`
	StickerIDs      []int    `json:"sticker_ids"`
	StickerSetHash  string   `json:"sticker_set_hash"`
	Location        Location `json:"location"`
	Status          string   `json:"status"`
	RegisteredAt    int64    `json:"registered_at"`
	RegistrationTx  string   `json:"registration_tx,omitempty"`
	// ValidatorPubKey is the base64 ed25519 key of the node this miner runs, if it validates.
	ValidatorPubKey string `json:"validator_pubkey,omitempty"`
	Power           int64  `json:"power"`

	Minted          string       `json:"minted"`
	EpochsMinted    int64        `json:"epochs_minted"`
	EpochsRejected  int64        `json:"epochs_rejected"`
	LastMintEpoch   int64        `json:"last_mint_epoch"`
	RecentEpochs    []int64      `json:"recent_epochs,omitempty"`
	Mints           []MintRecord `json:"mints,omitempty"`
	Rejections      []Rejection  `json:"rejections,omitempty"`
	BlocksProposed  int64        `json:"blocks_proposed"`
	ProposerRewards string       `json:"proposer_rewards"`
}

// Rejection is one refused attestation, kept on-chain as the miner's anti-cheat log.
type Rejection struct {
	Epoch       int64  `json:"epoch"`
	ReasonCode  string `json:"reason_code"`
	Reason      string `json:"reason"`
	TxHash      string `json:"tx_hash"`
	BlockNumber int64  `json:"block_number"`
	Ts          int64  `json:"ts"`
}

// MaxRejections is how many rejections each miner keeps.
const MaxRejections = 100

type Application struct {
	ID            int64    `json:"id"`
	Applicant     string   `json:"applicant"`
	Name          string   `json:"name"`
	Location      Location `json:"location"`
	PlantsPlanned int      `json:"plants_planned"`
	Note          string   `json:"note,omitempty"`
	Status        string   `json:"status"`
	MinerID       string   `json:"miner_id,omitempty"`
	Reason        string   `json:"reason,omitempty"`
	SubmittedAt   int64    `json:"submitted_at"`
	DecidedAt     int64    `json:"decided_at,omitempty"`
}

type Obligation struct {
	Company     string `json:"company"`
	CompanyName string `json:"company_name"`
	Period      string `json:"period"`
	Amount      string `json:"amount"`
	Burned      string `json:"burned"`
}

type Listing struct {
	ID        int64  `json:"id"`
	Seller    string `json:"seller"`
	AmountAIR string `json:"amount_air"`
	PriceTINR string `json:"price_tinr"`
	Status    string `json:"status"`
	Buyer     string `json:"buyer,omitempty"`
	CreatedAt int64  `json:"created_at"`
	ClosedAt  int64  `json:"closed_at,omitempty"`
}

type Supply struct {
	Minted string `json:"minted"`
	Burned string `json:"burned"`
}

// State is the whole application state. It is JSON-serialised (map keys sorted by
// encoding/json) and hashed with sha256 after every block, so every node that runs the
// same blocks gets the same app hash.
type State struct {
	ChainID         string                  `json:"chain_id"`
	Height          int64                   `json:"height"`
	LastBlockTimeMs int64                   `json:"last_block_time_ms"`
	Params          Params                  `json:"params"`
	Admins          []string                `json:"admins"`
	Accounts        map[string]*Account     `json:"accounts"`
	Miners          map[string]*Miner       `json:"miners"`
	StickerOwner    map[string]string       `json:"sticker_owner"`
	Minted          map[string]bool         `json:"minted"`
	Applications    map[string]*Application `json:"applications"`
	NextApplication int64                   `json:"next_application"`
	Obligations     map[string]*Obligation  `json:"obligations"`
	Listings        map[string]*Listing     `json:"listings"`
	NextListing     int64                   `json:"next_listing"`
	Supply          Supply                  `json:"supply"`
	// Ledger keeps the most recent trade, burn and transfer events (mints live on
	// each miner), so any node can show market history, even one that joined late.
	Ledger []Event `json:"ledger,omitempty"`
}

// MaxLedger is how many non-mint events the state keeps.
const MaxLedger = 2000

// Record appends events to the ledger (mint events are skipped).
func (s *State) Record(evs []Event) {
	for _, e := range evs {
		if e.Type != "mint" {
			s.Ledger = append(s.Ledger, e)
		}
	}
	if len(s.Ledger) > MaxLedger {
		s.Ledger = append([]Event(nil), s.Ledger[len(s.Ledger)-MaxLedger:]...)
	}
}

func NewState(chainID string, p Params) *State {
	return &State{
		ChainID:         chainID,
		Params:          p,
		Accounts:        map[string]*Account{},
		Miners:          map[string]*Miner{},
		StickerOwner:    map[string]string{},
		Minted:          map[string]bool{},
		Applications:    map[string]*Application{},
		NextApplication: 1,
		Obligations:     map[string]*Obligation{},
		Listings:        map[string]*Listing{},
		NextListing:     1,
		Supply:          Supply{Minted: "0", Burned: "0"},
	}
}

func (s *State) Hash() []byte {
	b, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	h := sha256.Sum256(b)
	return h[:]
}

func (s *State) Clone() *State {
	b, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	var c State
	if err := json.Unmarshal(b, &c); err != nil {
		panic(err)
	}
	return &c
}

func (s *State) IsAdmin(addr string) bool {
	for _, a := range s.Admins {
		if a == addr {
			return true
		}
	}
	return false
}

// Account returns the account, creating an empty one.
func (s *State) Account(addr string) *Account {
	addr = strings.ToLower(addr)
	a, ok := s.Accounts[addr]
	if !ok {
		a = &Account{AIR: "0", TINR: "0"}
		s.Accounts[addr] = a
	}
	return a
}

// PeekAccount returns the account without creating it.
func (s *State) PeekAccount(addr string) Account {
	if a, ok := s.Accounts[strings.ToLower(addr)]; ok {
		return *a
	}
	return Account{AIR: "0", TINR: "0"}
}

func StickerKey(tag int) string { return fmt.Sprintf("%d", tag) }

func MintedKey(minerID string, epoch int64) string { return fmt.Sprintf("%s:%d", minerID, epoch) }

func ObligationKey(company, period string) string { return strings.ToLower(company) + "|" + period }

// --- big-number helpers (amounts are 18-decimal base-unit strings) ---

func Big(s string) *big.Int {
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		return new(big.Int)
	}
	return n
}

func ParseAmount(s string) (*big.Int, error) {
	n, ok := new(big.Int).SetString(s, 10)
	if !ok || n.Sign() < 0 || n.BitLen() > 256 {
		return nil, fmt.Errorf("amount %q must be a non-negative integer string", s)
	}
	return n, nil
}

func add(a string, b *big.Int) string { return new(big.Int).Add(Big(a), b).String() }
func sub(a string, b *big.Int) string { return new(big.Int).Sub(Big(a), b).String() }
