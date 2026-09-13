import type { ViewStyle } from 'react-native';
import PixelPanel from './PixelPanel';
import PixelButton from './PixelButton';
import PixelText from './PixelText';
import Row from './Row';
import Stack from './Stack';
import { color, onInk, space } from './theme';
import { sol } from './format';

export interface StakePickerProps {
  /** Stake amounts in dollars. */
  options?: number[];
  value: number;
  onChange: (stake: number) => void;
  label?: string;
  /** Line under the row, e.g. "WINNER TAKES $9.80 · 2% RAKE". */
  note?: string;
  disabled?: boolean;
  /**
   * The largest stake the wallet can cover (`affordableStake`). Presets above
   * it are disabled rather than offered and then refused at preflight.
   * `undefined`: no balance known yet, nothing limited. `null`: it covers none.
   */
  maxStake?: number | null;
  style?: ViewStyle | ViewStyle[];
}

/** In SOL. Sized for a devnet/localnet wallet, not dollars. */
export const STAKES = [0.05, 0.1, 0.5, 1];

/**
 * Pot deposit selector. The selected stake is an orange plate; the rest sit on
 * `panelLight`, so the choice reads at a glance without a checkmark.
 */
export default function StakePicker({
  options = STAKES,
  value,
  onChange,
  label = 'POT DEPOSIT',
  note,
  disabled = false,
  maxStake,
  style,
}: StakePickerProps) {
  const covered = (v: number) => maxStake === undefined || (maxStake !== null && v <= maxStake);
  const limited = maxStake !== undefined && options.some((v) => !covered(v));
  return (
    <PixelPanel style={style}>
      <Stack gap={space.sm}>
        {label ? <PixelText variant="label">{label}</PixelText> : null}
        <Row gap={space.sm}>
          {options.map((v) => (
            <PixelButton
              key={v}
              flex={1}
              label={sol(v, v < 1 ? 2 : 0)}
              size={10}
              disabled={disabled || !covered(v)}
              bg={v === value ? color.orange : color.panelLight}
              // Dark ink on the bright plate: white on orange is ~1.9:1.
              fg={v === value ? onInk.orange : color.white}
              onPress={() => onChange(v)}
            />
          ))}
        </Row>
        {limited ? (
          <PixelText variant="bodySmall" color={color.yellow}>
            {maxStake === null
              ? 'THIS WALLET CANNOT COVER A STAKE YET. FUND IT FIRST.'
              : `BALANCE COVERS UP TO ${sol(maxStake, maxStake < 1 ? 2 : 0)}`}
          </PixelText>
        ) : null}
        {/* The chosen stake stays chosen when the balance falls under it, and its
            button is disabled like every other one the wallet cannot cover. So
            say which stake it is: the note below is priced on it, and without
            this line it describes a selection the player cannot see. */}
        {maxStake !== undefined && !covered(value) ? (
          <PixelText variant="bodySmall" color={color.yellow}>
            {`CHOSEN STAKE ${sol(value, value < 1 ? 2 : 0)} IS MORE THAN THIS WALLET COVERS`}
          </PixelText>
        ) : null}
        {note ? (
          <PixelText variant="bodySmall" color={color.textDim}>
            {note}
          </PixelText>
        ) : null}
      </Stack>
    </PixelPanel>
  );
}
