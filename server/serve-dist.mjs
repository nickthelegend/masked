/**
 * Serve the production web export — `dist/` — the way a static host would.
 *
 * The export is a single-page app: `/play`, `/stats` and `/tape/<match>` exist
 * only as routes inside `index.html`, so a plain file server answers a refresh
 * on any of them with 404. This answers every extension-less path with the
 * matching HTML file if the export wrote one, and `index.html` otherwise, and
 * lets the router take it from there.
 *
 * A missing *file* is still a 404, never `index.html`. A page that asks for a
 * chunk that is not there — a stale export, a half-copied `dist/` — must fail
 * visibly in the network panel. Answering it with HTML gets that HTML parsed as
 * JavaScript, and the syntax error it throws points nowhere near the cause.
 *
 * Bound to 127.0.0.1 like the market proxy: this is for a person at this
 * machine, not a deployment.
 *
 *   npm run serve                   # :4180
 *   npm run serve -- --port 4190    # or SERVE_PORT=4190
 *   npm run serve -- --dir <export> # a different export directory
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// 4173 and 8081 — the ports the docs used to name — are held by other projects
// on the machine this was built on, and a collision there serves someone else's
// app under this one's URL.
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const PORT = Number(flag('--port') ?? process.env.SERVE_PORT ?? 4180);
// --dir serves another export, so a production bundle can be checked without
// replacing the dist/ that someone else may be testing against.
const ROOT = resolve(flag('--dir') ?? fileURLToPath(new URL('../dist', import.meta.url)));
const INDEX = join(ROOT, 'index.html');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
};

function fileAt(path) {
  try {
    const s = statSync(path);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

function plain(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`${body}\n`);
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    plain(res, 400, 'malformed path');
    return;
  }

  // Resolve inside dist/ or not at all — `/../.keys/player-a.json` is a path too.
  const target = resolve(ROOT, `.${pathname}`);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    plain(res, 403, 'outside dist/');
    return;
  }

  // A real file always wins. An extension-less path is a route, not a file.
  let file = fileAt(target) ? target : null;
  if (!file && extname(pathname) === '') {
    file = [`${target}.html`, join(target, 'index.html'), INDEX].find((p) => fileAt(p)) ?? null;
  }
  if (!file) {
    plain(res, 404, `not in dist/: ${pathname}`);
    return;
  }

  const stat = fileAt(file);
  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': stat.size,
    // Hashed bundle names change with their contents, so they can be kept
    // forever. Anything else — index.html above all — must be re-checked, or a
    // rebuilt export keeps loading yesterday's bundle.
    'cache-control': file.includes(`${sep}_expo${sep}static${sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

if (!fileAt(INDEX)) {
  console.error(`no ${INDEX} — export first: npx expo export --platform web --output-dir dist --clear`);
  process.exit(1);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`:${PORT} is already taken by another process — choose one with --port or SERVE_PORT`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dist/ on http://127.0.0.1:${PORT} — routes fall back to index.html, missing files 404`);
});
