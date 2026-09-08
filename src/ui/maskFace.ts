/**
 * A mask face, derived from a wallet address.
 *
 * Everyone in MASKED was a "?" plate — on the leaderboard, in the feed, on
 * both rows of every board, on both sides of the lock-in card. Anonymity is
 * the point of the product, but "anonymous" and "indistinguishable" are not
 * the same thing: with one glyph for everybody a player cannot pick their own
 * row out of a list, and a duel between two "?" boxes has no two sides to it.
 *
 * So the mask is generated from the address instead of hidden behind a glyph.
 * It reveals nothing — the address is already printed beside it, and the face
 * is a pure function of it — but the same wallet is always the same face, and
 * two wallets are almost never the same one.
 *
 * Mirrored down the middle, because a face is, and because mirroring halves
 * the bits that have to be distinct for two masks to look different.
 */

/** 12x12, same lattice as the icon set. */
export const FACE = 12;

/** FNV-1a. A hash, not a random: the same wallet must always be one face. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A repeatable bit stream from one hash. */
function bits(h: number): () => number {
  let x = h || 1;
  return () => {
    // xorshift32
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

/**
 * The mask, as `FACE` rows of `#` and `.`.
 *
 * The silhouette is fixed — a brow, two eye holes and a jaw — so every
 * generated face is recognisably a mask rather than noise. Only the fill
 * inside it varies, which is what makes one wallet's mask distinguishable
 * from another's at 34 pixels.
 */
export function maskGrid(seed: string): string[] {
  const next = bits(hash(seed));
  const half = FACE / 2;
  const rows: string[] = [];

  for (let y = 0; y < FACE; y += 1) {
    const left: string[] = [];
    for (let x = 0; x < half; x += 1) {
      // Outside the silhouette: the top and bottom corners are always empty,
      // so the shape reads as a head and not as a square.
      const corner = (y < 2 && x < 2) || (y > FACE - 3 && x < 2);
      const outside = y === 0 || y === FACE - 1 || corner;
      if (outside) {
        left.push('.');
        continue;
      }
      // The eyes. Always empty, always in the same place — this is the part
      // that makes it a mask.
      const eye = y >= 4 && y <= 5 && x >= 1 && x <= 2;
      if (eye) {
        left.push('.');
        continue;
      }
      // Everything else is the generated fill, biased solid so the mask stays
      // legible: two thirds filled.
      left.push(next() % 3 === 0 ? '.' : '#');
    }
    rows.push(left.join('') + left.slice().reverse().join(''));
  }
  return rows;
}

/** Accents a generated mask is allowed to use. Never a surface colour. */
export const FACE_TONES = ['#35e0ff', '#ff4dd2', '#b46bff', '#ffb31e', '#2fbf5c', '#ff4d5e'] as const;

/** The tone for a wallet. Stable, and independent of the grid's bits. */
export function faceTone(seed: string): string {
  return FACE_TONES[hash(`tone:${seed}`) % FACE_TONES.length];
}
