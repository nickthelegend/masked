import { useEffect, useState } from 'react';
import {
  Badge, Box, DurationPicker, MarketPicker, PixelButton, PixelText, Row, Stack, StakePicker,
  TokenLogo, color, solExact, onInk, space, type MarketKindKey, type MarketSortKey, type PickableMarket,
  paletteName, paletteSwitchable, setPalette,
} from '../ui';
import { useMarkets } from '../chain/useMarkets';
import { formatCap, formatUsdPrice } from '../chain/units';
import type { TradableMarket } from '../chain/markets';
import { roundBadge } from './data';
import { affordableStake } from '../chain/preflight';

export interface DuelLobbyScreenProps {
  stake: number;
  onStakeChange: (stake: number) => void;
  /** Round length for the match this wallet opens, in seconds. */
  duration: number;
  onDurationChange: (secs: number) => void;
  pot: number;
  onFind: () => void;
  /** The market the next duel opens on. Null until the player picks one. */
  selected: TradableMarket | null;
  onSelectMarket: (m: TradableMarket) => void;
  /** The connected wallet's balance in lamports. Limits the stake presets; omit when no wallet. */
  balanceLamports?: number;
}

/** Side rails are decorative slots for perks that are not wired up yet. */
const LEFT_RAIL: Array<[string, string, string]> = [
  ['DOUBLE\nPOT', color.sand, color.ink],
  ['FREE\nENTRY', color.blue, color.white],
  ['SWAP', color.purple, onInk.purple],
];

const RIGHT_RAIL: Array<[string, string, string]> = [
  ['DAILY\nQUEST', color.green, color.white],
  ['SOCIAL\nBONUS', color.greenDeep, color.white],
  ['RANK\nB1', color.panelLight, color.white],
];

const RAIL_WIDTH = 72;

function Rail({ items }: { items: Array<[string, string, string]> }) {
  return (
    <Stack width={RAIL_WIDTH} gap={space.sm}>
      {items.map(([label, bg, fg]) => (
        <Box key={label} bg={bg} bevel={space.sm} padY={space.sm} padX={space.xs} align="center">
          <PixelText variant="tabLabel" color={fg} align="center" lineHeight={13}>
            {label}
          </PixelText>
        </Box>
      ))}
    </Stack>
  );
}

/** Pick a market and a stake, then find a match. */
export default function DuelLobbyScreen({
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  pot,
  onFind,
  selected,
  onSelectMarket,
  balanceLamports,
}: DuelLobbyScreenProps) {
  const [kind, setKind] = useState<MarketKindKey>('meme');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MarketSortKey>('cap');
  const [paletteRefused, setPaletteRefused] = useState(false);
  const { markets, loading, searching, error, refresh } = useMarkets(kind, 12, query, sort);

  // Sorted by volume, a major shows the number it was sorted by, so the
  // order on screen can be checked against the figures next to it.
  const byVolume = kind === 'major' && sort === 'volume' && !query.trim();

  // The picker takes formatted strings: it renders markets, it does not know
  // what a price scale is.
  const rows: PickableMarket[] = markets.map((m) => ({
    mint: m.mint,
    symbol: m.symbol,
    name: m.name,
    imageUri: m.imageUri,
    price: formatUsdPrice(m.priceUsd),
    cap:
      m.kind === 'meme'
        ? formatCap(m.usdMarketCap)
        : byVolume && m.usdVolume24h != null
          ? `VOL ${formatCap(m.usdVolume24h)}`
          : undefined,
    source: m.source,
  }));

  const byMint = new Map(markets.map((m) => [m.mint, m]));

  // Land on the top market rather than an empty hero and a dead button. The
  // list is right there, so this is a default, not a decision taken for the
  // player — and only until they have made one.
  useEffect(() => {
    if (!selected && markets.length > 0) onSelectMarket(markets[0]);
  }, [selected, markets, onSelectMarket]);

  return (
    <Stack pad={space.lg} gap={space.md}>
      <Row gap={space.md} align="stretch">
        <Rail items={LEFT_RAIL} />

        <Stack flex={1} align="center" justify="center" gap={space.sm} bg={color.chartBg} outline={color.ink} padY={space.md} padX={space.sm}>
          <PixelText variant="label" size={8} color={color.textDim}>
            {selected ? 'YOUR MARKET' : 'PICK A MARKET'}
          </PixelText>
          {selected ? (
            <>
              <TokenLogo mint={selected.mint} symbol={selected.symbol} uri={selected.imageUri} size={72} />
              <PixelText variant="statBig" align="center" numberOfLines={1}>
                {selected.symbol}
              </PixelText>
              {/* Provenance: a real mint and a real price, seconds old. */}
              <PixelText variant="bodySmall" size={10} color={color.textFaint} numberOfLines={1}>
                {formatUsdPrice(selected.priceUsd)} · {selected.source}
              </PixelText>
            </>
          ) : (
            <PixelText variant="bodySmall" size={10} color={color.textFaint} align="center">
              CHOOSE ONE BELOW
            </PixelText>
          )}
          {/* Derived from the actual round length, not a fixed string. */}
          <Badge label={`HIDDEN FILLS · ${roundBadge()}`} tone="quiet" variant="bodySmall" />
        </Stack>

        <Rail items={RIGHT_RAIL} />
      </Row>

      <MarketPicker
        kind={kind}
        onKindChange={setKind}
        markets={rows}
        selectedMint={selected?.mint ?? null}
        onSelect={(row) => {
          const full = byMint.get(row.mint);
          if (full) onSelectMarket(full);
        }}
        loading={loading}
        searching={searching}
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        error={error}
        onRetry={refresh}
      />

      <StakePicker
        value={stake}
        onChange={onStakeChange}
        maxStake={balanceLamports === undefined ? undefined : affordableStake(balanceLamports)}
        note={`WINNER TAKES ${solExact(pot)} · 2% RAKE`}
      />

      {/* A real argument to `create_match`, not a display setting — see
          DurationPicker. Joining somebody else's match takes their length. */}
      <DurationPicker value={duration} onChange={onDurationChange} />

      <PixelButton
        tone="primary"
        label={selected ? 'FIND MATCH' : 'PICK A MARKET'}
        size={14}
        padY={18}
        disabled={!selected}
        onPress={onFind}
      />

      <PixelText variant="bodySmall" align="center" color={color.textFaint}>
        FOG DUEL 1V1 · PRIVATE ROLLUP · SETTLES ON SOLANA
      </PixelText>

      {/* Here rather than mid-round: switching reloads the page (see
          ui/palette.ts), and the lobby is the one screen with nothing live. */}
      {paletteSwitchable ? (
        <PixelButton
          tone="quiet"
          size={8}
          padY={space.sm}
          label={paletteName === 'safe' ? 'COLOUR-BLIND COLOURS: ON' : 'COLOUR-BLIND COLOURS: OFF'}
          onPress={() => setPaletteRefused(!setPalette(paletteName === 'safe' ? 'standard' : 'safe'))}
        />
      ) : null}
      {paletteRefused ? (
        <PixelText variant="bodySmall" size={9} align="center" color={color.red}>
          THIS BROWSER WILL NOT STORE THE CHOICE, SO IT CANNOT BE KEPT
        </PixelText>
      ) : null}
    </Stack>
  );
}
