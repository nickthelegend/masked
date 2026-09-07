/**
 * A recording pass-through for a Solana RPC endpoint.
 *
 * Used to answer one question that cannot be answered from inside the page:
 * *which accounts does the app actually ask the rollup for?* The RPC client
 * captures `fetch` when it loads, long before anything in the page can wrap
 * it, so a spy installed at runtime sees nothing. Sitting on the wire does.
 *
 * Every JSON-RPC call is appended to a log as {method, accounts}, and the
 * request is forwarded untouched.
 *
 *   node server/rpc-recorder.mjs http://127.0.0.1:6699 7010 .localnet/rpc.log
 */
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';

const UPSTREAM = process.argv[2] ?? 'http://127.0.0.1:6699';
const PORT = Number(process.argv[3] ?? 7010);
const LOG = process.argv[4] ?? '.localnet/rpc.log';

writeFileSync(LOG, '');

/** Base58 keys are the interesting part of nearly every params list. */
const KEYS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

const record = (raw) => {
  let calls;
  try {
    const body = JSON.parse(raw);
    calls = Array.isArray(body) ? body : [body];
  } catch {
    return;
  }
  for (const c of calls) {
    if (!c?.method) continue;
    const keys = [...new Set(JSON.stringify(c.params ?? []).match(KEYS) ?? [])];
    appendFileSync(LOG, `${JSON.stringify({ m: c.method, keys })}\n`);
  }
};

createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const raw = Buffer.concat(chunks).toString();
    if (raw) record(raw);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': '*',
      });
      return res.end();
    }

    try {
      const r = await fetch(UPSTREAM + req.url, {
        method: req.method,
        headers: { 'content-type': 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
        body: req.method === 'POST' ? raw : undefined,
      });
      const text = await r.text();
      res.writeHead(r.status, {
        'content-type': r.headers.get('content-type') ?? 'application/json',
        'access-control-allow-origin': '*',
      });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ error: String(e?.message ?? e) }));
    }
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`recording ${UPSTREAM} on :${PORT} -> ${LOG}`);
});
