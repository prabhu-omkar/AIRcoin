package chain

import (
	"strings"
)

// GenesisState is the "app_state" block of genesis.json.
type GenesisState struct {
	Params      *Params             `json:"params,omitempty"`
	Admins      []string            `json:"admins"`
	Accounts    map[string]*Account `json:"accounts,omitempty"`
	Miners      []ApproveMinerBody  `json:"miners,omitempty"`
	Obligations []Obligation        `json:"obligations,omitempty"`
}

// BuildState turns genesis into the state at height 0.
func BuildState(chainID string, g GenesisState, timeMs int64) (*State, error) {
	p := DefaultParams()
	if g.Params != nil {
		p = *g.Params
	}
	s := NewState(chainID, p)
	for _, a := range g.Admins {
		s.Admins = append(s.Admins, strings.ToLower(a))
	}
	for addr, a := range g.Accounts {
		acct := s.Account(addr)
		acct.AIR = Big(a.AIR).String()
		acct.TINR = Big(a.TINR).String()
		s.Supply.Minted = add(s.Supply.Minted, Big(a.AIR))
	}
	for i := range g.Miners {
		b := g.Miners[i]
		if _, res := NewMiner(s, &b, timeMs, "genesis"); res != nil {
			return nil, errorString(res.Log)
		}
	}
	for _, o := range g.Obligations {
		o := o
		o.Company = strings.ToLower(o.Company)
		if o.Burned == "" {
			o.Burned = "0"
		}
		s.Obligations[ObligationKey(o.Company, o.Period)] = &o
	}
	return s, nil
}

type errorString string

func (e errorString) Error() string { return string(e) }
