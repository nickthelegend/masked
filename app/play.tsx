import { useLocalSearchParams } from 'expo-router';
import MaskedApp from '../src/screens/MaskedApp';

/**
 * /play — the duel itself.
 *
 * `?market=<mint>` opens the lobby on that market, so a duel on a specific
 * token is a link somebody can be sent. The mint is resolved through the
 * picker's own search and must still be priceable; a dead one leaves the lobby
 * unselected rather than carrying a market `create_match` would reject.
 */
export default function PlayRoute() {
  const { market } = useLocalSearchParams<{ market?: string }>();
  return <MaskedApp initialMarketMint={typeof market === 'string' ? market : undefined} />;
}
