#!/usr/bin/env bash
# OraclesDisagree, refused on chain.
#
# The live oracles agree, so the refusal cannot be seen on devnet. This runs the real program on an
# isolated test validator (its own ledger and ports, nothing shared with the local stack) with the
# three oracle accounts dumped from devnet — Pyth SOL/USD, Pyth USDC/USD and the pinned Switchboard
# SOL/USD feed — moving only their timestamps to the present and Switchboard's price 3% above Pyth's
# (scripts/oracle-fixtures.mjs). A USDC/SOL round goes live and push_price_pyth must be refused with
# OraclesDisagree, after every owner, feed-hash, freshness and Pyth check has passed.
#
#   anchor build   # chain/target/deploy/fogduel.so
#   scripts/check-oracles-disagree.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
U="${ORACLE_SOURCE_RPC:-https://rpc.magicblock.app/devnet}"
PORT=18999
cleanup() { [ -n "${VPID:-}" ] && kill "$VPID" 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT
if solana cluster-version --url "http://127.0.0.1:$PORT" >/dev/null 2>&1; then echo "something already serves :$PORT" >&2; exit 1; fi
cd "$WORK"
solana account 9Casyq1esMPojvbYHYrSZe5XZZRaWHmXNkkfvYqjQuqP --output json --url "$U" > sb.json
solana account 7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE --output json --url "$U" > pyth-sol.json
solana account Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX --output json --url "$U" > pyth-usdc.json
node "$ROOT/scripts/oracle-fixtures.mjs"
solana-test-validator --reset --ledger "$WORK/ledger" --bind-address 127.0.0.1 --rpc-port "$PORT" --faucet-port 19900 --gossip-port 18000 --dynamic-port-range 18100-18300 \
  --bpf-program 3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1 "$ROOT/chain/target/deploy/fogduel.so" \
  --account 9Casyq1esMPojvbYHYrSZe5XZZRaWHmXNkkfvYqjQuqP sb.json \
  --account 7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE pyth-sol.json \
  --account Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX pyth-usdc.json \
  --quiet > validator.log 2>&1 &
VPID=$!
for _ in $(seq 1 60); do solana cluster-version --url "http://127.0.0.1:$PORT" >/dev/null 2>&1 && break; kill -0 "$VPID" 2>/dev/null || { tail -5 validator.log >&2; exit 1; }; sleep 1; done
cd "$ROOT" && EXPO_PUBLIC_L1_URL="http://127.0.0.1:$PORT" npx tsx scripts/check-oracles-disagree.mts
