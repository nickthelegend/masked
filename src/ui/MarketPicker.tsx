import { ScrollView, type ViewStyle } from 'react-native';
import Stack from './Stack';
import Row from './Row';
import PixelText from './PixelText';
import PixelButton from './PixelButton';
import MarketRow from './MarketRow';
import MarketTabs from './MarketTabs';
import type { PriceSource } from './SourceBadge';
import { border, color, space } from './theme';

export type MarketKindKey = 'meme' | 'major';

export interface PickableMarket {
  mint: string;
  symbol: string;
  name: string;
  imageUri?: string | null;
  price: string;
  cap?: string;
  source: PriceSource;
}

export interface MarketPickerProps {
  kind: MarketKindKey;
  onKindChange: (k: MarketKindKey) => void;
  markets: PickableMarket[];
  selectedMint?: string | null;
  onSelect: (m: PickableMarket) => void;
  loading?: boolean;
  /** Rendered verbatim. The source's own words beat a rewritten apology. */
  error?: string | null;
  onRetry?: () => void;
  /** Cap on list height so the picker cannot push the stake control off screen. */
  maxHeight?: number;
  style?: ViewStyle | ViewStyle[];
}

const TABS = [
  { key: 'meme' as const, label: 'MEMES' },
  { key: 'major' as const, label: 'MAJORS' },
];

/**
 * Choose what the next duel is fought over.
 *
 * Every row is a live market from a real feed, so all three of loading, empty
 * and failed are states this will actually be in — an app that only draws the
 * happy path here would spend a good fraction of its life drawing nothing. The
 * error is the source's own message, because "pump.fun returned 503" tells the
 * player something and "Something went wrong" does not.
 */
export default function MarketPicker({
  kind,
  onKindChange,
  markets,
  selectedMint,
  onSelect,
  loading = false,
  error = null,
  onRetry,
  maxHeight = 260,
  style,
}: MarketPickerProps) {
  return (
    <Stack gap={space.sm} style={style}>
      <MarketTabs tabs={TABS} active={kind} onChange={onKindChange} />

      {error ? (
        <Stack gap={space.sm} pad={space.md} bg={color.ink} outline={color.red} outlineWidth={border.thin}>
          <PixelText variant="label" size={9} color={color.red}>
            MARKET FEED DOWN
          </PixelText>
          <PixelText variant="bodySmall" size={10} color={color.text}>
            {error}
          </PixelText>
          {onRetry ? <PixelButton label="RETRY" tone="quiet" size={8} onPress={onRetry} /> : null}
        </Stack>
      ) : loading && markets.length === 0 ? (
        <Row justify="center" pad={space.xl} bg={color.ink} outline={color.panelLight} outlineWidth={border.thin}>
          <PixelText variant="bodySmall" size={10} color={color.textFaint}>
            LOADING MARKETS…
          </PixelText>
        </Row>
      ) : markets.length === 0 ? (
        <Row justify="center" pad={space.xl} bg={color.ink} outline={color.panelLight} outlineWidth={border.thin}>
          <PixelText variant="bodySmall" size={10} color={color.textFaint}>
            NO MARKETS LISTED
          </PixelText>
        </Row>
      ) : (
        <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false}>
          <Stack gap={space.xs}>
            {markets.map((m) => (
              <MarketRow
                key={m.mint}
                {...m}
                selected={m.mint === selectedMint}
                onPress={() => onSelect(m)}
              />
            ))}
          </Stack>
        </ScrollView>
      )}
    </Stack>
  );
}
