import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import PixelText from './PixelText';
import { color, space } from './theme';

/**
 * Whether this browser has a network at all.
 *
 * Seeded from `navigator.onLine` and then moved only by the browser's own
 * `online` and `offline` events. Native builds have no such signal without a
 * NetInfo dependency, so there it stays true and the banner never shows.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => Platform.OS !== 'web' || typeof navigator === 'undefined' || navigator.onLine !== false
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}

/**
 * A persistent bar while the browser is offline.
 *
 * Distinct from the cluster being unreachable, which /health reports. With no
 * network nothing reaches any cluster, and a screen saying the validator is
 * down would blame the wrong thing, so this names the cause that is actually
 * true and stays up until the connection returns.
 */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: color.red, paddingVertical: space.sm, paddingHorizontal: space.md, gap: 2 }}
    >
      <PixelText variant="label" size={9} color={color.white} align="center">
        OFFLINE
      </PixelText>
      <PixelText variant="bodySmall" size={10} color={color.white} align="center">
        This browser has no network, so nothing can reach the chain. It clears when the connection returns.
      </PixelText>
    </View>
  );
}
