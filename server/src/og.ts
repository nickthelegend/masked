/**
 * A settled duel as a share card: a 1200×630 PNG, and the page that names it.
 *
 * Link previews (X, Discord, Telegram, Slack) read `og:image` from the HTML a
 * link returns, and a static export returns the same HTML for every tape — so
 * the card has to come from a server. This draws it with no image library: a
 * 5×7 pixel font (the app's own look), filled rectangles, and a PNG encoder
 * over `node:zlib`.
 *
 * Every figure on it is off the tape `getTape` returned: both markets, both
 * results, the pot and the replayed equity. Addresses are left off the image
 * because the font has no lowercase and base58 is case-sensitive; the page
 * text carries them.
 */
import { deflateSync } from 'node:zlib';

/* The app's palette, copied from src/ui/tokens.ts. */
const PALETTE = {
  bg: '#080d24',
  panelLight: '#24398a',
  chartBg: '#0d1436',
  yellow: '#ffd21e',
  green: '#2fbf5c',
  red: '#ff4d5e',
  cyan: '#35e0ff',
  magenta: '#ff4dd2',
  text: '#c8d3f7',
  textDim: '#8fa2e0',
  textFaint: '#6f83c8',
};

export interface CardSide {
  market: { symbol: string };
  pnlBps: number;
  liquidated: boolean;
  fillCount: number;
  windowNote: string | null;
  equity: { ts: number; bps: number }[] | null;
}

export interface CardTape {
  match: string;
  winner: string;
  potPaid: number;
  rake: number;
  entry: number | null;
  a: CardSide & { player: string };
  b: CardSide & { player: string };
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** 5×7 glyphs, top row first. Anything missing draws as `?`. */
const GLYPHS: Record<string, string> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '####. ....# ....# .###. ....# ....# ####.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  ' ': '..... ..... ..... ..... ..... ..... .....',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  ',': '..... ..... ..... ..... .##.. ..#.. .#...',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  '·': '..... ..... ..... .##.. .##.. ..... .....',
  '◎': '..... .###. #...# #.#.# #...# .###. .....',
  '…': '..... ..... ..... ..... ..... ..... #.#.#',
  '$': '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  _: '..... ..... ..... ..... ..... ..... #####',
};
const BITS = new Map(Object.entries(GLYPHS).map(([ch, rows]) => [ch, rows.split(' ')]));

class Canvas {
  readonly px: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint8Array(w * h * 3);
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }

  static textWidth(s: string, scale: number) {
    return s.length === 0 ? 0 : [...s].length * 6 * scale - scale;
  }

  text(s: string, x: number, y: number, scale: number, c: Rgb) {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const rows = BITS.get(ch) ?? BITS.get('?')!;
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < 5; rx++) if (row[rx] === '#') this.rect(cx + rx * scale, y + ry * scale, scale, scale, c);
      });
      cx += 6 * scale;
    }
  }

  /** A segment `t` pixels thick, stamped along its length. */
  line(x0: number, y0: number, x1: number, y1: number, t: number, c: Rgb) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      this.rect(x0 + (x1 - x0) * k - t / 2, y0 + (y1 - y0) * k - t / 2, t, t, c);
    }
  }

  png(): Buffer {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      const row = y * (this.w * 3 + 1);
      raw[row] = 0; // filter: none
      raw.set(this.px.subarray(y * this.w * 3, (y + 1) * this.w * 3), row + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export const pct = (bps: number) => `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;
/** Lamports as SOL, to at most three places, without trailing zeros. */
export const solAmount = (lamports: number) => `${Number((lamports / 1e9).toFixed(3))}`;
export const shortKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;
const fit = (s: string, max: number) => ([...s].length > max ? `${[...s].slice(0, max - 1).join('')}…` : s);

export const CARD_W = 1200;
export const CARD_H = 630;

/** The share card for one settled tape, as PNG bytes. */
export function renderTapeCard(tape: CardTape, clusterLabel: string): Buffer {
  const c = new Canvas(CARD_W, CARD_H);
  const P = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, rgb(v)])) as Record<keyof typeof PALETTE, Rgb>;

  c.rect(0, 0, CARD_W, CARD_H, P.bg);
  c.rect(0, 0, CARD_W, 8, P.panelLight);
  c.rect(0, CARD_H - 8, CARD_W, 8, P.panelLight);
  c.rect(0, 0, 8, CARD_H, P.panelLight);
  c.rect(CARD_W - 8, 0, 8, CARD_H, P.panelLight);

  c.text('MASKED', 60, 48, 10, P.yellow);
  const head = 'FOG DUEL · SETTLED';
  c.text(head, CARD_W - 60 - Canvas.textWidth(head, 3), 58, 3, P.textDim);
  const sub = `SOLANA ${clusterLabel}`;
  c.text(sub, CARD_W - 60 - Canvas.textWidth(sub, 3), 92, 3, P.textFaint);

  const sides = [
    { s: tape.a, x: 60, tone: P.cyan, won: tape.winner === tape.a.player },
    { s: tape.b, x: 630, tone: P.magenta, won: tape.winner === tape.b.player },
  ];
  for (const { s, x, tone, won } of sides) {
    c.text(fit((s.market.symbol || 'UNNAMED').toUpperCase(), 14), x, 160, 6, tone);
    c.text(pct(s.pnlBps), x, 222, 11, s.pnlBps >= 0 ? P.green : P.red);
    const fills = `${s.fillCount} FILL${s.fillCount === 1 ? '' : 'S'}${s.liquidated ? ' · LIQUIDATED' : ''}`;
    c.text(fills, x, 314, 3, P.textDim);
    if (won) c.text('TOOK THE POT', x + Canvas.textWidth(fills, 3) + 24, 314, 3, P.yellow);
  }

  // Both replayed curves on one scale, over the fills' own timestamps.
  const box = { x: 60, y: 356, w: CARD_W - 120, h: 180 };
  c.rect(box.x, box.y, box.w, box.h, P.chartBg);
  const series = sides.map(({ s, tone }) => ({ pts: s.equity ?? [], tone }));
  const all = series.flatMap((x) => x.pts);
  if (tape.entry === null || all.length === 0) {
    c.text('MATCH CLOSED · ENTRY GONE · FILLS STILL ON CHAIN', box.x + 24, box.y + box.h / 2 - 10, 3, P.textFaint);
  } else {
    const t0 = Math.min(...all.map((p) => p.ts));
    const t1 = Math.max(...all.map((p) => p.ts));
    const lo = Math.min(0, ...all.map((p) => p.bps));
    const hi = Math.max(0, ...all.map((p) => p.bps));
    const pad = 20;
    const X = (ts: number) => box.x + pad + (t1 === t0 ? 0 : ((ts - t0) / (t1 - t0)) * (box.w - 2 * pad));
    const Y = (bps: number) => box.y + pad + (hi === lo ? (box.h - 2 * pad) / 2 : ((hi - bps) / (hi - lo)) * (box.h - 2 * pad));
    for (let x = box.x + pad; x < box.x + box.w - pad; x += 24) c.rect(x, Y(0) - 1, 12, 3, P.panelLight);
    for (const { pts, tone } of series) {
      for (let i = 1; i < pts.length; i++) c.line(X(pts[i - 1].ts), Y(pts[i - 1].bps), X(pts[i].ts), Y(pts[i].bps), 5, tone);
      for (const p of pts) c.rect(X(p.ts) - 6, Y(p.bps) - 6, 12, 12, tone);
    }
    const notes = sides.map(({ s }) => s.windowNote).filter(Boolean);
    if (notes.length) c.text(notes.join(' · '), box.x + 12, box.y + box.h - 26, 2, P.textFaint);
  }

  // "SOL" rather than ◎: at this size the pixel font draws ◎ as a lowercase o.
  c.text(`POT ${solAmount(tape.potPaid + tape.rake)} SOL · PAID ${solAmount(tape.potPaid)} SOL · RAKE ${solAmount(tape.rake)} SOL`, 60, 560, 3, P.text);
  c.text('PRIVATE DURING THE FIGHT. PUBLIC AFTER.', 60, 596, 2, P.textFaint);
  return c.png();
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Title and description for a tape, shared by the page, its tags and the share intent. */
export function tapeShareText(tape: CardTape) {
  const title = `${tape.a.market.symbol || 'UNNAMED'} ${pct(tape.a.pnlBps)} vs ${tape.b.market.symbol || 'UNNAMED'} ${pct(tape.b.pnlBps)} · MASKED`;
  const description =
    `A settled fog duel: ${shortKey(tape.winner)} took ${solAmount(tape.potPaid)} SOL. ` +
    'Both positions were sealed on a MagicBlock rollup for the whole round; the tape is public now.';
  return { title, description };
}

/**
 * The page a shared link lands on: preview tags for the crawler, and a
 * redirect to the tape in the app for a person.
 */
export function sharePageHtml(tape: CardTape, urls: { page: string; image: string; app: string }) {
  const { title, description } = tapeShareText(tape);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MASKED">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(urls.page)}">
<meta property="og:image" content="${esc(urls.image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="${CARD_W}">
<meta property="og:image:height" content="${CARD_H}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(urls.image)}">
<meta http-equiv="refresh" content="0; url=${esc(urls.app)}">
</head><body style="background:#1b1530;color:#f4f1ff;font-family:monospace;padding:24px">
<p><a style="color:#ffd23f" href="${esc(urls.app)}">Open the tape for match ${esc(tape.match)}</a></p>
<img src="${esc(urls.image)}" width="600" height="315" alt="${esc(title)}">
</body></html>`;
}
