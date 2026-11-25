package chain

import (
	"encoding/json"
	"os"
	"testing"
)

// The vector was signed by miner-core/minerd/signer.py (Python, eth_account + rfc8785).
// The chain must agree with it byte for byte, or real miners could never mint.
func TestPythonSignedAttestationVerifies(t *testing.T) {
	raw, err := os.ReadFile("testdata/c3-signed-by-python.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Address     string          `json:"address"`
		Attestation json.RawMessage `json:"attestation"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	a, err := ParseAttestation(v.Attestation)
	if err != nil {
		t.Fatal(err)
	}
	ev, err := a.RecomputeEvidenceHash()
	if err != nil {
		t.Fatal(err)
	}
	if ev != a.EvidenceHash {
		t.Fatalf("evidence hash: got %s want %s", ev, a.EvidenceHash)
	}
	addr, err := a.Signer()
	if err != nil {
		t.Fatal(err)
	}
	if addr != v.Address {
		t.Fatalf("signer: got %s want %s", addr, v.Address)
	}
}
