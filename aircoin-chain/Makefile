.PHONY: build pi test localnet stop simulate
build:            ; go build -o bin/aircoind ./cmd/aircoind
pi:               ; CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o bin/aircoind-linux-arm64 ./cmd/aircoind
test:             ; go test ./...
localnet:         ; scripts/localnet.sh 4
stop:             ; scripts/localnet.sh stop
simulate:         ; scripts/simulate.sh
