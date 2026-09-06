import { Pressable, View } from 'react-native';
import IconPlate, { GLYPH } from './IconPlate';
import PixelText from './PixelText';
import { TAB_BAR_MIN_HEIGHT, bevel, border, color, onInk, radius, shade } from './theme';

export interface TabSpec {
  key: string;
  label: string;
  /** Geometric unicode glyph for the icon plate. */
  glyph: string;
  /** Plate color. */
  icon: string;
  /** Glyph color printed on the plate. */
  ink: string;
  /** The centre action tab: wider, taller, gold when active. */
  big?: boolean;
}

export const TABS: TabSpec[] = [
  { key: 'feed', label: 'FEED', glyph: GLYPH.feed, icon: color.cyan, ink: onInk.cyan },
  { key: 'board', label: 'RANK', glyph: GLYPH.rank, icon: color.orange, ink: onInk.orange },
  { key: 'duel', label: 'DUEL', glyph: GLYPH.duel, icon: color.red, ink: color.white, big: true },
  { key: 'modes', label: 'MODES', glyph: GLYPH.modes, icon: color.purple, ink: onInk.purple },
  { key: 'quests', label: 'QUEST', glyph: GLYPH.quest, icon: color.green, ink: onInk.green },
];

export interface TabBarProps {
  active: string;
  onChange: (key: string) => void;
  tabs?: TabSpec[];
}

/**
 * Colorful pixel tab bar: each tab is an icon plate on a bevelled plinth.
 * Plinths are 56–62px tall including the bevel, comfortably over the 44px
 * hit-target floor.
 */
export default function TabBar({ active, onChange, tabs = TABS }: TabBarProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 5,
        paddingHorizontal: 8,
        paddingTop: 8,
        paddingBottom: 12,
        minHeight: TAB_BAR_MIN_HEIGHT,
        backgroundColor: color.ink,
        borderTopWidth: border.thick,
        borderTopColor: color.panelLight,
      }}
    >
      {tabs.map((t) => {
        const on = active === t.key;
        const plinth = t.big ? (on ? color.yellow : shade.plinthDim) : on ? color.blue : color.panel;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            android_ripple={null}
            style={{
              flex: t.big ? 1.3 : 1,
              alignItems: 'center',
              gap: 5,
              paddingVertical: t.big ? 12 : 8,
              backgroundColor: plinth,
              borderWidth: border.base,
              borderColor: color.ink,
              borderBottomWidth: border.base + bevel.sm,
              borderRadius: radius.card,
            }}
          >
            <IconPlate glyph={t.glyph} bg={t.icon} ink={t.ink} size={t.big ? 34 : 26} glyphSize={t.big ? 15 : 12} />
            <PixelText variant="tabLabel" color={t.big && on ? onInk.yellow : color.white}>
              {t.label}
            </PixelText>
          </Pressable>
        );
      })}
    </View>
  );
}
