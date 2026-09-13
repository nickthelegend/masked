/**
 * MASKED — the running app. Composes the screens inside the pocket shell and
 * owns nothing but navigation; the duel itself lives in `useDuel`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, View } from 'react-native';
import { BeachBackdrop, MatchFound, PocketShell, TabBar, Ticker, color, solExact, useToast } from '../ui';
import AppHeader from './AppHeader';
import FeedScreen from './FeedScreen';
import LeaderboardScreen from './LeaderboardScreen';
import DuelLobbyScreen from './DuelLobbyScreen';
import MatchmakingScreen from './MatchmakingScreen';
import LiveRoundScreen from './LiveRoundScreen';
import RevealScreen from './RevealScreen';
import ModesScreen from './ModesScreen';
import QuestsScreen from './QuestsScreen';
import { useTickerItems } from '../chain/useTickerItems';
import { usePlayerStats } from '../chain/usePlayerStats';
import { searchMarkets } from '../chain/markets';
import { useRouter } from 'expo-router';
import { formatSolPrice } from '../chain/units';
import { useDuel } from './useDuel';
import { useMatchInvite } from '../chain/useMatchInvite';
import { TROPHIES_PER_WIN } from './data';

const SCREEN_HEIGHT = 700;

export interface MaskedAppProps {
  /** Mint from `?market=<mint>`, selected once on mount. */
  initialMarketMint?: string;
  /** Match from `?match=<address>`, an invite: matchmaking opens with it first. */
  initialMatch?: string;
}

export default function MaskedApp({ initialMarketMint, initialMatch }: MaskedAppProps = {}) {
  const [tab, setTab] = useState('duel');
  const duel = useDuel();
  const toast = useToast();
  const tickerItems = useTickerItems();
  /**
   * The trophy counter, straight off the player's on-chain account.
   *
   * `wins` is what `settle_match` increments, so the HUD counts the same thing
   * the leaderboard does. A wallet with no settled duels has no account yet and
   * shows zero, which is the truth rather than a placeholder.
   */
  const { board } = usePlayerStats();
  const trophies =
    board.find((r) => r.owner.toBase58() === duel.myAddress)?.wins ?? 0;

  /**
   * The lock-in card, once per duel.
   *
   * Keyed on the match address rather than on the phase, so it fires when a
   * *new* duel goes live and not again on a re-render, a reconnect, or a
   * reload part-way through a round already in progress.
   */
  const [greeted, setGreeted] = useState<string | null>(null);
  const lastLive = useRef<string | null>(null);
  useEffect(() => {
    if (duel.phase !== 'live' || !duel.matchAddress) return;
    if (lastLive.current === duel.matchAddress) return;
    lastLive.current = duel.matchAddress;
    // Only for a round that is genuinely just starting. Reopening the tab on a
    // duel with two minutes left should drop straight into the round.
    if (duel.duration - duel.secondsLeft <= 20) setGreeted(duel.matchAddress);
  }, [duel.phase, duel.matchAddress, duel.duration, duel.secondsLeft]);

  const router = useRouter();

  // Hand the deep link's mint to the duel once. `openMarketByMint` resolves it
  // through the picker's own search and selects it if it is still priceable.
  // Taken off `duel` first: depending on `duel` itself would re-run this on
  // every render, since the hook returns a new object each time.
  const { openMarketByMint } = duel;
  useEffect(() => {
    if (initialMarketMint) openMarketByMint(initialMarketMint);
  }, [initialMarketMint, openMarketByMint]);

  // An invite lands on matchmaking once, and only from the lobby: a link opened
  // mid-round must not pull the player out of the round they are in.
  //
  // It also waits for an answer about this wallet. Landing on the first render
  // moved the phase off 'lobby' before the local key had reconnected, and
  // useDuel resumes a player's own round only from there, so a creator who
  // reloaded onto their own link was stranded on matchmaking while the round
  // ran without them. Their own match, open or live, is left to that resume.
  const { findMatch, phase, connected, myAddress } = duel;
  const invite = useMatchInvite(initialMatch, myAddress);
  const inviteLanded = useRef(false);
  const [walletWaitOver, setWalletWaitOver] = useState(false);
  useEffect(() => {
    if (connected) return undefined;
    // With no wallet at all there is nothing to resume; do not wait forever.
    const id = setTimeout(() => setWalletWaitOver(true), 3000);
    return () => clearTimeout(id);
  }, [connected]);
  useEffect(() => {
    if (!initialMatch || inviteLanded.current || phase !== 'lobby') return;
    if (!connected && !walletWaitOver) return;
    if (invite.kind === 'none' || invite.kind === 'reading' || invite.viewer !== myAddress) return;
    inviteLanded.current = true;
    if (invite.kind === 'refused' && invite.mine) return;
    setTab('duel');
    findMatch();
  }, [initialMatch, phase, connected, walletWaitOver, invite, myAddress, findMatch]);

  /**
   * Open a duel on the token a settled tape was fought over.
   *
   * The tape stores a mint and a ticker, not a priceable market, so the mint
   * is resolved through the same search the picker uses before the lobby is
   * handed it. If the token can no longer be priced the lobby simply opens on
   * whatever was already selected — better than carrying a market forward that
   * `create_match` would reject.
   */
  const duelToken = (mint: string) => {
    setTab('duel');
    void (async () => {
      try {
        const [found] = await searchMarkets(mint);
        if (found && found.mint === mint) duel.selectMarket(found);
      } catch {
        /* the picker is still there; the player can choose by hand */
      }
    })();
  };

  const toMatchmaking = () => {
    setTab('duel');
    duel.findMatch();
  };

  const postToFeed = () => {
    setTab('feed');
    duel.backToLobby();
  };

  /**
   * Put a link on the clipboard, and say what actually happened.
   *
   * The clipboard can be refused (permissions, an insecure origin), so the
   * label never claims success it did not get, and a refusal shows the link in
   * a toast instead of ending there.
   */
  const copyLink = useCallback(
    (url: string, idle: string, setLabel: (label: string) => void) => {
      const done = (ok: boolean) => {
        setLabel(ok ? 'LINK COPIED' : 'COPY BLOCKED');
        // Browsers block writeText on insecure origins and without a user-gesture
        // grant, so this is a normal path, not an edge case.
        if (!ok) toast.info('Copy this link', url);
        setTimeout(() => setLabel(idle), 2500);
      };
      try {
        const clip = globalThis.navigator?.clipboard;
        if (!clip?.writeText) return done(false);
        void clip.writeText(url).then(() => done(true), () => done(false));
      } catch {
        done(false);
      }
    },
    [toast]
  );

  /**
   * A link anyone can open to read this duel — no wallet, no account.
   *
   * It points at /tape rather than /spectate. This button lives on the reveal,
   * where the round is already over: there is nothing left to watch, and the
   * thing that has just become public — every fill of both players — is what
   * /tape shows. The Tape account never changes after settlement, so the link
   * says the same thing tomorrow as it does now.
   */
  const [shareLabel, setShareLabel] = useState('COPY TAPE LINK');
  const shareWatchLink = () => {
    if (!duel.matchAddress) return;
    copyLink(`${globalThis.location?.origin ?? ''}/tape/${duel.matchAddress}`, 'COPY TAPE LINK', setShareLabel);
  };

  /** An invite to one of this wallet's open matches: `/play?match=<address>`. */
  const [inviteLabel, setInviteLabel] = useState('COPY INVITE LINK');
  const shareInvite = useCallback(
    (address: string) =>
      copyLink(`${globalThis.location?.origin ?? ''}/play?match=${address}`, 'COPY INVITE LINK', setInviteLabel),
    [copyLink]
  );

  /**
   * Fade the winner: a new duel against them at the stake and round length just
   * played, opened now, with its invite link handed back to send them.
   *
   * Spread over renders on purpose. `rematch` restores the stake and market and
   * `setOpenDuration` the length, but `openMatch` closes over those values, so
   * calling it in the same tick would open at the old stake — the stale-closure
   * shape 7cf4a83 fixed twice. It runs once the state shows the target, and the
   * link is handed back once that open has finished.
   */
  const fade = useRef<{ entrySol: number; duration: number; from: string | null } | null>(null);
  const fadeStep = useRef<'restoring' | 'opening' | 'opened'>('restoring');
  const [fadeLabel, setFadeLabel] = useState('FADE WINNER');
  const fadeWinner = () => {
    if (fade.current) return;
    fade.current = { entrySol: duel.entrySol, duration: duel.duration, from: duel.matchAddress };
    fadeStep.current = 'restoring';
    setFadeLabel('OPENING…');
    duel.rematch();
    duel.setOpenDuration(duel.duration);
  };
  const { stake, openDuration, openMatch, matchAddress, busy } = duel;
  useEffect(() => {
    const target = fade.current;
    if (!target) return;
    if (fadeStep.current === 'restoring') {
      if (phase !== 'searching' || Math.abs(stake - target.entrySol) > 1e-9 || openDuration !== target.duration) return;
      fadeStep.current = 'opening';
      openMatch();
      return;
    }
    // `busy` rises when the open starts and falls when it ends, succeeded or refused.
    if (fadeStep.current === 'opening') {
      if (busy) fadeStep.current = 'opened';
      return;
    }
    if (busy) return;
    fade.current = null;
    setFadeLabel('FADE WINNER');
    // A refused open leaves no new match; its own toast has said why.
    if (matchAddress && matchAddress !== target.from) shareInvite(matchAddress);
  }, [phase, stake, openDuration, openMatch, busy, matchAddress, shareInvite]);

  return (
    <View style={{ flex: 1, backgroundColor: color.sunset[0] }}>
      <StatusBar barStyle="light-content" />
      <BeachBackdrop />

      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <PocketShell screenHeight={SCREEN_HEIGHT}>
          <AppHeader balance={duel.balance} trophies={trophies} onHome={() => setTab('feed')} roundLive={duel.phase === 'live'} />
          <Ticker items={tickerItems} />

          {greeted && duel.phase === 'live' && greeted === duel.matchAddress ? (
            <MatchFound
              me={duel.myAddress ? `${duel.myAddress.slice(0, 6)}…` : 'YOU'}
              meSeed={duel.myAddress}
              them={duel.opponentName}
              themSeed={duel.opponentAddress}
              myToken={
                duel.marketMint
                  ? { mint: duel.marketMint, symbol: duel.market, uri: duel.marketImageUri }
                  : null
              }
              theirToken={
                duel.opponentMarketMint
                  ? { mint: duel.opponentMarketMint, symbol: duel.opponentMarket, uri: null }
                  : null
              }
              duration={duel.duration}
              onDone={() => setGreeted(null)}
            />
          ) : null}

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {tab === 'feed' ? (
              <FeedScreen
                onChallenge={(mint) => duelToken(mint)}
                onReadTape={(match) => router.push(`/tape/${match}`)}
              />
            ) : null}
            {tab === 'board' ? <LeaderboardScreen /> : null}
            {tab === 'modes' ? <ModesScreen wins={trophies} /> : null}
            {tab === 'quests' ? <QuestsScreen /> : null}

            {tab === 'duel' && duel.phase === 'lobby' ? (
              <DuelLobbyScreen
                stake={duel.stake}
                onStakeChange={duel.setStake}
                balanceLamports={duel.connected ? Math.round(duel.balance * 1e9) : undefined}
                duration={duel.openDuration}
                onDurationChange={duel.setOpenDuration}
                pot={duel.pot}
                onFind={toMatchmaking}
                selected={duel.selectedMarket}
                onSelectMarket={duel.selectMarket}
              />
            ) : null}

            {tab === 'duel' && duel.phase === 'searching' ? (
              <MatchmakingScreen
                pot={duel.pot}
                stake={duel.stake}
                busy={duel.busy}
                myAddress={duel.myAddress}
                marketSymbol={duel.selectedMarket?.symbol}
                marketMint={duel.selectedMarket?.mint}
                marketImageUri={duel.selectedMarket?.imageUri}
                // Create-only. `startMatch` joins any compatible open match before it
                // creates, so a button reading OPEN A MATCH joined a stranger's
                // instead (found 2026-09-13 when two test duels collided).
                onStart={duel.openMatch}
                onJoin={duel.joinMatch}
                onCancel={duel.cancelMatch}
                inviteAddress={initialMatch}
                onInvite={shareInvite}
                inviteLabel={inviteLabel}
              />
            ) : null}

            {tab === 'duel' && duel.phase === 'live' ? (
              <LiveRoundScreen
                secondsLeft={duel.secondsLeft}
                pot={duel.potGross}
                equity={duel.equity}
                price={duel.price}
                myPnl={duel.myPnl}
                positionLabel={duel.positionLabel}
                opponentName={duel.opponentName}
                opponentFills={duel.opponentFills}
                fills={duel.fills}
                fillSize={duel.fillSize}
                onFillSize={duel.setFillSize}
                sizeNote={duel.sizeNote}
                sessionActive={duel.sessionActive}
                onLong={duel.openLong}
                onShort={duel.openShort}
                onClose={duel.closeLong}
                liquidated={duel.liquidated}
                onSkip={duel.settleNow}
                busy={duel.busy}
                error={duel.error}
                sealed={duel.sealed}
                market={duel.market}
                marketMint={duel.marketMint}
                marketImageUri={duel.marketImageUri}
                marketSource={duel.marketSource}
                priceLabel={duel.priceLabel}
                settleStages={duel.settleStages}
                lastFillRaw={duel.lastFill}
                pendingFill={
                  duel.pendingFill
                    ? {
                        side: duel.pendingFill.side,
                        state: duel.pendingFill.state,
                        price: `${formatSolPrice(duel.pendingFill.px)}◎`,
                        mark: `${formatSolPrice(duel.pendingFill.markBefore)}◎`,
                      }
                    : null
                }
                lastFill={
                  duel.lastFill
                    ? {
                        side: duel.lastFill.side,
                        price: `${formatSolPrice(duel.lastFill.px)}◎`,
                        mark: `${formatSolPrice(duel.lastFill.markBefore)}◎`,
                        impactPct: duel.lastFill.impactPct,
                        at: duel.lastFill.at,
                      }
                    : null
                }
                teeEnforced={duel.teeEnforced}
                myName={duel.myAddress ? `${duel.myAddress.slice(0, 6)}…` : 'YOU'}
                myAddress={duel.myAddress}
                opponentAddress={duel.opponentAddress}
                mySide={duel.mySide}
                opponentMarket={duel.opponentMarket}
                opponentMarketMint={duel.opponentMarketMint}
                payout={solExact(duel.pot)}
                trophies={TROPHIES_PER_WIN}
                elapsed={Math.max(0, duel.duration - duel.secondsLeft)}
              />
            ) : null}

            {tab === 'duel' && duel.phase === 'reveal' ? (
              <RevealScreen
                won={duel.won}
                pot={duel.pot}
                stake={duel.entrySol}
                tape={duel.tape}
                isPlayerA={duel.isPlayerA}
                myName={duel.myAddress ? `${duel.myAddress.slice(0, 6)}…` : 'YOU'}
                myAddress={duel.myAddress}
                opponentAddress={duel.opponentAddress}
                entryLamports={duel.entryLamports}
                startTs={duel.startTs}
                duration={duel.duration}
                myPnl={duel.myPnl}
                opponentPnl={duel.opponentPnl}
                myFills={duel.fills.length}
                opponentFills={duel.opponentFills}
                opponentName={duel.opponentName}
                record={duel.record}
                onRematch={duel.rematch}
                onShare={shareWatchLink}
                shareLabel={shareLabel}
                onFade={fadeWinner}
                fadeLabel={fadeLabel}
                tapeUrl={duel.matchAddress ? `${globalThis.location?.origin ?? ''}/tape/${duel.matchAddress}` : null}
                onPost={postToFeed}
              />
            ) : null}
          </ScrollView>

          <TabBar active={tab} onChange={setTab} />
        </PocketShell>
      </SafeAreaView>
    </View>
  );
}
