import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import PixelPanel from './PixelPanel';
import PixelText from './PixelText';
import Row from './Row';
import Stack from './Stack';
import IconPlate from './IconPlate';
import { QuestIcon, DuelIcon, MenuIcon } from './icons';
import { color, onInk, space } from './theme';

export type ToastTone = 'ok' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

interface ToastApi {
  push: (tone: ToastTone, title: string, detail?: string) => void;
  ok: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi>({
  push: () => {},
  ok: () => {},
  error: () => {},
  info: () => {},
});

export const useToast = () => useContext(ToastContext);

const TONE = {
  ok: { plate: color.green, ink: onInk.green, Icon: QuestIcon },
  error: { plate: color.red, ink: color.white, Icon: DuelIcon },
  info: { plate: color.blue, ink: color.white, Icon: MenuIcon },
} as const;

const LIFETIME_MS = 4200;
const MAX_VISIBLE = 3;

/** One toast: slides up into place, holds, slides out. No fade — the house
 *  language moves things, it does not dissolve them. */
function ToastRow({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  const slide = useRef(new Animated.Value(0)).current;
  const spec = TONE[toast.tone];

  useEffect(() => {
    Animated.timing(slide, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const id = setTimeout(() => {
      Animated.timing(slide, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        () => onDone(toast.id)
      );
    }, LIFETIME_MS);
    return () => clearTimeout(id);
  }, [slide, toast.id, onDone]);

  return (
    <Animated.View
      style={{
        transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        opacity: slide,
      }}
    >
      <PixelPanel pad={space.sm} accent={spec.plate}>
        <Row gap={space.sm} align="flex-start">
          <IconPlate icon={spec.Icon} bg={spec.plate} ink={spec.ink} size={22} />
          <Stack gap={2} flex={1}>
            <PixelText variant="label" size={8} color={color.white} numberOfLines={1}>
              {toast.title}
            </PixelText>
            {toast.detail ? (
              <PixelText variant="bodySmall" size={10} color={color.textDim} numberOfLines={2}>
                {toast.detail}
              </PixelText>
            ) : null}
          </Stack>
        </Row>
      </PixelPanel>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, title: string, detail?: string) => {
    setToasts((t) => [...t, { id: nextId.current++, tone, title, detail }].slice(-MAX_VISIBLE));
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      ok: (t, d) => push('ok', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.md, gap: space.sm }}
      >
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDone={remove} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}
