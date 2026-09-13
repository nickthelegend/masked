/**
 * The reveal as a picture: a PNG of the settled result, drawn on a canvas.
 *
 * Drawn, not screenshotted. A capture of the screen would carry whatever else
 * was on it — the curtain mid-tear, a toast, a scrollbar — and would need a
 * library that re-renders the DOM. This paints the result from the same inputs
 * the reveal renders: the chain's outcome, both players' PnL, and both lanes
 * replayed from the fills `settle_match` wrote into the public tape. Nothing on
 * the card is typed in by hand, and the tape link printed on it lets anyone
 * check it.
 *
 * Web only, where there is a canvas. A PNG, not a GIF: an animated capture
 * would need an encoder the app does not ship, and the result is a still.
 */
import { color, font } from './theme';
import type { EquityPoint } from '../chain/tape';

export interface RevealCardPlayer {
  rank: number;
  name: string;
  you: boolean;
  /** Percent, as the board shows it. */
  pnl: number;
  symbol: string | null;
  liquidated: boolean;
}

export interface RevealCardInput {
  won: boolean;
  headline: string;
  /** The pot won or the stake lost, formatted. */
  amount: string;
  /** Winner first, in the chain's order. */
  players: RevealCardPlayer[];
  /** Both lanes, replayed from the settled tape. */
  you: EquityPoint[];
  them: EquityPoint[];
  opponentName: string;
  /** "LAST 16 OF 25 FILLS" when a lane is drawn from a truncated side. */
  youNote?: string | null;
  themNote?: string | null;
  fills: string;
  startTs: number;
  duration: number;
  moves: string | null;
  record: string | null;
  /** The public tape's URL. */
  link: string | null;
}

export type RevealCardOutcome = 'shared' | 'saved' | 'cancelled';

/** Whether this runtime can draw and hand over the picture at all. */
export const canExportRevealCard: boolean =
  typeof document !== 'undefined' &&
  typeof document.createElement === 'function' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.toBlob === 'function';

const W = 1200;
const H = 675;
const M = 44;

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Draw the card and encode it. */
export async function drawRevealCard(input: RevealCardInput): Promise<Blob> {
  // The pixel faces are web fonts. A canvas drawn before they load quietly
  // falls back to a system face, so both are loaded first.
  if (typeof document.fonts?.load === 'function') {
    await Promise.all([document.fonts.load(`32px ${font.display}`), document.fonts.load(`20px ${font.body}`)]).catch(
      () => undefined
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2D canvas to draw on');

  const display = (px: number) => `${px}px ${font.display}, monospace`;
  const body = (px: number) => `${px}px ${font.body}, monospace`;
  const segment = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  // Ground and frame.
  ctx.fillStyle = color.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = color.panelLight;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  // Masthead: what this is, and when the round ended.
  ctx.textAlign = 'left';
  ctx.fillStyle = color.textDim;
  ctx.font = body(22);
  ctx.fillText('MASKED · 1V1 TRADING DUEL ON SOLANA', M, 58);
  ctx.textAlign = 'right';
  const ended = new Date((input.startTs + input.duration) * 1000).toISOString().slice(0, 16).replace('T', ' ');
  ctx.fillText(`${ended} UTC`, W - M, 58);

  // Headline and the amount won or lost.
  ctx.textAlign = 'left';
  ctx.fillStyle = color.yellow;
  ctx.font = display(40);
  ctx.fillText(input.headline, M, 128);
  ctx.font = display(24);
  const amountW = ctx.measureText(input.amount).width + 28;
  ctx.fillStyle = input.won ? color.green : color.red;
  ctx.fillRect(M, 150, amountW, 46);
  ctx.fillStyle = color.white;
  ctx.fillText(input.amount, M + 14, 185);

  // The board, winner first.
  const colW = 470;
  let y = 234;
  for (const p of input.players) {
    ctx.fillStyle = p.you ? color.panelLight : color.panel;
    ctx.fillRect(M, y, colW, 92);
    ctx.fillStyle = p.rank === 1 ? color.yellow : color.textDim;
    ctx.font = display(22);
    ctx.fillText(`#${p.rank}`, M + 16, y + 42);
    ctx.fillStyle = color.white;
    ctx.font = body(26);
    ctx.fillText(ellipsize(ctx, p.you ? `${p.name} (YOU)` : p.name, 230), M + 84, y + 40);
    ctx.fillStyle = color.textDim;
    ctx.font = body(20);
    const sub = [p.symbol ? `$${p.symbol.replace(/^\$/, '').toUpperCase()}` : null, p.liquidated ? 'LIQUIDATED' : null]
      .filter(Boolean)
      .join(' · ');
    ctx.fillText(ellipsize(ctx, sub || '—', 230), M + 84, y + 72);
    ctx.textAlign = 'right';
    ctx.font = display(22);
    ctx.fillStyle = p.pnl > 0 ? color.green : p.pnl < 0 ? color.red : color.white;
    ctx.fillText(pct(p.pnl), M + colW - 16, y + 58);
    ctx.textAlign = 'left';
    y += 106;
  }
  ctx.fillStyle = color.textFaint;
  ctx.font = body(20);
  ctx.fillText(input.fills, M, y + 20);

  // The timeline, from the tape: both lanes on one time axis and one scale.
  const tx = M + colW + 40;
  const ty = 150;
  const tw = W - M - tx;
  const th = 320;
  ctx.fillStyle = color.chartBg;
  ctx.fillRect(tx, ty, tw, th);
  ctx.fillStyle = color.textDim;
  ctx.font = body(18);
  ctx.fillText('ROUND TIMELINE · REPLAYED FROM THE SETTLED TAPE', tx + 14, ty + 30);

  const px0 = tx + 16;
  const pw = tw - 32;
  const py0 = ty + 50;
  const ph = th - 100;
  const all = [...input.you, ...input.them];
  const buzzer = input.startTs + input.duration;
  const end = all.reduce((m, p) => Math.max(m, p.ts), buzzer);
  const start = all.reduce((m, p) => Math.min(m, p.ts), input.startTs);
  const span = Math.max(1, end - start);
  const reachBps = Math.max(1, all.reduce((m, p) => Math.max(m, Math.abs(p.bps)), 0));
  const X = (ts: number) => px0 + ((ts - start) / span) * pw;
  const Y = (bps: number) => py0 + ph / 2 - (bps / reachBps) * (ph / 2 - 8);

  ctx.strokeStyle = color.panel;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  segment(px0, py0 + ph / 2, px0 + pw, py0 + ph / 2);
  ctx.setLineDash([]);
  if (buzzer <= end) {
    ctx.strokeStyle = color.textFaint;
    segment(X(buzzer), py0, X(buzzer), py0 + ph);
  }

  const lane = (points: EquityPoint[], tone: string, dash: number[]) => {
    if (points.length === 0) return;
    ctx.strokeStyle = tone;
    ctx.lineWidth = 4;
    ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p.ts), Y(p.bps)) : ctx.lineTo(X(p.ts), Y(p.bps))));
    // Carried flat to the buzzer only when the position held no base, which is
    // a fact about quote rather than a guess about the market (RoundTimeline).
    const lastPoint = points[points.length - 1];
    if (Math.abs(lastPoint.base) < 1 && lastPoint.ts < end) ctx.lineTo(X(end), Y(lastPoint.bps));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = tone;
    ctx.strokeStyle = color.ink;
    ctx.lineWidth = 2;
    for (const p of points) {
      if (!p.fill) continue;
      const x = X(p.ts);
      const yy = Y(p.bps);
      ctx.beginPath();
      if (p.fill.side === 'buy') {
        ctx.moveTo(x, yy - 8);
        ctx.lineTo(x + 7, yy + 5);
        ctx.lineTo(x - 7, yy + 5);
      } else if (p.fill.side === 'sell') {
        ctx.moveTo(x, yy + 8);
        ctx.lineTo(x + 7, yy - 5);
        ctx.lineTo(x - 7, yy - 5);
      } else {
        ctx.rect(x - 6, yy - 6, 12, 12);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };
  lane(input.you, color.cyan, []);
  lane(input.them, color.magenta, [10, 7]);

  // Legend and axis ends.
  const legendY = ty + th - 18;
  ctx.font = body(18);
  ctx.fillStyle = color.cyan;
  ctx.fillRect(px0, legendY - 8, 22, 5);
  ctx.fillStyle = color.textDim;
  ctx.fillText('YOU', px0 + 30, legendY);
  const themX = px0 + 30 + ctx.measureText('YOU').width + 28;
  ctx.fillStyle = color.magenta;
  ctx.fillRect(themX, legendY - 8, 22, 5);
  ctx.fillStyle = color.textDim;
  ctx.fillText(ellipsize(ctx, input.opponentName.toUpperCase(), 180), themX + 30, legendY);
  ctx.textAlign = 'right';
  ctx.fillStyle = color.textFaint;
  ctx.fillText(`0s → ${Math.round(span)}s`, px0 + pw, legendY);
  ctx.textAlign = 'left';

  // What each market did, and the rivalry.
  let under = ty + th + 36;
  const windowNotes = [
    input.youNote ? `YOU: ${input.youNote}` : null,
    input.themNote ? `${input.opponentName.toUpperCase()}: ${input.themNote}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (windowNotes) {
    ctx.fillStyle = color.textFaint;
    ctx.font = body(18);
    ctx.fillText(ellipsize(ctx, windowNotes, tw), tx, under);
    under += 30;
  }
  if (input.moves) {
    ctx.fillStyle = color.textDim;
    ctx.font = body(20);
    ctx.fillText(ellipsize(ctx, input.moves, tw), tx, under);
    under += 34;
  }
  if (input.record) {
    ctx.fillStyle = color.yellow;
    ctx.font = display(14);
    ctx.fillText(ellipsize(ctx, input.record, tw), tx, under);
  }

  // Footer: where to check it.
  ctx.fillStyle = color.panel;
  ctx.fillRect(M, H - 86, W - 2 * M, 3);
  ctx.font = body(20);
  const claim = 'EVERY FILL IS ON THE PUBLIC TAPE';
  const claimW = ctx.measureText(claim).width;
  ctx.textAlign = 'right';
  ctx.fillStyle = color.textFaint;
  ctx.fillText(claim, W - M, H - 42);
  ctx.textAlign = 'left';
  if (input.link) {
    ctx.fillStyle = color.cyan;
    ctx.fillText(ellipsize(ctx, input.link, W - 2 * M - claimW - 30), M, H - 42);
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The canvas would not encode a PNG'))), 'image/png')
  );
}

/**
 * Draw the card and hand it over: the system share sheet where the browser can
 * share files, a saved PNG everywhere else.
 */
export async function exportRevealCard(input: RevealCardInput): Promise<RevealCardOutcome> {
  const blob = await drawRevealCard(input);
  const id = input.link?.split('/').pop()?.slice(0, 8) || String(input.startTs);
  const filename = `masked-duel-${id}.png`;

  const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (file && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: input.headline, text: input.link ?? undefined });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // Refused for another reason (no user activation left, a policy): save
      // it instead of reporting a picture nobody received.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}
