package node

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	cfg "github.com/cometbft/cometbft/config"
	cmtflags "github.com/cometbft/cometbft/libs/cli/flags"
	cmtlog "github.com/cometbft/cometbft/libs/log"
	cmtnode "github.com/cometbft/cometbft/node"
	"github.com/cometbft/cometbft/p2p"
	"github.com/cometbft/cometbft/privval"
	"github.com/cometbft/cometbft/proxy"
	"github.com/cometbft/cometbft/rpc/client/local"
	"github.com/spf13/viper"
)

// Settings is AIRcoin's own per-node config, at <home>/config/aircoin.json.
type Settings struct {
	APIAddr string `json:"api_addr"`
	Moniker string `json:"moniker,omitempty"`
}

func SettingsPath(home string) string { return filepath.Join(home, "config", "aircoin.json") }

func LoadSettings(home string) Settings {
	s := Settings{APIAddr: "0.0.0.0:8080"}
	if b, err := os.ReadFile(SettingsPath(home)); err == nil {
		_ = json.Unmarshal(b, &s)
	}
	return s
}

// LoadConfig reads <home>/config/config.toml the same way the cometbft CLI does.
func LoadConfig(home string) (*cfg.Config, error) {
	conf := cfg.DefaultConfig()
	v := viper.New()
	v.SetConfigFile(filepath.Join(home, "config", "config.toml"))
	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config.toml: %w", err)
	}
	if err := v.Unmarshal(conf); err != nil {
		return nil, err
	}
	conf.SetRoot(home)
	cfg.EnsureRoot(home)
	return conf, conf.ValidateBasic()
}

// Run starts consensus, p2p and the gateway, and blocks until SIGINT/SIGTERM.
func Run(home, apiAddr string) error {
	conf, err := LoadConfig(home)
	if err != nil {
		return err
	}
	settings := LoadSettings(home)
	if apiAddr == "" {
		apiAddr = settings.APIAddr
	}

	logger := cmtlog.NewTMLogger(cmtlog.NewSyncWriter(os.Stdout))
	logger, err = cmtflags.ParseLogLevel(conf.LogLevel, logger, cfg.DefaultLogLevel)
	if err != nil {
		return err
	}

	app, err := NewApp(home, logger.With("module", "aircoin"))
	if err != nil {
		return err
	}
	pv := privval.LoadOrGenFilePV(conf.PrivValidatorKeyFile(), conf.PrivValidatorStateFile())
	nodeKey, err := p2p.LoadOrGenNodeKey(conf.NodeKeyFile())
	if err != nil {
		return err
	}
	n, err := cmtnode.NewNode(conf, pv, nodeKey, proxy.NewLocalClientCreator(app),
		cmtnode.DefaultGenesisDocProviderFunc(conf), cfg.DefaultDBProvider,
		cmtnode.DefaultMetricsProvider(conf.Instrumentation), logger)
	if err != nil {
		return fmt.Errorf("new node: %w", err)
	}
	if err := n.Start(); err != nil {
		return fmt.Errorf("start node: %w", err)
	}

	gw := &Gateway{App: app, Client: local.New(n), Node: n, Logger: logger.With("module", "gateway")}
	srv := &http.Server{Addr: apiAddr, Handler: gw.Handler(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		logger.Info("AIRcoin gateway listening", "addr", apiAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("gateway stopped", "err", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	logger.Info("shutting down")
	_ = srv.Close()
	if n.IsRunning() {
		_ = n.Stop()
		n.Wait()
	}
	return nil
}
