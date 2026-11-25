package node

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	cfg "github.com/cometbft/cometbft/config"
	"github.com/cometbft/cometbft/p2p"
	"github.com/cometbft/cometbft/privval"
	"github.com/cometbft/cometbft/types"
	cmttime "github.com/cometbft/cometbft/types/time"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/chain"
	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/crypto"
)

// KeyPair is a secp256k1 account written to accounts.json for the demo.
type KeyPair struct {
	Name       string `json:"name,omitempty"`
	Address    string `json:"address"`
	PrivateKey string `json:"private_key"`
}

// Seed is a demo-accounts file (see demo/demo-accounts.json): fixed keys for the
// regulator, a company, a citizen and the first miners, so the apps' demo logins and
// miner-core's device keys work on a fresh network.
type Seed struct {
	Admin   KeyPair `json:"admin"`
	Company struct {
		KeyPair
		Obligation struct {
			Period string `json:"period"`
			Amount string `json:"amount"`
		} `json:"obligation"`
	} `json:"company"`
	Citizen KeyPair `json:"citizen"`
	Miners  []struct {
		MinerID    string         `json:"miner_id"`
		Label      string         `json:"label"`
		Owner      KeyPair        `json:"owner"`
		Device     KeyPair        `json:"device"`
		StickerIDs []int          `json:"sticker_ids"`
		Location   chain.Location `json:"location"`
	} `json:"miners"`
}

func LoadSeed(path string) (*Seed, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var s Seed
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &s, nil
}

func newKeyPair() KeyPair {
	k, err := crypto.NewKey()
	if err != nil {
		panic(err)
	}
	return KeyPair{Address: k.Address(), PrivateKey: k.Hex()}
}

type NodeInfo struct {
	Home             string `json:"home"`
	NodeID           string `json:"node_id"`
	P2P              string `json:"p2p"`
	RPC              string `json:"rpc"`
	API              string `json:"api"`
	ValidatorPubKey  string `json:"validator_pubkey"`
	ValidatorAddress string `json:"validator_address"`
}

type MinerKeys struct {
	MinerID    string   `json:"miner_id"`
	Label      string   `json:"label"`
	Owner      KeyPair  `json:"owner"`
	Device     KeyPair  `json:"device"`
	StickerIDs []int    `json:"sticker_ids"`
	Lat        float64  `json:"lat"`
	Lon        float64  `json:"lon"`
	Node       NodeInfo `json:"node"`
}

// Accounts is <out>/accounts.json: every demo key, so the apps and scripts can sign.
type Accounts struct {
	ChainID string      `json:"chain_id"`
	Admin   KeyPair     `json:"admin"`
	Company KeyPair     `json:"company"`
	Citizen KeyPair     `json:"citizen"`
	Miners  []MinerKeys `json:"miners"`
}

type TestnetOpts struct {
	N       int
	Out     string
	ChainID string
	// Hosts, if set, gives one host per node (real Pis or docker service names); every
	// node then uses the base ports. Otherwise all nodes run on 127.0.0.1 with ports
	// offset by 100 per node.
	Hosts    []string
	BaseP2P  int
	BaseRPC  int
	BaseAPI  int
	EpochMs  int64
	CalibHex string
	Seed     *Seed
}

var labels = []string{"Hackathon venue", "Rooftop garden, Jayanagar", "School terrace, Malleshwaram",
	"Balcony, Indiranagar", "Office lobby, Whitefield", "Clinic garden, Koramangala", "Temple yard, Basavanagudi", "Hostel roof, RR Nagar"}

func nodeConfig(home, moniker string, p2pPort, rpcPort int, peers string, public bool) *cfg.Config {
	conf := cfg.DefaultConfig()
	conf.SetRoot(home)
	cfg.EnsureRoot(home)
	conf.Moniker = moniker
	conf.P2P.ListenAddress = fmt.Sprintf("tcp://0.0.0.0:%d", p2pPort)
	rpcHost := "127.0.0.1"
	if public {
		rpcHost = "0.0.0.0"
	}
	conf.RPC.ListenAddress = fmt.Sprintf("tcp://%s:%d", rpcHost, rpcPort)
	conf.P2P.PersistentPeers = peers
	conf.P2P.AllowDuplicateIP = true
	conf.P2P.AddrBookStrict = false
	conf.Consensus.TimeoutCommit = 1 * time.Second
	conf.LogLevel = "*:error,aircoin:info,gateway:info,state:info"
	return conf
}

// Testnet writes N node homes that share one genesis: every node is a miner and a
// validator from block 1.
func Testnet(o TestnetOpts) (*Accounts, error) {
	if o.N < 1 || o.N > len(labels)*4 {
		return nil, fmt.Errorf("validators must be 1..%d", len(labels)*4)
	}
	if len(o.Hosts) > 0 && len(o.Hosts) != o.N {
		return nil, fmt.Errorf("--hosts needs exactly %d entries", o.N)
	}
	if err := os.MkdirAll(o.Out, 0o755); err != nil {
		return nil, err
	}
	acc := &Accounts{ChainID: o.ChainID, Admin: newKeyPair(), Company: newKeyPair(), Citizen: newKeyPair()}
	companyName, obPeriod, obAmount := "Demo Steel Works", "2026", "5000000000000000000"
	if sd := o.Seed; sd != nil {
		acc.Admin, acc.Company, acc.Citizen = sd.Admin, sd.Company.KeyPair, sd.Citizen
		companyName = sd.Company.Name
		if sd.Company.Obligation.Period != "" {
			obPeriod, obAmount = sd.Company.Obligation.Period, sd.Company.Obligation.Amount
		}
	}
	acc.Admin.Address, acc.Company.Address, acc.Citizen.Address =
		strings.ToLower(acc.Admin.Address), strings.ToLower(acc.Company.Address), strings.ToLower(acc.Citizen.Address)
	params := chain.DefaultParams()
	if o.EpochMs > 0 {
		params.EpochMs = o.EpochMs
	}
	params.CalibrationHash = strings.ToLower(o.CalibHex)

	type built struct {
		conf *cfg.Config
		pv   *privval.FilePV
		id   p2p.ID
		p2p  int
		rpc  int
		api  int
		host string
	}
	nodes := make([]built, o.N)
	for i := 0; i < o.N; i++ {
		b := built{p2p: o.BaseP2P, rpc: o.BaseRPC, api: o.BaseAPI, host: "127.0.0.1"}
		if len(o.Hosts) > 0 {
			b.host = o.Hosts[i]
		} else {
			b.p2p += 100 * i
			b.rpc += 100 * i
			b.api += i
		}
		id := fmt.Sprintf("miner-%03d", i+1)
		home := filepath.Join(o.Out, fmt.Sprintf("node%d", i))
		b.conf = nodeConfig(home, id, b.p2p, b.rpc, "", len(o.Hosts) > 0)
		b.pv = privval.GenFilePV(b.conf.PrivValidatorKeyFile(), b.conf.PrivValidatorStateFile())
		b.pv.Save()
		nk, err := p2p.LoadOrGenNodeKey(b.conf.NodeKeyFile())
		if err != nil {
			return nil, err
		}
		b.id = nk.ID()
		nodes[i] = b
	}

	g := chain.GenesisState{
		Params: &params,
		Admins: []string{acc.Admin.Address},
		Accounts: map[string]*chain.Account{
			acc.Company.Address: {AIR: "0", TINR: "100000000000000000000000"}, // 100,000 tINR
			acc.Citizen.Address: {AIR: "0", TINR: "1000000000000000000000"},   // 1,000 tINR
		},
		Obligations: []chain.Obligation{{Company: acc.Company.Address, CompanyName: companyName, Period: obPeriod,
			Amount: obAmount, Burned: "0"}},
	}
	var vals []types.GenesisValidator
	for i, b := range nodes {
		mk := MinerKeys{MinerID: b.conf.Moniker, Label: labels[i%len(labels)], Owner: newKeyPair(), Device: newKeyPair()}
		mk.Lat = 12.9716 + 0.011*float64(i)
		mk.Lon = 77.5946 - 0.009*float64(i)
		for t := 0; t < 20; t++ {
			mk.StickerIDs = append(mk.StickerIDs, i*20+t)
		}
		geofence := 50.0
		if o.Seed != nil && i < len(o.Seed.Miners) {
			sm := o.Seed.Miners[i]
			if sm.MinerID != mk.MinerID {
				return nil, fmt.Errorf("seed miner %d is %s, expected %s", i, sm.MinerID, mk.MinerID)
			}
			mk.Label, mk.Owner, mk.Device, mk.StickerIDs = sm.Label, sm.Owner, sm.Device, sm.StickerIDs
			mk.Lat, mk.Lon = sm.Location.Lat, sm.Location.Lon
			if sm.Location.Label != "" {
				mk.Label = sm.Location.Label
			}
			if sm.Location.GeofenceM > 0 {
				geofence = sm.Location.GeofenceM
			}
		}
		mk.Owner.Address, mk.Device.Address = strings.ToLower(mk.Owner.Address), strings.ToLower(mk.Device.Address)
		g.Accounts[mk.Owner.Address] = &chain.Account{AIR: "0", TINR: "1000000000000000000000"}
		pub := b.pv.Key.PubKey
		pubB64 := base64.StdEncoding.EncodeToString(pub.Bytes())
		dk, _ := crypto.KeyFromHex(mk.Device.PrivateKey)
		g.Miners = append(g.Miners, chain.ApproveMinerBody{
			MinerID: mk.MinerID, Label: mk.Label, DeviceAddress: mk.Device.Address, DevicePublicKey: dk.PublicKeyHex(),
			OwnerWallet: mk.Owner.Address, StickerIDs: mk.StickerIDs, ValidatorPubKey: pubB64,
			Location: chain.Location{Lat: mk.Lat, Lon: mk.Lon, Geohash: Geohash(mk.Lat, mk.Lon, 9), GeofenceM: geofence, Label: mk.Label},
		})
		vals = append(vals, types.GenesisValidator{Address: pub.Address(), PubKey: pub, Power: params.BasePower, Name: mk.MinerID})
		mk.Node = NodeInfo{Home: b.conf.RootDir, NodeID: string(b.id), P2P: fmt.Sprintf("%s:%d", b.host, b.p2p),
			RPC: fmt.Sprintf("http://%s:%d", b.host, b.rpc), API: fmt.Sprintf("http://%s:%d", b.host, b.api),
			ValidatorPubKey: pubB64, ValidatorAddress: pub.Address().String()}
		acc.Miners = append(acc.Miners, mk)
	}
	appState, err := json.MarshalIndent(g, "", "  ")
	if err != nil {
		return nil, err
	}
	gen := &types.GenesisDoc{ChainID: o.ChainID, GenesisTime: cmttime.Now(), InitialHeight: 1,
		ConsensusParams: types.DefaultConsensusParams(), Validators: vals, AppState: appState}
	if err := gen.ValidateAndComplete(); err != nil {
		return nil, err
	}

	for i, b := range nodes {
		var peers []string
		for j, p := range nodes {
			if j != i {
				peers = append(peers, fmt.Sprintf("%s@%s:%d", p.id, p.host, p.p2p))
			}
		}
		b.conf.P2P.PersistentPeers = strings.Join(peers, ",")
		cfg.WriteConfigFile(filepath.Join(b.conf.RootDir, "config", "config.toml"), b.conf)
		if err := gen.SaveAs(b.conf.GenesisFile()); err != nil {
			return nil, err
		}
		if err := writeSettings(b.conf.RootDir, Settings{APIAddr: fmt.Sprintf("0.0.0.0:%d", b.api), Moniker: b.conf.Moniker}); err != nil {
			return nil, err
		}
	}
	if err := gen.SaveAs(filepath.Join(o.Out, "genesis.json")); err != nil {
		return nil, err
	}
	out, _ := json.MarshalIndent(acc, "", "  ")
	return acc, os.WriteFile(filepath.Join(o.Out, "accounts.json"), out, 0o600)
}

func writeSettings(home string, s Settings) error {
	b, _ := json.MarshalIndent(s, "", "  ")
	return os.WriteFile(SettingsPath(home), b, 0o644)
}

// InitOpts creates a home for a new miner node that joins an existing network.
type InitOpts struct {
	Home, Moniker, GenesisFile, Peers string
	P2PPort, RPCPort, APIPort         int
}

func Init(o InitOpts) (*NodeInfo, error) {
	gen, err := types.GenesisDocFromFile(o.GenesisFile)
	if err != nil {
		return nil, fmt.Errorf("genesis: %w", err)
	}
	conf := nodeConfig(o.Home, o.Moniker, o.P2PPort, o.RPCPort, o.Peers, false)
	pv := privval.LoadOrGenFilePV(conf.PrivValidatorKeyFile(), conf.PrivValidatorStateFile())
	nk, err := p2p.LoadOrGenNodeKey(conf.NodeKeyFile())
	if err != nil {
		return nil, err
	}
	cfg.WriteConfigFile(filepath.Join(o.Home, "config", "config.toml"), conf)
	if err := gen.SaveAs(conf.GenesisFile()); err != nil {
		return nil, err
	}
	if err := writeSettings(o.Home, Settings{APIAddr: fmt.Sprintf("0.0.0.0:%d", o.APIPort), Moniker: o.Moniker}); err != nil {
		return nil, err
	}
	return ShowValidator(o.Home, string(nk.ID()), pv)
}

func ShowValidator(home, nodeID string, pv *privval.FilePV) (*NodeInfo, error) {
	if pv == nil {
		conf := cfg.DefaultConfig()
		conf.SetRoot(home)
		pv = privval.LoadFilePV(conf.PrivValidatorKeyFile(), conf.PrivValidatorStateFile())
		nk, err := p2p.LoadNodeKey(conf.NodeKeyFile())
		if err != nil {
			return nil, err
		}
		nodeID = string(nk.ID())
	}
	pub := pv.Key.PubKey
	return &NodeInfo{Home: home, NodeID: nodeID, ValidatorPubKey: base64.StdEncoding.EncodeToString(pub.Bytes()),
		ValidatorAddress: pub.Address().String()}, nil
}
