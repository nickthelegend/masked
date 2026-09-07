import { useLocalSearchParams } from 'expo-router';
import TapeScreen from '../../src/screens/TapeScreen';

/** /tape/<match address> — a settled duel at a permanent URL, no wallet. */
export default function TapeRoute() {
  const { match } = useLocalSearchParams<{ match?: string }>();
  return <TapeScreen address={typeof match === 'string' ? match : null} />;
}
