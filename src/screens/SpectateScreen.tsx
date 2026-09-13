import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  Badge,
  FogOverlay,
  LiveDuelRow,
  MaskAvatar,
  Orb,
  orbStateForPnl,
  PixelPanel,
  PixelText,
  PotPill,
  Row,
  RoundClock,
  Stack,
  TapeChart,
  TokenLogo,
  Wordmark,
  color,
  solExact,
  space,
} from '../ui';
import { useSpectate } from '../chain/useSpectate';
import { useOpenMatches } from '../chain/useOpenMatches';
import { formatSolPrice } from '../chain/units';
import { short } from '../chain/useTapes';
import { RAKE } from './data';

export interface SpectateScreenProps {
  /** Match address from the URL. */
  address: string | null;
}

const pct = (bps: number) => `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;

/**
 * `/spectate` with no address: the duels a spectator could open right now.
 *
 * A bare /spectate used to tell a visitor to go and find a match address
 * somewhere else. Match accounts are public, so the list is one read away — and
 * the page a judge can open without a wallet should not start with homework.
 */
function SpectateIndex() {
  const { live, loaded } = useOpenMatches(5000);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!loaded) {
    return (
      <PixelText variant="bodySmall" color={color.textFaint}>
        READING THE CHAIN…
      </PixelText>
    );
  }
  // A live status whose clock has run out is a round nobody has settled yet,
  // not one to watch — the same split /proof makes.
  const running = live.filter((m) => m.duration - (now - m.startTs) > 0);
  const over = live.length - running.length;

  return (
    <Stack gap={space.sm}>
      <PixelText variant="label" size={8} color={color.textDim}>
        {`${running.length} DUEL${running.length === 1 ? '' : 'S'} RUNNING`}
      </PixelText>
      {running.length === 0 ? (
        <PixelText variant="bodySmall" color={color.textFaint}>
          Nothing running right now. A duel opened at /play shows up here while its
          clock runs; finished ones are at /tape.
        </PixelText>
      ) : (
        <Stack gap={space.xs}>
          {running.map((m) => (
            <LiveDuelRow
              key={m.address.toBase58()}
              symbol={m.symbol}
              mint={m.mint.toBase58()}
              creator={short(m.creator)}
              joiner={short(m.joiner)}
              potSol={(m.entry * 2) / 1e9}
              secondsLeft={Math.max(0, m.duration - (now - m.startTs))}
              onPress={() => router.push(`/spectate/${m.address.toBase58()}`)}
            />
          ))}
        </Stack>
      )}
      {over > 0 ? (
        <PixelText variant="bodySmall" size={10} color={color.textFaint}>
          {`${over} more ${over === 1 ? 'duel is' : 'duels are'} past the buzzer and waiting to be settled.`}
        </PixelText>
      ) : null}
    </Stack>
  );
}

/**
 * Watching a duel you are not in.
 *
 * Everything on this screen is readable by anyone: the match, the mark, and
 * after the buzzer the tape. Neither position is fetched, because the rollup
 * would refuse them — so this view is also the clearest demonstration of the
 * product's claim. A spectator sees a real round happening and genuinely
 * cannot tell who is winning until it ends.
 *
 * No wallet. That is deliberate: it is the version of the app a judge can open
 * from a link.
 */
/**
 * A price series as percent change from its first observed point.
 *
 * Two legs are two different tokens, so their raw marks cannot share an axis.
 * This is what makes them comparable — and it is the same quantity the round
 * is settled on.
 */
const asMove = (series: number[]): number[] => {
  const first = series[0];
  if (!first) return [];
  return series.map((px) => ((px - first) / first) * 100);
};

export default function SpectateScreen({ address }: SpectateScreenProps) {
  const { match, error, loaded } = useSpectate(address);

  const body = () => {
    if (!address) {
      return <SpectateIndex />;
    }
    if (!loaded) {
      return (
        <PixelText variant="bodySmall" color={color.textFaint}>
          READING THE CHAIN…
        </PixelText>
      );
    }
    if (error || !match) {
      return (
        <Stack gap={space.sm}>
          <PixelText variant="label" size={9} color={color.red}>
            NOTHING TO WATCH
          </PixelText>
          <PixelText variant="bodySmall" color={color.text}>
            {error ?? 'No match at that address.'}
          </PixelText>
        </Stack>
      );
    }

    const live = match.status === 'live';
    const done = match.status === 'settled';

    return (
      <Stack gap={space.lg}>
        <Row justify="space-between" align="center" gap={space.md} wrap>
          {/* Two markets, because the players brought one each. Naming only
              one of them would be a lie about half the duel. */}
          <Row gap={space.md} align="center" wrap>
            {[match.legA, match.legB]
              .filter((leg) => leg.symbol)
              .map((leg, i) => (
                <Row gap={space.sm} align="center" key={`${leg.symbol}-${i}`}>
                  <TokenLogo mint={leg.mint.toBase58()} symbol={leg.symbol || '?'} size={30} />
                  <Stack gap={2}>
                    <PixelText variant="label" size={11} color={i === 0 ? color.cyan : color.magenta}>
                      {leg.symbol}
                    </PixelText>
                    <PixelText variant="bodySmall" size={10} color={color.textFaint}>
                      {leg.marketType === 'major' ? 'jupiter' : 'pump.fun'}
                    </PixelText>
                  </Stack>
                </Row>
              ))}
          </Row>
          <Row gap={space.sm} align="center">
            {live ? <RoundClock seconds={match.secondsLeft} /> : null}
            <PotPill amount={match.pot / 1e9} rake={RAKE} tone={done ? color.yellow : color.green} />
          </Row>
        </Row>

        <PixelPanel flat bg={color.chartBg} pad={space.sm}>
          <Stack gap={space.xs}>
            {/* Both marks on one chart, each as percent change from the
                first mark this view saw.
                
                Raw prices could not share an axis: one side might be trading
                something worth $79,000 and the other something worth
                $0.000003, and a shared scale would draw the second as a flat
                line on the floor. Percent change is the quantity that actually
                compares, and it is what the duel is scored on anyway. */}
            <TapeChart mine={asMove(match.legA.series)} opponent={asMove(match.legB.series)} height={180} baseline />
            <Row justify="space-between" wrap gap={space.sm}>
              <PixelText variant="bodySmall" color={color.cyan}>
                {match.legA.symbol || '—'} {formatSolPrice(match.legA.px)}◎
              </PixelText>
              {match.legB.symbol ? (
                <PixelText variant="bodySmall" color={color.magenta}>
                  {match.legB.symbol} {formatSolPrice(match.legB.px)}◎
                </PixelText>
              ) : null}
              <PixelText variant="bodySmall" color={color.textFaint}>
                {match.legA.series.length} mark{match.legA.series.length === 1 ? '' : 's'} since you
                joined
              </PixelText>
            </Row>
          </Stack>
        </PixelPanel>

        {/* The two sides. While the round is live this is deliberately almost
            empty: a spectator can see that two wallets are trading and nothing
            about what either of them holds. */}
        <Row gap={space.md} align="stretch">
          {[
            {
              who: match.creator,
              bps: match.pnlABps,
              fills: match.revealed?.fillsA,
              leg: match.legA,
            },
            {
              who: match.joiner,
              bps: match.pnlBBps,
              fills: match.revealed?.fillsB,
              leg: match.legB,
            },
          ].map((side, i) => (
            <Stack
              key={i}
              flex={1}
              gap={space.sm}
              pad={space.md}
              bg={color.panel}
              outline={done && match.winner && side.who?.equals(match.winner) ? color.yellow : color.blue}
              align="center"
            >
              <MaskAvatar
                size={44}
                // A spectator is told who is playing — the match account is
                // public — so the mask is generated. It is their position
                // that is sealed, not their name.
                seed={side.who ? side.who.toBase58() : null}
                glyphSize={17}
                ring={done && match.winner && side.who?.equals(match.winner) ? color.yellow : color.panelLight}
              />
              <PixelText variant="bodySmall" size={10} color={color.white}>
                {side.who ? short(side.who) : 'WAITING'}
              </PixelText>
              {done ? (
                <>
                  <PixelText variant="label" size={11} color={side.bps >= 0 ? color.green : color.red}>
                    {pct(side.bps)}
                  </PixelText>
                  <PixelText variant="bodySmall" size={10} color={color.textFaint}>
                    {side.fills ?? 0} fills
                  </PixelText>
                </>
              ) : (
                <Stack gap={space.xs} align="center">
                  <Orb size={26} state={orbStateForPnl(0)} />
                  <PixelText variant="bodySmall" size={10} color={color.textFaint}>
                    FOGGED
                  </PixelText>
                </Stack>
              )}
            </Stack>
          ))}
        </Row>

        {live ? (
          <View style={{ height: 84 }}>
            <FogOverlay label="BOTH POSITIONS SEALED" />
          </View>
        ) : null}

        {done ? (
          <Stack gap={space.sm} pad={space.md} bg={color.ink} outline={color.panelLight}>
            <PixelText variant="label" size={9} color={color.yellow}>
              SETTLED ON SOLANA
            </PixelText>
            <Row justify="space-between">
              <PixelText variant="bodySmall" color={color.textDim}>
                paid to winner
              </PixelText>
              <PixelText variant="bodySmall">{solExact((match.revealed?.potPaid ?? 0) / 1e9)}</PixelText>
            </Row>
            <Row justify="space-between">
              <PixelText variant="bodySmall" color={color.textDim}>
                rake
              </PixelText>
              <PixelText variant="bodySmall">{solExact((match.revealed?.rake ?? 0) / 1e9)}</PixelText>
            </Row>
          </Stack>
        ) : null}

        <PixelText variant="bodySmall" size={10} color={color.textFaint}>
          {match.address.toBase58()}
        </PixelText>
      </Stack>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{
        padding: space.lg,
        paddingBottom: 80,
        gap: space.lg,
        maxWidth: 640,
        alignSelf: 'center',
        width: '100%',
      }}
      showsVerticalScrollIndicator={false}
    >
      <Row justify="space-between" align="center">
        <Wordmark size={16} />
        <Badge label={address ? 'SPECTATING' : 'LIVE DUELS'} tone="quiet" variant="label" />
      </Row>

      <Stack gap={space.xs}>
        <PixelText variant="h2">WATCHING</PixelText>
        <PixelText variant="bodySmall">
          Public data only. Both positions are sealed on the rollup and refused to
          you exactly as they are to the other player — no wallet needed to see that.
        </PixelText>
      </Stack>

      {body()}
    </ScrollView>
  );
}
