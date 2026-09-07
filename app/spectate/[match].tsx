import { useLocalSearchParams } from 'expo-router';
import SpectateScreen from '../../src/screens/SpectateScreen';

/** /spectate/<match address> — watch a duel with no wallet. */
export default function SpectateRoute() {
  const { match } = useLocalSearchParams<{ match?: string }>();
  return <SpectateScreen address={typeof match === 'string' ? match : null} />;
}
