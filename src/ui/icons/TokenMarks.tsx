import PixelArt from './PixelArt';

/**
 * Brand marks for the two tokens the app names out loud.
 *
 * Drawn on the same pixel lattice as every other icon rather than shipped as
 * PNGs: an official logo scaled into an 8-bit UI reads as a sticker, and these
 * have to sit next to hand-drawn tab icons without looking pasted on. The
 * colours are the brands' own, which is the part that has to be right.
 *
 * Every other market's logo is a real remote image — see TokenLogo. These two
 * are drawn because SOL and USDC have no logo in either market feed: they are
 * the quote currency and the stable, not listings.
 */

/** Solana: three slanted bars, purple through teal to green. */
const SOL_GRID = [
  '................',
  '................',
  '...aaaaaaaaaa...',
  '..aaaaaaaaaa....',
  '................',
  '................',
  '....bbbbbbbbbb..',
  '...bbbbbbbbbb...',
  '................',
  '................',
  '...cccccccccc...',
  '..cccccccccc....',
  '................',
  '................',
  '................',
  '................',
];

const SOL_PALETTE = {
  a: '#9945ff', // Solana purple
  b: '#5b8def', // the ramp between them
  c: '#14f195', // Solana green
};

export function SolanaMark({ size = 24 }: { size?: number }) {
  return <PixelArt grid={SOL_GRID} palette={SOL_PALETTE} size={size} />;
}

/** USDC: the dollar glyph in a filled disc, on Circle blue. */
const USDC_GRID = [
  '.....dddddd.....',
  '...dddddddddd...',
  '..dddddddddddd..',
  '.dddddd..dddddd.',
  '.ddddd.ww.ddddd.',
  'dddd.wwwwww.dddd',
  'dddd.www....dddd',
  'dddd.wwwww..dddd',
  'dddd...wwww.dddd',
  'dddd....www.dddd',
  'dddd.wwwwww.dddd',
  '.ddddd.ww.ddddd.',
  '.dddddd..dddddd.',
  '..dddddddddddd..',
  '...dddddddddd...',
  '.....dddddd.....',
];

const USDC_PALETTE = {
  d: '#2775ca', // Circle blue
  w: '#ffffff',
};

export function UsdcMark({ size = 24 }: { size?: number }) {
  return <PixelArt grid={USDC_GRID} palette={USDC_PALETTE} size={size} />;
}

/** The pump.fun pill, for marking where a meme market's price came from. */
const PUMP_GRID = [
  '................',
  '.....pppppp.....',
  '...pppppppppp...',
  '..pppppppppppp..',
  '..pppp....pppp..',
  '..pp........pp..',
  '..pp...gg...pp..',
  '..pp..gggg..pp..',
  '..pp.gggggg.pp..',
  '..pp...gg...pp..',
  '..pp...gg...pp..',
  '..pppp....pppp..',
  '..pppppppppppp..',
  '...pppppppppp...',
  '.....pppppp.....',
  '................',
];

const PUMP_PALETTE = {
  p: '#2fbf5c', // the green pump.fun brands itself with
  g: '#ffffff',
};

export function PumpMark({ size = 24 }: { size?: number }) {
  return <PixelArt grid={PUMP_GRID} palette={PUMP_PALETTE} size={size} />;
}
