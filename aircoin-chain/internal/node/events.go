package node

import (
	"bytes"
	"encoding/base64"
	"sync"

	"github.com/prabhu-omkar/aircoin/aircoin-chain/internal/chain"
)

// EventLog keeps recent committed events and fans them out to WebSocket subscribers.
type EventLog struct {
	mu     sync.Mutex
	max    int
	recent []chain.Event
	subs   map[chan chain.Event]struct{}
}

func NewEventLog(max int) *EventLog {
	return &EventLog{max: max, subs: map[chan chain.Event]struct{}{}}
}

func (l *EventLog) Publish(e chain.Event) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.recent = append(l.recent, e)
	if len(l.recent) > l.max {
		l.recent = l.recent[len(l.recent)-l.max:]
	}
	for ch := range l.subs {
		select {
		case ch <- e:
		default: // slow subscriber: drop rather than stall consensus
		}
	}
}

func (l *EventLog) Recent(n int) []chain.Event {
	l.mu.Lock()
	defer l.mu.Unlock()
	if n <= 0 || n > len(l.recent) {
		n = len(l.recent)
	}
	out := make([]chain.Event, n)
	copy(out, l.recent[len(l.recent)-n:])
	return out
}

func (l *EventLog) Subscribe() chan chain.Event {
	ch := make(chan chain.Event, 256)
	l.mu.Lock()
	l.subs[ch] = struct{}{}
	l.mu.Unlock()
	return ch
}

func (l *EventLog) Unsubscribe(ch chan chain.Event) {
	l.mu.Lock()
	delete(l.subs, ch)
	l.mu.Unlock()
}

func base64Eq(b64 string, raw []byte) bool {
	b, err := base64.StdEncoding.DecodeString(b64)
	return err == nil && bytes.Equal(b, raw)
}
