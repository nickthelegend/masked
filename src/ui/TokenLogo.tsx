import { useEffect, useState } from 'react';
import { Image, type ViewStyle } from 'react-native';
import Box from './Box';
import PixelText from './PixelText';
import { SolanaMark, UsdcMark } from './icons';
import { border, color } from './theme';
import { cachedLogo, cachedUsable, checkUsable, onLogosChanged, resolveLogo } from '../chain/logos';
import { logoUrl } from '../chain/marketEndpoints';

/** Mints whose mark is drawn rather than fetched. */
const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** The palette a fallback tile picks from. Accents only — never a surface. */
const TILE = [color.magenta, color.cyan, color.purple, color.orange, color.green, color.blue];

/**
 * Deterministic colour for a mint, so the same coin is always the same tile.
 *
 * A hash rather than a random: a logo that changed colour between the picker
 * and the round would read as a different market.
 */
function tileColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE[h % TILE.length];
}

export interface TokenLogoProps {
  /** Mint address. Decides the fallback tile, and selects the drawn marks. */
  mint: string;
  /** Ticker, for the fallback tile's initial. */
  symbol: string;
  /** Remote logo from the market feed. Missing and broken are both handled. */
  uri?: string | null;
  size?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * A market's logo.
 *
 * pump.fun publishes a real image for every coin and roughly a quarter of them
 * 404 or rate-limit — checked against the live API, not assumed — so a broken
 * image is the normal case, not an edge one. When one fails to load this falls
 * back to a coloured plate with the ticker's first letter, keyed off the mint
 * so a given coin always gets the same tile.
 *
 * SOL and USDC are drawn instead of fetched: neither market feed carries a
 * logo for them, because they are the quote currency and the stable rather
 * than listings.
 */
export default function TokenLogo({ mint, symbol, uri, size = 32, style }: TokenLogoProps) {
  const [broken, setBroken] = useState(false);
  /**
   * The logo for this mint when the caller has none.
   *
   * A `Leg` on chain carries a mint, a symbol and a name — never an image — so
   * every surface built from chain state alone (the standings board, the
   * result board, the lock-in card, a settled tape) had nothing to pass here
   * and drew a letter tile next to markets that have real art. The registry
   * resolves it once per mint and tells every mounted logo when it lands.
   */
  const [found, setFound] = useState<string | null>(() => cachedLogo(mint) ?? null);
  useEffect(() => {
    if (uri) return undefined;
    setBroken(false);
    const known = cachedLogo(mint);
    if (known !== undefined) {
      setFound(known);
      // Already looked up, and already null: nothing more to ask for.
      if (known === null) return undefined;
    }
    let alive = true;
    const stop = onLogosChanged(() => alive && setFound(cachedLogo(mint) ?? null));
    void resolveLogo(mint).then((u) => alive && setFound(u));
    return () => {
      alive = false;
      stop();
    };
  }, [mint, uri]);

  /**
   * Loaded through the market proxy's image relay, never straight from the
   * coin's CDN.
   *
   * `logoUrl` was written for this and then never called by anything, and the
   * proxy route it points at did not exist — so every logo went direct, and
   * the ones on hosts that refuse cross-origin embedding failed with
   * `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`. That is every Jupiter major,
   * whose art lives on ipfs.io: they fell back to letter tiles and printed an
   * error per logo per page load. Relayed, and asked about first, a logo that
   * cannot be shown never becomes a request that fails.
   */
  const source = uri ?? found;
  const candidate = logoUrl(source);

  /**
   * Only rendered once the logo is known to yield an image — see
   * `checkUsable`. Until then the tile shows, which is what would have shown
   * anyway had the load failed.
   */
  const [usable, setUsable] = useState<boolean>(() =>
    source ? cachedUsable(source) === true : false
  );
  useEffect(() => {
    if (!source) {
      setUsable(false);
      return undefined;
    }
    const known = cachedUsable(source);
    if (known !== undefined) {
      setUsable(known);
      return undefined;
    }
    // A logo nothing is known about yet is not shown until it has been checked,
    // even if the previous one this component drew was fine.
    setUsable(false);
    let alive = true;
    void checkUsable(source).then((ok) => alive && setUsable(ok));
    return () => {
      alive = false;
    };
  }, [source]);

  const src = usable ? candidate : null;

  const plate = (children: React.ReactNode) => (
    <Box
      bg={color.ink}
      outline={color.panelLight}
      outlineWidth={border.thin}
      width={size}
      height={size}
      align="center"
      justify="center"
      style={style}
    >
      {children}
    </Box>
  );

  if (mint === WSOL) return plate(<SolanaMark size={Math.round(size * 0.78)} />);
  if (mint === USDC) return plate(<UsdcMark size={Math.round(size * 0.78)} />);

  if (src && !broken) {
    return plate(
      <Image
        source={{ uri: src }}
        // Nearest-neighbour would be ideal on a pixel grid, but RN Web only
        // honours it through CSS; `contain` at least keeps the art unstretched.
        resizeMode="contain"
        style={{ width: size - border.thin * 2, height: size - border.thin * 2 }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <Box
      bg={tileColor(mint)}
      outline={color.ink}
      outlineWidth={border.thin}
      width={size}
      height={size}
      align="center"
      justify="center"
      style={style}
    >
      <PixelText variant="numeric" size={Math.round(size * 0.42)} color={color.ink}>
        {(symbol[0] ?? '?').toUpperCase()}
      </PixelText>
    </Box>
  );
}
