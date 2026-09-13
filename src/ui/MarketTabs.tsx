import { Pressable, type ViewStyle } from 'react-native';
import Row from './Row';
import PixelText from './PixelText';
import { border, color, focusRing, noOutline, onInk, pressedBevel, space } from './theme';

export interface MarketTab<T extends string> {
  key: T;
  label: string;
}

export interface MarketTabsProps<T extends string> {
  tabs: ReadonlyArray<MarketTab<T>>;
  active: T;
  onChange: (key: T) => void;
  style?: ViewStyle | ViewStyle[];
}

/**
 * A two-or-three-way switch inside a panel.
 *
 * Distinct from `TabBar`, which is the app's bottom navigation and carries
 * icons, plinths and a raised centre button. This is a segmented control for
 * splitting one list — memes from majors — and deliberately looks like less.
 */
export default function MarketTabs<T extends string>({ tabs, active, onChange, style }: MarketTabsProps<T>) {
  return (
    <Row gap={0} style={style}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[{ flex: 1 }, noOutline]}
          >
            {(state) => (
              <Row
                justify="center"
                padY={space.sm}
                bg={on ? color.yellow : color.ink}
                outline={on ? color.yellow : color.panelLight}
                outlineWidth={border.thin}
                style={[pressedBevel(state.pressed) as ViewStyle, ...((state as { focused?: boolean }).focused ? [focusRing] : [])]}
              >
                <PixelText variant="tabLabel" color={on ? onInk.yellow : color.textDim}>
                  {t.label}
                </PixelText>
              </Row>
            )}
          </Pressable>
        );
      })}
    </Row>
  );
}
