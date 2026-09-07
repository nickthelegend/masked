/* Barrel for the MASKED UI library. Grows as components land. */

/* theme */
export * from './theme';

/* primitives */
export { default as Box, type BoxProps } from './Box';
export { default as Row, type RowProps } from './Row';
export { default as Stack, type StackProps } from './Stack';
export { default as PixelText, type PixelTextProps, MIN_FONT_SIZE } from './PixelText';
export { default as PixelPanel, type PixelPanelProps } from './PixelPanel';
export { default as PixelButton, type PixelButtonProps, type ButtonTone } from './PixelButton';
export { default as IconPlate, type IconPlateProps, type GlyphName, GLYPH } from './IconPlate';
export { default as Badge, type BadgeProps, type BadgeTone } from './Badge';
export { default as ProgressBar, type ProgressBarProps } from './ProgressBar';
export { default as Divider, type DividerProps } from './Divider';
export { default as ScanlineOverlay, type ScanlineOverlayProps } from './ScanlineOverlay';
export { default as FogOverlay, type FogOverlayProps } from './FogOverlay';

/* composites */
export { default as MaskAvatar, type MaskAvatarProps } from './MaskAvatar';
export { default as StatTile, type StatTileProps } from './StatTile';
export { default as Orb, type OrbProps } from './Orb';
export { orbStateForPnl, type OrbState } from './orbState';
export { default as TapeChart, type TapeChartProps } from './TapeChart';
export { linePath, bounds, walk, toEnd, mulberry32 } from './series';
export { default as Ticker, type TickerProps } from './Ticker';
export { default as TabBar, type TabBarProps, type TabSpec, TABS } from './TabBar';
export { default as PocketShell, type PocketShellProps } from './PocketShell';
export { default as BeachBackdrop, type BeachBackdropProps } from './BeachBackdrop';
export { default as PnLReadout, type PnLReadoutProps } from './PnLReadout';
export { default as PotPill, type PotPillProps } from './PotPill';
export { default as RoundClock, type RoundClockProps } from './RoundClock';
export { default as SizePicker, SIZES, type SizePickerProps } from './SizePicker';
export { default as StakePicker, type StakePickerProps, STAKES } from './StakePicker';
export { default as FillTape, type FillTapeProps, type Fill } from './FillTape';
export { pct, money, sol, solExact, mmss, signColor } from './format';
export { default as MatchCard, type MatchCardProps } from './MatchCard';
export { default as LeaderRow, type LeaderRowProps } from './LeaderRow';
export { default as Podium, type PodiumProps, type PodiumEntry, type Place } from './Podium';
export { default as ModeTile, type ModeTileProps, type ModeStatus } from './ModeTile';
export { default as QuestRow, type QuestRowProps } from './QuestRow';
export { default as Wordmark, type WordmarkProps } from './Wordmark';

/* icons */
export * from './icons';
export { default as ConnectWalletButton, type ConnectWalletButtonProps } from './ConnectWalletButton';
export { default as WalletPicker, type WalletPickerProps, type WalletChoice } from './WalletPicker';
export { default as ProofPanel, type ProofPanelProps, type ProofRow } from './ProofPanel';
export { ToastProvider, useToast, type Toast, type ToastTone } from './Toast';
export { default as ErrorBoundary } from './ErrorBoundary';
export { default as RevealCurtain, type RevealCurtainProps } from './RevealCurtain';
export { default as PnLOdometer, type PnLOdometerProps } from './PnLOdometer';
export { useReducedMotion, DURATION, FRAME_MS } from './motion';
export { default as TxFeed, type TxFeedProps, type TxFeedItem } from './TxFeed';
export { default as MatchRow, type MatchRowProps } from './MatchRow';

/* markets — the live pump.fun / Jupiter list and everything that renders it */
export { default as TokenLogo, type TokenLogoProps } from './TokenLogo';
export { default as SourceBadge, type SourceBadgeProps, type PriceSource } from './SourceBadge';
export { default as MarketRow, type MarketRowProps } from './MarketRow';
export { default as MarketTabs, type MarketTabsProps, type MarketTab } from './MarketTabs';
export {
  default as MarketPicker,
  type MarketPickerProps,
  type PickableMarket,
  type MarketKindKey,
} from './MarketPicker';
export { default as MarketHeader, type MarketHeaderProps } from './MarketHeader';
export { default as LiveDuelRow, type LiveDuelRowProps } from './LiveDuelRow';
export { default as FillReceipt, type FillReceiptProps } from './FillReceipt';
export {
  default as SettleProgress,
  type SettleProgressProps,
  type SettleStageView,
} from './SettleProgress';
export { default as CommandList, type CommandListProps, type CommandEntry } from './CommandList';
export {
  default as LifecycleFeed,
  type LifecycleFeedProps,
  type LifecycleStep,
} from './LifecycleFeed';
export {
  default as RoundTimeline,
  describeFill,
  type RoundTimelineProps,
  type TimelinePlayer,
} from './RoundTimeline';
export {
  play as playSound,
  soundEnabled,
  setSoundEnabled,
  useSoundEnabled,
  type SoundName,
} from './sound';

/* arena — the PvP surfaces */
export { default as HudBar, type HudBarProps } from './HudBar';
export { default as EndingIn, type EndingInProps } from './EndingIn';
export { default as VersusCard, type VersusCardProps } from './VersusCard';
export { default as MatchFound, type MatchFoundProps } from './MatchFound';
export { default as RankRow, type RankRowProps, type RowSide } from './RankRow';
export { default as PotentialEarnings, type PotentialEarningsProps } from './PotentialEarnings';
export { default as ArenaChart, type ArenaChartProps } from './ArenaChart';
export { default as ResultBoard, type ResultBoardProps, type ResultEntry } from './ResultBoard';
export { default as TierBadge, type TierBadgeProps, type Tier, TIERS, TIER_AT, tierFor } from './TierBadge';
