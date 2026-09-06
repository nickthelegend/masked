#!/usr/bin/env bash
#
# Bring up the three layers MASKED runs against.
#
#   :8999  base L1   — mb-test-validator (solana-test-validator preloaded with
#                      the delegation program DELeGG… and the permission
#                      program ACLseo…). Escrow lives here; matches settle here.
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
set -euo pipefail

BASE_PORT="${MB_BASE_PORT:-8999}"
ER_PORT="${MB_ER_PORT:-7799}"
PUBLIC_PORT="${MB_PUBLIC_PORT:-6699}"
HOST=127.0.0.1

DIR="${MASKED_LEDGER_DIR:-${TMPDIR:-/tmp}/masked-localnet}"
mkdir -p "$DIR"

up() { lsof -ti:"$1" >/dev/null 2>&1; }

wait_rpc() {           # wait_rpc <port> <name>
  for _ in $(seq 1 120); do
    curl -fsS "http://$HOST:$1" -X POST -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q ok && return 0
    sleep 2
  done
  echo "!! $2 never became healthy on :$1 — see $DIR" >&2
  return 1
}

if up "$BASE_PORT"; then
  echo "base   already up on :$BASE_PORT"
else
  echo "starting base on :$BASE_PORT"
  # --limit-ledger-size: /proof replays the whole match history, and the
  #   default 100MB prunes it out from under us inside an hour.
  # --faucet-port: off the 9900 default, so a test validator from another
  #   project does not fight ours for it.
  mb-test-validator \
    --rpc-port "$BASE_PORT" \
    --ledger "$DIR/ledger" \
    --faucet-port 9899 \
    --limit-ledger-size 500000000 \
    >"$DIR/base.log" 2>&1 &
  wait_rpc "$BASE_PORT" base
fi

if up "$ER_PORT"; then
  echo "rollup already up on :$ER_PORT"
else
  echo "starting rollup on :$ER_PORT"
  # --no-tui: the published build has a TUI, and with stdio redirected (no TTY)
  #   it exits immediately. This stack is headless.
  ephemeral-validator \
    --no-tui \
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
