// Package crypto holds the hashing and signing rules shared by the chain, the
// gateway and the CLI. They mirror contracts-schema/README.md#signing-c3 exactly,
// so the Python miner (miner-core/minerd/signer.py) and this chain agree byte for byte:
//
//   - canonical JSON is RFC 8785 (JCS)
//   - hashes are keccak256
//   - signatures are 65-byte secp256k1 r||s||v over an EIP-191 personal_sign hash
//   - addresses are Ethereum-style (last 20 bytes of keccak256 of the public key)
package crypto

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/decred/dcrd/dcrec/secp256k1/v4"
	"github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
	"github.com/gowebpki/jcs"
	"golang.org/x/crypto/sha3"
)

// Keccak256 hashes the concatenation of its inputs.
func Keccak256(data ...[]byte) []byte {
	h := sha3.NewLegacyKeccak256()
	for _, d := range data {
		h.Write(d)
	}
	return h.Sum(nil)
}

// Hex32 renders bytes as 0x-prefixed lowercase hex.
func Hex(b []byte) string { return "0x" + hex.EncodeToString(b) }

// DecodeHex accepts 0x-prefixed or bare hex.
func DecodeHex(s string) ([]byte, error) {
	return hex.DecodeString(strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X"))
}

// Canonical returns the RFC 8785 (JCS) form of v. v may be raw JSON bytes or any value
// encoding/json can marshal.
func Canonical(v any) ([]byte, error) {
	raw, ok := v.([]byte)
	if !ok {
		var err error
		if raw, err = json.Marshal(v); err != nil {
			return nil, err
		}
	}
	return jcs.Transform(raw)
}

// KeccakCanonical is keccak256(JCS(v)) as 0x hex.
func KeccakCanonical(v any) (string, error) {
	c, err := Canonical(v)
	if err != nil {
		return "", err
	}
	return Hex(Keccak256(c)), nil
}

// PersonalHash is the EIP-191 personal_sign hash of a message.
func PersonalHash(msg []byte) []byte {
	prefix := fmt.Sprintf("\x19Ethereum Signed Message:\n%d", len(msg))
	return Keccak256([]byte(prefix), msg)
}

// AddressOf returns the lowercase 0x address of a public key.
func AddressOf(pub *secp256k1.PublicKey) string {
	return Hex(Keccak256(pub.SerializeUncompressed()[1:])[12:])
}

// Recover returns the lowercase address that produced sig (r||s||v, v in {0,1,27,28})
// over the EIP-191 hash of msg.
func Recover(msg []byte, sigHex string) (string, error) {
	sig, err := DecodeHex(sigHex)
	if err != nil || len(sig) != 65 {
		return "", errors.New("signature must be 65 bytes")
	}
	v := sig[64]
	if v >= 27 {
		v -= 27
	}
	if v > 1 {
		return "", errors.New("bad recovery id")
	}
	compact := make([]byte, 65)
	compact[0] = 27 + v
	copy(compact[1:], sig[:64])
	pub, _, err := ecdsa.RecoverCompact(compact, PersonalHash(msg))
	if err != nil {
		return "", err
	}
	return AddressOf(pub), nil
}

// Key is a secp256k1 private key with its address.
type Key struct {
	priv *secp256k1.PrivateKey
}

// NewKey makes a random key.
func NewKey() (*Key, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	return &Key{priv: secp256k1.PrivKeyFromBytes(b)}, nil
}

// KeyFromHex loads a 32-byte private key.
func KeyFromHex(s string) (*Key, error) {
	b, err := DecodeHex(strings.TrimSpace(s))
	if err != nil || len(b) != 32 {
		return nil, errors.New("private key must be 32 bytes of hex")
	}
	return &Key{priv: secp256k1.PrivKeyFromBytes(b)}, nil
}

func (k *Key) Hex() string     { return Hex(k.priv.Serialize()) }
func (k *Key) Address() string { return AddressOf(k.priv.PubKey()) }
func (k *Key) PublicKeyHex() string {
	return Hex(k.priv.PubKey().SerializeUncompressed())
}

// SignPersonal signs msg with EIP-191 and returns 0x r||s||v (v = 27/28).
func (k *Key) SignPersonal(msg []byte) string {
	compact := ecdsa.SignCompact(k.priv, PersonalHash(msg), false)
	out := make([]byte, 65)
	copy(out, compact[1:])
	out[64] = compact[0]
	return Hex(out)
}
