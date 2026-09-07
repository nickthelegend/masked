import { Pressable, View } from 'react-native';
import Row from './Row';
import PixelText from './PixelText';
import { BackIcon, CoinIcon, MenuIcon, PlusIcon, TrophyIcon } from './icons';
import { color, space, radius, border, bevel, onInk, pressedBevel } from './theme';

/** A square bevelled plate with one drawn icon on it. The HUD's only button. */
function Plate({
  icon: Icon,
  bg,
  ink,
  onPress,
  label,
}: {
  icon: (p: { size?: number; color?: string }) => React.ReactElement;
  bg: string;
  ink: string;
  onPress?: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        {
          width: 34,
          height: 34,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: border.base,
          borderColor: color.ink,
          borderBottomWidth: border.base + bevel.sm,
          borderRadius: radius.tile,
          opacity: onPress ? 1 : 0.45,
        },
        pressedBevel(pressed && !!onPress),
      ]}
    >
      <Icon size={16} color={ink} />
    </Pressable>
  );
}

/**
 * A counter pill: an icon plate, a number, and an optional `+` that does
 * something. The `+` is only drawn when it has an action — a dead affordance
 * on a currency reads as a broken top-up, which is worse than no button.
 */
function CounterPill({
  icon: Icon,
  iconBg,
  iconInk,
  value,
  onAdd,
  label,
}: {
  icon: (p: { size?: number; color?: string }) => React.ReactElement;
  iconBg: string;
  iconInk: string;
  value: string;
  onAdd?: () => void;
  label: string;
}) {
  return (
    <Row
      align="center"
      gap={space.xs}
      bg={color.ink}
      outline={color.panelLight}
      round={radius.pill}
      padX={space.xs}
      padY={3}
      accessibilityLabel={`${label} ${value}`}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: radius.pill,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={12} color={iconInk} />
      </View>
      <PixelText variant="numeric" size={9} color={color.white}>
        {value}
      </PixelText>
      {onAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${label}`}
          onPress={onAdd}
          style={({ pressed }) => [
            {
              width: 16,
              height: 16,
              borderRadius: radius.tile,
              backgroundColor: color.green,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <PlusIcon size={9} color={onInk.green} />
        </Pressable>
      ) : null}
    </Row>
  );
}

export interface HudBarProps {
  /** SOL in the connected wallet, already formatted. */
  balance: string;
  /** Rounds won. The trophy counter. */
  trophies: number;
  onBack?: () => void;
  /** Omit to leave the menu plate out entirely rather than draw a dead one. */
  onMenu?: () => void;
  onTopUp?: () => void;
  /** Drawn at the trailing edge — the wallet chip and the sound toggle. */
  children?: React.ReactNode;
}

/**
 * The arcade HUD: back, what you hold, what you have won, menu.
 *
 * Two counters, never more. The bar is read at a glance mid-round and every
 * extra chip costs the countdown its place as the loudest thing on screen.
 */
export default function HudBar({ balance, trophies, onBack, onMenu, onTopUp, children }: HudBarProps) {
  return (
    <Row
      align="center"
      justify="space-between"
      gap={space.xs}
      bg={color.inkDeep}
      outline={color.panel}
      padX={space.sm}
      padY={space.sm}
    >
      <Row align="center" gap={space.xs}>
        <Plate icon={BackIcon} bg={color.blue} ink={color.white} onPress={onBack} label="Back" />
        <CounterPill
          icon={CoinIcon}
          iconBg={color.blue}
          iconInk={color.white}
          value={balance}
          onAdd={onTopUp}
          label="Balance"
        />
        <CounterPill
          icon={TrophyIcon}
          iconBg={color.yellow}
          iconInk={onInk.yellow}
          value={String(trophies)}
          label="Trophies"
        />
      </Row>
      <Row align="center" gap={space.xs}>
        {children}
        {onMenu ? (
          <Plate icon={MenuIcon} bg={color.green} ink={onInk.green} onPress={onMenu} label="Menu" />
        ) : null}
      </Row>
    </Row>
  );
}
