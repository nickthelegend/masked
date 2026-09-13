/**
 * A wallet's mask, drawn for the DOM.
 *
 * Same function the app uses (`maskGrid` / `faceTone`), so a wallet's face on
 * the landing page is the face it wears in a duel. Two renderers:
 *
 *   PixelMask — one element per pixel, so GSAP can assemble the face pixel by
 *     pixel. 144 nodes; used where a mask is the subject.
 *   MaskTile  — a 12x12 canvas scaled up. Used for walls of masks, where a
 *     hundred DOM grids would be thousands of nodes for no visible gain.
 */
import { memo, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { faceTone, maskGrid } from '../ui/maskFace';

const shortAddr = (seed: string) => `${seed.slice(0, 4)}…${seed.slice(-4)}`;

export interface PixelMaskProps {
  seed: string;
  className?: string;
}

export const PixelMask = memo(function PixelMask({ seed, className }: PixelMaskProps) {
  const rows = useMemo(() => maskGrid(seed), [seed]);
  const style = { '--mask-ink': faceTone(seed) } as CSSProperties;
  return (
    <div className={`mk-mask ${className ?? ''}`} style={style} role="img" aria-label={`Mask of wallet ${shortAddr(seed)}`}>
      {rows.flatMap((row, y) =>
        row.split('').map((cell, x) => <i key={`${x}-${y}`} className={cell === '#' ? 'mk-px on' : 'mk-px'} />)
      )}
    </div>
  );
});

export const MaskTile = memo(function MaskTile({ seed, className }: PixelMaskProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 12, 12);
    g.fillStyle = faceTone(seed);
    maskGrid(seed).forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) if (row[x] === '#') g.fillRect(x, y, 1, 1);
    });
  }, [seed]);

  return (
    <canvas
      ref={ref}
      width={12}
      height={12}
      className={`mk-masktile ${className ?? ''}`}
      role="img"
      aria-label={`Mask of wallet ${shortAddr(seed)}`}
    />
  );
});

export { shortAddr };
