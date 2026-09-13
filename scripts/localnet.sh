#!/usr/bin/env bash
#
# Bring up the three layers MASKED runs against.
#
#   :8999  base L1   — mb-test-validator (solana-test-validator preloaded with
#                      the delegation program DELeGG… and the permission
#                      program ACLseo…), plus MagicBlock's committor program
#                      ComtrB2K…, which mb-test-validator leaves out. Escrow
#                      lives here; matches settle here.
#   :7799  rollup    — ephemeral-validator. Delegated Positions and the private
#                      AMM live here. This is the validator's own port, and it
#                      answers anyone who asks.
#   :6699  public    — query-filtering-service. The front door. It reads
#                      ACLseo… to decide who may see what, so a caller with no
#                      permission grant cannot read a sealed Position through
#                      it. This — not :7799 — is what "a public RPC" means when
#                      we claim a position is private, and it is the only ER
#                      endpoint the app is ever pointed at.
#
# MagicBlock ships `mb-stack`, which starts all three, but it forwards extra
# arguments to the base validator only — and the public front needs CORS of its
# own, or a browser cannot reach it. So the three are started here directly.
#
# All three keep their state under one directory, so resetting the base chain
# and leaving the rollup's ledger behind is not possible. That mistake is
# quiet and very confusing: the rollup keeps running against a chain that no
# longer exists, accepts a commit, schedules it, and then fails to land it with
# `ProgramAccountNotFound` from a slot tens of thousands ahead of the base.
#
set -euo pipefail

BASE_PORT="${MB_BASE_PORT:-8999}"
ER_PORT="${MB_ER_PORT:-7799}"
PUBLIC_PORT="${MB_PUBLIC_PORT:-6699}"
HOST=127.0.0.1

# Ledgers live beside the repo, not in /tmp.
#
# The base layer writes on the order of a gigabyte an hour and TMPDIR is on the
# boot volume, so a long session there fills the disk — at which point nothing
# can write, including the tools you would use to clean it up. Kept here it is
# visible, gitignored, and on whatever volume the repo is on.
DIR="${MASKED_LEDGER_DIR:-$(cd "$(dirname "$0")/.." && pwd)/.localnet}"
mkdir -p "$DIR"

# Listening sockets only. A bare `lsof -ti:<port>` also matches client sockets
# whose *remote* end is that port — the rollup's own connections to the base
# layer, a browser polling it — so a dead base layer read as "already up" and
# was never restarted.
up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }

# MASKED_RESET=1 starts from genesis on every layer at once.
if [ "${MASKED_RESET:-}" = "1" ]; then
  echo "resetting $DIR"
  for p in "$BASE_PORT" "$ER_PORT" "$PUBLIC_PORT"; do
    lsof -ti:"$p" 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
  sleep 2
  rm -rf "$DIR/ledger" "$DIR/er"
fi

wait_rpc() {           # wait_rpc <port> <name>
  for _ in $(seq 1 120); do
    curl -fsS "http://$HOST:$1" -X POST -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q ok && return 0
    sleep 2
  done
  echo "!! $2 never became healthy on :$1 — see $DIR" >&2
  return 1
}

# The committor program, which mb-test-validator does not preload.
#
# The rollup brings an account home one of two ways. A small change goes to
# Solana as instruction data in one transaction. A change too big for that — a
# position after twenty-odd fills has rewritten a couple of hundred of its 559
# bytes — is first staged into a buffer account owned by ComtrB2K…, and on a
# base layer without that program every one of those transactions fails with
# `ProgramAccountNotFound`. The rollup neither marks the commit failed nor
# retries it: it stays pending, the position stays delegated, and the pot can
# never be settled. So a quiet round came home and a busy one stranded.
#
# It is MagicBlock's own deployed program, fetched from devnet once and kept
# beside the ledgers. Genesis programs only load into a new ledger, so an
# existing one is checked below rather than assumed.
COMMITTOR=ComtrB2KEaWgXsW1dhr1xYL4Ht4Bjj3gXnnL6KMdABq
COMMITTOR_SO="$DIR/programs/$COMMITTOR.so"
if [ ! -s "$COMMITTOR_SO" ]; then
  mkdir -p "$DIR/programs"
  if solana program dump "$COMMITTOR" "$COMMITTOR_SO" --url https://api.devnet.solana.com >/dev/null 2>&1; then
    echo "fetched the committor program $COMMITTOR from devnet"
  else
    rm -f "$COMMITTOR_SO"
    echo "!! could not fetch the committor program $COMMITTOR from devnet — a busy round will not settle on this stack" >&2
  fi
fi
BASE_EXTRA=()
if [ -s "$COMMITTOR_SO" ]; then
  BASE_EXTRA=(--bpf-program "$COMMITTOR" "$COMMITTOR_SO")
fi

if up "$BASE_PORT"; then
  echo "base   already up on :$BASE_PORT"
else
  echo "starting base on :$BASE_PORT"
  # --limit-ledger-size is a shred count, not a byte count. The default is
  #   200,000,000, which this validator never reaches in a session, so it is
  #   effectively unbounded — 50,000,000 keeps the ledger to a few hundred MB
  #   while still holding far more history than /proof replays.
  # --faucet-port: off the 9900 default, so a test validator from another
  #   project does not fight ours for it.
  # BASE_EXTRA: the committor program, above. mb-test-validator passes extra
  #   arguments through to solana-test-validator.
  mb-test-validator \
    --rpc-port "$BASE_PORT" \
    --ledger "$DIR/ledger" \
    --faucet-port 9899 \
    --limit-ledger-size 50000000 \
    ${BASE_EXTRA[@]+"${BASE_EXTRA[@]}"} \
    >"$DIR/base.log" 2>&1 &
  wait_rpc "$BASE_PORT" base
fi

# A ledger created before the preload has no committor, and --bpf-program on an
# existing ledger does nothing. Say so now, not after the first busy round.
if ! curl -fsS "http://$HOST:$BASE_PORT" -X POST -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$COMMITTOR\",{\"encoding\":\"base64\",\"dataSlice\":{\"offset\":0,\"length\":0}}]}" 2>/dev/null \
    | grep -q '"executable":true'; then
  echo "!! the base layer has no committor program ($COMMITTOR): a round with enough trading to need a buffered commit will never come home. Start from genesis: MASKED_RESET=1 $0" >&2
fi

# Fund the keypairs the scripts sign with, every time the base layer is up.
#
# Nothing else does. `check:er` signs as player-a and `npm run seed` tops up
# only its own roster (b–e), so after MASKED_RESET=1 the suite went red at
# `check:er` on fees — a failure that says nothing about the product. Topping up
# anything under 5 SOL is idempotent, so a restart without a reset costs nothing.
#
# Relative paths on purpose: `solana-keygen` parses its argument as a signer
# URI, and an absolute path with a space in it — this repo lives under
# "Extreme SSD" — is refused as "unrecognized signer source". And nothing here
# may abort the script: under `set -e` one failed lookup stopped it before the
# rollup and the gate were even checked.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if command -v solana >/dev/null 2>&1 && [ -d "$ROOT/.keys" ]; then
  (
    cd "$ROOT"
    for k in .keys/player-*.json; do
      [ -f "$k" ] || continue
      pk="$(solana-keygen pubkey "$k" 2>/dev/null)" || { echo "!! cannot read $k" >&2; continue; }
      bal="$(solana balance "$pk" --url "http://$HOST:$BASE_PORT" 2>/dev/null | awk '{print int($1)}')" || bal=0
      if [ "${bal:-0}" -lt 5 ]; then
        if solana airdrop 20 "$pk" --url "http://$HOST:$BASE_PORT" >/dev/null 2>&1; then
          echo "funded $k $pk with 20 SOL"
        else
          echo "!! could not fund $k $pk — scripts signing as it will fail on fees" >&2
        fi
      fi
    done
  ) || true
fi

if up "$ER_PORT"; then
  echo "rollup already up on :$ER_PORT"
else
  echo "starting rollup on :$ER_PORT"
  # --no-tui: the published build has a TUI, and with stdio redirected (no TTY)
  #   it exits immediately. This stack is headless.
  ephemeral-validator \
    --no-tui \
    --storage "$DIR/er" \
    --listen "$HOST:$ER_PORT" \
    --remotes "http://$HOST:$BASE_PORT" \
    --remotes "ws://$HOST:$((BASE_PORT + 1))" \
    >"$DIR/er.log" 2>&1 &
  wait_rpc "$ER_PORT" rollup
fi

if up "$PUBLIC_PORT"; then
  echo "public already up on :$PUBLIC_PORT"
else
  echo "starting public front on :$PUBLIC_PORT"
  query-filtering-service \
    --listen-addr "$HOST:$PUBLIC_PORT" \
    --listen-addr-ws "$HOST:$((PUBLIC_PORT + 1))" \
    --ephemeral-url "http://$HOST:$ER_PORT" \
    --ephemeral-url-ws "ws://$HOST:$((ER_PORT + 1))" \
    --add-cors-headers \
    >"$DIR/public.log" 2>&1 &
  # The front is a proxy, not a validator: it answers getHealth only once the
  # ER behind it does, so poll the port rather than the health of a ledger.
  for _ in $(seq 1 60); do up "$PUBLIC_PORT" && break; sleep 1; done
fi

echo
for p in "$BASE_PORT:base" "$ER_PORT:rollup" "$PUBLIC_PORT:public"; do
  printf '%-7s :%s  %s\n' "${p##*:}" "${p%%:*}" \
    "$(curl -s "http://$HOST:${p%%:*}" -X POST -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null || echo unreachable)"
done
echo "logs: $DIR/{base,er,public}.log"
