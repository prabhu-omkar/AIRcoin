// aircoind is the AIRcoin node: a CometBFT validator whose state machine mints AIR for
// verified plant work. Every miner runs one.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/chain"
	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/crypto"
	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/node"
)

const usage = `aircoind — the AIRcoin chain node

  aircoind testnet  --validators 4 --out ./localnet     write an N-miner network
  aircoind start    --home ./localnet/node0             run a node (consensus + gateway)
  aircoind init     --home DIR --moniker miner-005 --genesis genesis.json --peers id@host:26656
  aircoind show-validator --home DIR                    print this node's validator key
  aircoind keys new                                     make a secp256k1 account
  aircoind tx       --node URL --key HEX --type T --body JSON
  aircoind simulate-miner --node URL --miner-id ID --key HEX [--lat --lon --stickers 0-19]
`

func main() {
	if len(os.Args) < 2 {
		fmt.Print(usage)
		os.Exit(2)
	}
	cmd, args := os.Args[1], os.Args[2:]
	var err error
	switch cmd {
	case "testnet":
		err = cmdTestnet(args)
	case "start":
		err = cmdStart(args)
	case "init":
		err = cmdInit(args)
	case "show-validator":
		err = cmdShowValidator(args)
	case "keys":
		err = cmdKeys(args)
	case "tx":
		err = cmdTx(args)
	case "simulate-miner":
		err = cmdSimulate(args)
	case "help", "-h", "--help":
		fmt.Print(usage)
	default:
		err = fmt.Errorf("unknown command %q\n\n%s", cmd, usage)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func printJSON(v any) {
	b, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(b))
}

func cmdTestnet(args []string) error {
	fs := flag.NewFlagSet("testnet", flag.ExitOnError)
	n := fs.Int("validators", 4, "number of miner nodes")
	out := fs.String("out", "./localnet", "output directory")
	chainID := fs.String("chain-id", "aircoin-local-1", "chain id")
	hosts := fs.String("hosts", "", "comma-separated host per node (real devices / docker); default all on 127.0.0.1")
	p2p := fs.Int("p2p-port", 26656, "base p2p port")
	rpc := fs.Int("rpc-port", 26657, "base CometBFT RPC port")
	api := fs.Int("api-port", 8700, "base gateway port")
	epoch := fs.Int64("epoch-ms", 60000, "epoch length")
	calib := fs.String("calibration-hash", "", "require this calibration_hash on attestations (empty: any)")
	seedPath := fs.String("seed", "", "demo accounts file with fixed keys (e.g. demo/demo-accounts.json)")
	_ = fs.Parse(args)
	var seed *node.Seed
	if *seedPath != "" {
		var err error
		if seed, err = node.LoadSeed(*seedPath); err != nil {
			return err
		}
	}
	var hl []string
	if *hosts != "" {
		hl = strings.Split(*hosts, ",")
	}
	acc, err := node.Testnet(node.TestnetOpts{N: *n, Out: *out, ChainID: *chainID, Hosts: hl, BaseP2P: *p2p,
		BaseRPC: *rpc, BaseAPI: *api, EpochMs: *epoch, CalibHex: *calib, Seed: seed})
	if err != nil {
		return err
	}
	fmt.Printf("wrote %d nodes to %s (chain %s)\n", len(acc.Miners), *out, acc.ChainID)
	for _, m := range acc.Miners {
		fmt.Printf("  %s  home=%s  api=%s  validator=%s\n", m.MinerID, m.Node.Home, m.Node.API, m.Node.ValidatorAddress)
	}
	fmt.Printf("keys: %s/accounts.json (demo only — keep it private)\n", *out)
	return nil
}

func cmdStart(args []string) error {
	fs := flag.NewFlagSet("start", flag.ExitOnError)
	home := fs.String("home", "", "node home directory")
	api := fs.String("api", "", "gateway listen address (default from config/aircoin.json)")
	_ = fs.Parse(args)
	if *home == "" {
		return fmt.Errorf("--home is required")
	}
	return node.Run(*home, *api)
}

func cmdInit(args []string) error {
	fs := flag.NewFlagSet("init", flag.ExitOnError)
	o := node.InitOpts{}
	fs.StringVar(&o.Home, "home", "", "node home directory")
	fs.StringVar(&o.Moniker, "moniker", "", "miner id")
	fs.StringVar(&o.GenesisFile, "genesis", "", "genesis.json of the network")
	fs.StringVar(&o.Peers, "peers", "", "persistent peers id@host:port,...")
	fs.IntVar(&o.P2PPort, "p2p-port", 26656, "p2p port")
	fs.IntVar(&o.RPCPort, "rpc-port", 26657, "CometBFT RPC port")
	fs.IntVar(&o.APIPort, "api-port", 8700, "gateway port")
	_ = fs.Parse(args)
	if o.Home == "" || o.Moniker == "" || o.GenesisFile == "" {
		return fmt.Errorf("--home, --moniker and --genesis are required")
	}
	info, err := node.Init(o)
	if err != nil {
		return err
	}
	printJSON(info)
	fmt.Fprintln(os.Stderr, "give validator_pubkey to the regulator: it goes in the approve_miner (or set_validator) tx")
	return nil
}

func cmdShowValidator(args []string) error {
	fs := flag.NewFlagSet("show-validator", flag.ExitOnError)
	home := fs.String("home", "", "node home directory")
	_ = fs.Parse(args)
	info, err := node.ShowValidator(*home, "", nil)
	if err != nil {
		return err
	}
	printJSON(info)
	return nil
}

func cmdKeys(args []string) error {
	if len(args) == 0 || args[0] != "new" {
		return fmt.Errorf("usage: aircoind keys new")
	}
	k, err := crypto.NewKey()
	if err != nil {
		return err
	}
	printJSON(map[string]string{"address": k.Address(), "private_key": k.Hex(), "public_key": k.PublicKeyHex()})
	return nil
}

// ------------------------------------------------------------------ http client

func getJSON(url string, v any) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GET %s: %s %s", url, resp.Status, b)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

func postJSON(url string, body []byte) (int, []byte, error) {
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	return resp.StatusCode, b, err
}

// SendTx fills from and nonce, signs and submits a tx through a gateway.
func SendTx(nodeURL string, k *crypto.Key, txType string, body map[string]any) (int, []byte, error) {
	var p struct {
		ChainID string `json:"chain_id"`
	}
	if err := getJSON(nodeURL+"/v1/params", &p); err != nil {
		return 0, nil, err
	}
	var a struct {
		Nonce uint64 `json:"nonce"`
	}
	if err := getJSON(nodeURL+"/v1/accounts/"+k.Address(), &a); err != nil {
		return 0, nil, err
	}
	body["from"], body["nonce"] = k.Address(), a.Nonce
	tx, err := chain.Sign(k, p.ChainID, txType, body)
	if err != nil {
		return 0, nil, err
	}
	return postJSON(nodeURL+"/v1/tx", tx)
}

func cmdTx(args []string) error {
	fs := flag.NewFlagSet("tx", flag.ExitOnError)
	nodeURL := fs.String("node", "http://127.0.0.1:8700", "gateway URL")
	key := fs.String("key", "", "sender private key (hex)")
	typ := fs.String("type", "", "tx type: transfer, burn, apply_miner, approve_miner, reject_application, set_miner_status, set_validator, set_obligation, faucet, list, buy, cancel")
	bodyStr := fs.String("body", "{}", "tx body JSON (from and nonce are filled in)")
	_ = fs.Parse(args)
	k, err := crypto.KeyFromHex(*key)
	if err != nil {
		return fmt.Errorf("--key: %w", err)
	}
	body := map[string]any{}
	dec := json.NewDecoder(strings.NewReader(*bodyStr))
	dec.UseNumber()
	if err := dec.Decode(&body); err != nil {
		return fmt.Errorf("--body: %w", err)
	}
	code, resp, err := SendTx(*nodeURL, k, *typ, body)
	if err != nil {
		return err
	}
	fmt.Println(strings.TrimSpace(string(resp)))
	if code >= 300 {
		os.Exit(1)
	}
	return nil
}

// ------------------------------------------------------------------ simulated miner

var species = []string{"snake_plant", "peace_lily", "bamboo_palm", "red_edged_dracaena", "janet_craig_dracaena",
	"english_ivy", "chinese_evergreen", "florists_chrysanthemum", "weeping_fig", "money_plant", "spider_plant",
	"aloe_vera", "areca_palm", "boston_fern", "tulsi", "hibiscus", "neem", "shisham", "bougainvillea", "yellow_oleander"}

func parseRange(s string) ([]int, error) {
	var out []int
	for _, part := range strings.Split(s, ",") {
		if a, b, ok := strings.Cut(part, "-"); ok {
			lo, err1 := strconv.Atoi(a)
			hi, err2 := strconv.Atoi(b)
			if err1 != nil || err2 != nil || hi < lo {
				return nil, fmt.Errorf("bad range %q", part)
			}
			for i := lo; i <= hi; i++ {
				out = append(out, i)
			}
		} else if part != "" {
			i, err := strconv.Atoi(part)
			if err != nil {
				return nil, err
			}
			out = append(out, i)
		}
	}
	return out, nil
}

// BuildAttestation makes a C3 attestation in the shape miner-core produces.
func BuildAttestation(minerID string, epoch, epochMs int64, lat, lon float64, tags []int, calib string) map[string]any {
	start := epoch * epochMs
	plants := []any{}
	micro := int64(0)
	for i, t := range tags {
		// 0.0012–0.0018 AIR per plant per epoch, varying a little each epoch.
		air := int64(1200 + (int64(t)*37+epoch*13)%600)
		micro += air
		plants = append(plants, map[string]any{
			"tag_id": t, "species": species[i%len(species)], "status": "present",
			"leaf_area_cm2": 300.0 + float64(t%20)*7, "health": 0.86,
			"removed_mg": map[string]any{"pm25": 0.00052, "pm10": 0.00071, "voc": 0.0021, "co2": 0.31},
			"air": float64(air) / 1e6,
		})
	}
	amount := new(big.Int).Mul(big.NewInt(micro), big.NewInt(1_000_000_000_000))
	if calib == "" {
		calib = "0x" + strings.Repeat("0", 64)
	}
	return map[string]any{
		"v": 1, "miner_id": minerID, "epoch": epoch, "start": start, "end": start + epochMs,
		"gps": map[string]any{"lat": lat, "lon": lon, "alt_m": 920.0, "fix": "3d", "hdop": 0.9, "satellites": 9, "ts": start + epochMs - 1000},
		"sensor_summary": map[string]any{"samples": 60, "aqi": 180,
			"pm25_ugm3": map[string]any{"mean": 80.1, "min": 71.0, "max": 90.2}},
		"plants": plants, "frame_hashes": []any{"0x" + strings.Repeat("ab", 32)}, "flags": []any{},
		"amount": amount.String(), "calibration_hash": calib,
	}
}

func cmdSimulate(args []string) error {
	fs := flag.NewFlagSet("simulate-miner", flag.ExitOnError)
	nodeURL := fs.String("node", "http://127.0.0.1:8700", "gateway URL")
	minerID := fs.String("miner-id", "", "miner id")
	key := fs.String("key", "", "device private key (hex)")
	lat := fs.Float64("lat", math.NaN(), "GPS latitude (default: registered spot)")
	lon := fs.Float64("lon", math.NaN(), "GPS longitude (default: registered spot)")
	stickers := fs.String("stickers", "", "sticker ids, e.g. 0-19 (default: registered stickers)")
	epochs := fs.Int("epochs", 0, "stop after this many epochs (0 = forever)")
	backfill := fs.Bool("now", false, "submit the epoch that just closed immediately, then continue")
	calib := fs.String("calibration-hash", "", "calibration_hash to report")
	_ = fs.Parse(args)
	k, err := crypto.KeyFromHex(*key)
	if err != nil {
		return fmt.Errorf("--key: %w", err)
	}
	var m struct {
		StickerIDs []int `json:"sticker_ids"`
		Location   struct {
			Lat float64 `json:"lat"`
			Lon float64 `json:"lon"`
		} `json:"location"`
	}
	if err := getJSON(*nodeURL+"/v1/miners/"+*minerID, &m); err != nil {
		return err
	}
	var p struct {
		Params chain.Params `json:"params"`
	}
	if err := getJSON(*nodeURL+"/v1/params", &p); err != nil {
		return err
	}
	if math.IsNaN(*lat) {
		*lat = m.Location.Lat
	}
	if math.IsNaN(*lon) {
		*lon = m.Location.Lon
	}
	tags := m.StickerIDs
	if *stickers != "" {
		if tags, err = parseRange(*stickers); err != nil {
			return err
		}
	}
	if *calib == "" {
		*calib = p.Params.CalibrationHash
	}
	epochMs := p.Params.EpochMs
	fmt.Printf("%s: device %s, %d plants, epoch %d ms, node %s\n", *minerID, k.Address(), len(tags), epochMs, *nodeURL)

	next := time.Now().UnixMilli()/epochMs - 1 // the epoch that just closed
	if !*backfill {
		next++
	}
	for done := 0; *epochs == 0 || done < *epochs; done++ {
		closeAt := (next + 1) * epochMs
		if wait := closeAt + 1500 - time.Now().UnixMilli(); wait > 0 {
			time.Sleep(time.Duration(wait) * time.Millisecond)
		}
		att, err := chain.SignAttestation(k, BuildAttestation(*minerID, next, epochMs, *lat, *lon, tags, *calib))
		if err != nil {
			return err
		}
		body, _ := json.Marshal(att)
		code, resp, err := postJSON(*nodeURL+"/v1/attestations", body)
		if err != nil {
			fmt.Printf("epoch %d: %v\n", next, err)
		} else {
			fmt.Printf("epoch %d: HTTP %d %s\n", next, code, strings.TrimSpace(string(resp)))
		}
		next++
	}
	return nil
}
