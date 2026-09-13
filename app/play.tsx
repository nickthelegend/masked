import { useLocalSearchParams } from 'expo-router';
import MaskedApp from '../src/screens/MaskedApp';

/**
 * /play — the duel itself.
 *
 * `?market=<mint>` opens the lobby on that market, so a duel on a specific
 * token is a link somebody can be sent. The mint is resolved through the
 * picker's own search and must still be priceable; a dead one leaves the lobby
 * unselected rather than carrying a market `create_match` would reject.
 *
 * `?match=<address>` is an invite: it opens matchmaking with that match first,
 * offering JOIN if the program would accept it and saying why not otherwise.
 */
export default function PlayRoute() {
  const { market, match } = useLocalSearchParams<{ market?: string; match?: string }>();
  return (
    <MaskedApp
      initialMarketMint={typeof market === 'string' ? market : undefined}
      initialMatch={typeof match === 'string' ? match : undefined}
    />
  );
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../src/ui/RouteErrorBoundary';
