import { ScrollView, TextInput, type ViewStyle } from 'react-native';
import Stack from './Stack';
import Row from './Row';
import PixelText from './PixelText';
import PixelButton from './PixelButton';
import Box from './Box';
import MarketRow from './MarketRow';
import MarketTabs from './MarketTabs';
import type { PriceSource } from './SourceBadge';
import { border, color, space, type as typeTokens } from './theme';

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
  /** Current search text. Empty shows the list for the selected tab. */
  query?: string;
  onQueryChange?: (q: string) => void;
  /** True while a search is in flight, so the field can say so. */
  searching?: boolean;
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
  query = '',
  onQueryChange,
  searching = false,
  maxHeight = 260,
  style,
}: MarketPickerProps) {
  return (
    <Stack gap={space.sm} style={style}>
      <MarketTabs tabs={TABS} active={kind} onChange={onKindChange} />

      {/* Any token, by ticker, name or mint address. The tabs above are the
          curated lists; this is the rest of the universe. */}
      {onQueryChange ? (
        <Box bg={color.ink} outline={color.panelLight} outlineWidth={border.thin} pad={space.xs}>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="SEARCH ANY TOKEN OR PASTE A MINT"
            placeholderTextColor={color.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              color: color.white,
              fontFamily: typeTokens.bodySmall.family,
              fontSize: 11,
              paddingVertical: 6,
              paddingHorizontal: 6,
              // The web input draws its own focus ring, which does not match
              // anything else on the screen.
              outlineStyle: 'none',
            } as never}
          />
        </Box>
      ) : null}

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
            {searching ? 'SEARCHING…' : 'LOADING MARKETS…'}
          </PixelText>
        </Row>
      ) : markets.length === 0 ? (
        <Row justify="center" pad={space.xl} bg={color.ink} outline={color.panelLight} outlineWidth={border.thin}>
          <PixelText variant="bodySmall" size={10} color={color.textFaint}>
            {query ? `NOTHING MATCHING "${query.toUpperCase()}"` : 'NO MARKETS LISTED'}
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
