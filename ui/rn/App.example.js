/**
 * MASKED — Fog Duel MVP (React Native / Expo)
 * Single-file port of Masked.dc.html. Same screens, same 8-bit vocabulary.
 *
 * Setup:
 *   npx create-expo-app masked && cd masked
 *   npx expo install react-native-svg expo-font @expo-google-fonts/press-start-2p @expo-google-fonts/silkscreen
 *   replace App.js with this file
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, SafeAreaView, StatusBar, Animated, Easing, StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useFonts } from 'expo-font';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { Silkscreen_400Regular } from '@expo-google-fonts/silkscreen';

/* ---------- palette ---------- */
const C = {
  navy: '#111a44', navyD: '#0a0f2b', panel: '#1b2a63', panelL: '#24398a', line: '#060a1c',
  yellow: '#ffd21e', orange: '#ffb31e', green: '#2fbf5c', greenD: '#1e8f42',
  red: '#ff4d5e', cyan: '#35e0ff', magenta: '#ff4dd2', blue: '#2d5be3',
  purple: '#b46bff', dim: '#9fb0e8', dimmer: '#6f83c8', white: '#fff',
  shellA: '#e0323c', shellB: '#b41822', shellD: '#6d0c14', shellI: '#3b0a10', shellBtn: '#7a0e16',
};
const PS = 'PressStart2P_400Regular';
const SK = 'Silkscreen_400Regular';

/* ---------- helpers ---------- */
const path = (v, w, h, mn, mx, pad = 10) => {
  const lo = mn ?? Math.min(...v), hi = mx ?? Math.max(...v), r = (hi - lo) || 1, ih = h - pad * 2;
  return v.map((x, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * w).toFixed(1)},${(pad + ih - (x - lo) / r * ih).toFixed(1)}`).join(' ');
};
const walk = (n, s) => { let p = 0; const o = [0]; for (let i = 0; i < n; i++) { p += Math.sin(i * s) * 1.4 + (Math.random() - 0.48) * 2; o.push(p); } return o; };
const toEnd = (n, end) => {
  const w = walk(n - 1, 0.9), m = Math.max(...w.map(Math.abs)) || 1;
  // noise damped to zero at the last sample so the curve lands exactly on `end`
  return w.map((v, i) => { const f = i / (n - 1); return end * f + v / m * Math.abs(end || 1) * 0.8 * (1 - f); });
};
const pct = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
const money = (n) => '$' + n.toFixed(2);
const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

/* ---------- data ---------- */
const FEED = [
  { token: '$BONK', pot: '$50', winner: 'nofills.sol', loser: 'jpegliq', w: '+4.12%', l: '-1.80%', ago: '2m ago', a: [0, 3, 1, 6, 4, 9, 7, 12], b: [0, -1, 2, -3, -2, -5, -3, -6] },
  { token: '$WIF', pot: '$10', winner: 'vwapgoblin', loser: 'shadowbid', w: '+2.06%', l: '+0.44%', ago: '11m ago', a: [0, 2, 4, 3, 7, 6, 8, 9], b: [0, 1, 3, 2, 4, 2, 3, 4] },
  { token: '$POPCAT', pot: '$200', winner: 'maskedmoe', loser: 'exitliq', w: '+7.90%', l: '-5.10%', ago: '26m ago', a: [0, -2, 3, 8, 6, 14, 11, 18], b: [0, -3, -1, -6, -4, -9, -11, -13] },
];
const BOARD = [[4, 'liqhunter', '+$120', '18W'], [5, 'fogboy', '+$96', '15W'], [6, 'tapeworm', '+$88', '14W'],
  [7, '0xsilent', '+$70', '12W'], [8, 'benttape', '+$62', '11W'], [9, 'candlejack', '+$54', '9W'],
  [10, 'rugpatrol', '+$48', '9W'], [11, 'sizeplease', '+$40', '7W']];
const MODES = [
  ['FOG DUEL', 'Same token, 5 min, hidden positions.', 'LIVE'],
  ['CHICKEN', 'First seller pays a penalty to holders.', 'SOON'],
  ['FADE ME', 'Opponent must take the opposite side.', 'SOON'],
  ['GHOST ROYALE', 'Bottom 3 cut every 90 seconds.', 'SOON'],
  ['BLIND DRAFT', 'VRF picks 3 tokens, you pick privately.', 'SOON'],
  ['HOT POTATO', 'Empty-handed at the buzzer = loss.', 'SOON'],
  ['SQUAD FOG', '2v2. Teammates visible, enemies fogged.', 'SOON'],
  ['SUDDEN REVEAL', '4 min fog, then 60s public chaos.', 'SOON'],
  ['COPY BAN', 'You see that they traded, not what.', 'SOON'],
  ['ASSASSINATION', 'Beat the marked wallet blind.', 'SOON'],
  ['HOLD THE LINE', 'Early exit pays the table.', 'SOON'],
  ['THESIS FIGHT', 'Lock a private thesis, reveal with tape.', 'SOON'],
];
const QUESTS = [
  { name: 'Win 3 fog duels', reward: '+$5', pct: 0.66, progress: '2 / 3' },
  { name: 'Fade a winner', reward: '+$2', pct: 0, progress: '0 / 1' },
  { name: 'Post 5 reveals', reward: '+250 XP', pct: 0.4, progress: '2 / 5' },
  { name: 'Rematch the same wallet', reward: '+$1', pct: 1, progress: '1 / 1' },
];
const TICKER = 't_kev_2 WON $7.65 ON FOG DUEL   ·   nofills.sol 6 WIN STREAK   ·   vwapgoblin FADED jpegliq FOR $24   ·   LIVE FOGS: 38   ·   ';

/* ---------- pixel primitives ---------- */
const Bevel = ({ style, color = C.panel, border = C.navyD, radius = 0, children }) => (
  <View style={[{ backgroundColor: color, borderWidth: 3, borderColor: border, borderRadius: radius,
    borderBottomWidth: 6 }, style]}>{children}</View>
);
const Btn = ({ onPress, color, textColor = C.white, label, size = 12, style }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [
    { backgroundColor: color, borderWidth: 3, borderColor: C.navyD, borderBottomWidth: pressed ? 3 : 7,
      alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 6,
      transform: [{ translateY: pressed ? 4 : 0 }] }, style]}>
    <Text style={{ fontFamily: PS, fontSize: size, color: textColor }}>{label}</Text>
  </Pressable>
);
const Mask = ({ size = 60, color = C.blue, fs = 22 }) => (
  <View style={{ width: size, height: size, backgroundColor: C.navyD, borderWidth: 3, borderColor: color,
    alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontFamily: PS, fontSize: fs, color }}>?</Text>
  </View>
);

/* ---------- animated pixel sunset beach ---------- */
function Beach() {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = (v, ms) => Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true })).start();
    loop(a, 7000); loop(b, 11000);
  }, [a, b]);
  const tx = (v, d) => ({ transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, d] }) }] });
  const band = (top, h, c) => <View key={top} style={{ position: 'absolute', left: 0, right: 0, top, height: h, backgroundColor: c }} />;
  const wave = (top, v, d, o) => (
    <Animated.View style={[{ position: 'absolute', top, left: -120, flexDirection: 'row', opacity: o }, tx(v, d)]}>
      {Array.from({ length: 26 }).map((_, i) => (
        <View key={i} style={{ width: 26, height: 8, marginRight: 64, backgroundColor: '#cfe9ff' }} />
      ))}
    </Animated.View>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* sunset sky — thin indigo strip up top, orange/amber dominant */}
      {[['#3a2350', 0], ['#7a3358', 50], ['#c85a4a', 110], ['#f0803c', 190], ['#ff9f3c', 265],
        ['#ffc25e', 330], ['#ffdd94', 390]].map(([c, t]) => band(t, 80, c))}
      <View style={{ position: 'absolute', left: '50%', marginLeft: -70, top: 300, width: 140, height: 140, backgroundColor: '#fff0a8' }} />
      {band(452, 6, '#ffdd94')}
      {band(458, 40, '#e8934f')}
      {band(498, 130, '#2a5c86')}
      {wave(470, a, 90, 1)}
      {wave(520, b, 90, 0.75)}
      {band(628, 14, '#ffefd8')}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 642, bottom: 0, backgroundColor: '#c9895a' }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <View key={i} style={{ height: 6, backgroundColor: i % 2 ? '#bd7f54' : '#c9895a' }} />
        ))}
      </View>
    </View>
  );
}

/* ---------- screens ---------- */
function Feed({ onChallenge }) {
  return (
    <View style={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        {['REVEALS', 'LIVE FOG', 'FRIENDS'].map((t, i) => (
          <View key={t} style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: i === 0 ? C.yellow : C.panel,
            borderWidth: 3, borderColor: C.navyD, borderBottomWidth: 6 }}>
            <Text style={{ fontFamily: PS, fontSize: 9, color: i === 0 ? '#3a2a00' : C.dim }}>{t}</Text>
          </View>
        ))}
      </View>
      {FEED.map((m) => (
        <Bevel key={m.token} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, backgroundColor: C.panelL,
            borderBottomWidth: 3, borderBottomColor: C.navyD }}>
            <Text style={{ fontFamily: PS, fontSize: 8, color: C.yellow }}>FOG DUEL · {m.token}</Text>
            <Text style={{ fontFamily: SK, fontSize: 11, color: C.dim }}>{m.ago}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, padding: 10, alignItems: 'flex-start' }}>
            <View style={{ width: 88 }}>
              <Mask size={58} color={C.yellow} fs={20} />
              <Text numberOfLines={1} style={{ fontFamily: SK, fontSize: 11, color: C.white, marginTop: 4 }}>{m.winner}</Text>
              <Text style={{ fontFamily: PS, fontSize: 9, color: C.green }}>{m.w}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.navyD, height: 58 }}>
              <Svg width="100%" height="58" viewBox="0 0 200 58">
                <Path d={path(m.a, 200, 58, undefined, undefined, 6)} stroke={C.cyan} strokeWidth="2" fill="none" />
                <Path d={path(m.b, 200, 58, undefined, undefined, 6)} stroke={C.magenta} strokeWidth="2" strokeDasharray="4 3" fill="none" />
              </Svg>
              <Text style={{ position: 'absolute', right: 4, top: 4, fontFamily: SK, fontSize: 10, color: C.yellow }}>POT {m.pot}</Text>
            </View>
            <View style={{ width: 88, alignItems: 'flex-end' }}>
              <Mask size={58} color="#3b4a86" fs={20} />
              <Text numberOfLines={1} style={{ fontFamily: SK, fontSize: 11, color: C.dim, marginTop: 4 }}>{m.loser}</Text>
              <Text style={{ fontFamily: PS, fontSize: 9, color: C.red }}>{m.l}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingBottom: 10 }}>
            <Btn style={{ flex: 1 }} color={C.green} label="COPY" size={8} />
            <Btn style={{ flex: 1 }} color={C.red} label="FADE" size={8} />
            <Btn style={{ flex: 1.4 }} color={C.yellow} textColor="#3a2a00" label="CHALLENGE" size={8} onPress={onChallenge} />
          </View>
        </Bevel>
      ))}
    </View>
  );
}

function Leaderboard() {
  const podium = [
    { n: 'shadowbid', r: '#2', w: '14W', h: 46, c: '#8e9dd4', fg: C.navyD },
    { n: 'nofills.sol', r: '#1', w: '21W', h: 74, c: C.orange, fg: '#3a2a00' },
    { n: 'vwapgoblin', r: '#3', w: '11W', h: 32, c: '#c9713d', fg: '#2b1200' },
  ];
  return (
    <View style={{ padding: 14 }}>
      <Text style={{ fontFamily: PS, fontSize: 14, color: C.white, textAlign: 'center' }}>FOG WINS · 24H</Text>
      <View style={{ alignSelf: 'center', marginVertical: 10, paddingHorizontal: 10, paddingVertical: 5,
        backgroundColor: C.navyD, borderWidth: 3, borderColor: C.panelL }}>
        <Text style={{ fontFamily: PS, fontSize: 9, color: C.yellow }}>RESETS IN 06:12:40</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 14 }}>
        {podium.map((p) => (
          <View key={p.r} style={{ flex: p.r === '#1' ? 1.15 : 1, alignItems: 'center' }}>
            <Mask size={p.r === '#1' ? 64 : 54} color={p.c} fs={p.r === '#1' ? 22 : 18} />
            <Text numberOfLines={1} style={{ fontFamily: SK, fontSize: 11, color: p.r === '#1' ? C.yellow : C.white, marginTop: 4 }}>{p.n}</Text>
            <View style={{ width: '100%', marginTop: 4, height: p.h, backgroundColor: p.c, borderWidth: 3,
              borderColor: C.navyD, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: PS, fontSize: 11, color: p.fg }}>{p.r}</Text>
              <Text style={{ fontFamily: PS, fontSize: 8, color: p.fg }}>{p.w}</Text>
            </View>
          </View>
        ))}
      </View>
      {BOARD.map(([rank, name, won, wins]) => (
        <View key={rank} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, padding: 8,
          backgroundColor: C.panel, borderWidth: 3, borderColor: C.blue }}>
          <Text style={{ width: 34, textAlign: 'center', fontFamily: PS, fontSize: 9, color: C.yellow }}>#{rank}</Text>
          <Mask size={30} color="#3b4a86" fs={11} />
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: SK, fontSize: 12, color: C.white }}>{name}</Text>
          <Text style={{ fontFamily: PS, fontSize: 9, color: C.green }}>{won}</Text>
          <Text style={{ fontFamily: PS, fontSize: 9, color: C.dim }}>{wins}</Text>
        </View>
      ))}
    </View>
  );
}

function Lobby({ stake, setStake, pot, onFind }) {
  const side = (label, color) => (
    <View key={label} style={{ paddingVertical: 8, paddingHorizontal: 4, backgroundColor: color, borderWidth: 3,
      borderColor: C.navyD, borderBottomWidth: 6, alignItems: 'center' }}>
      <Text style={{ fontFamily: PS, fontSize: 7, color: C.white, textAlign: 'center', lineHeight: 13 }}>{label}</Text>
    </View>
  );
  return (
    <View style={{ padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ width: 72, gap: 8 }}>{[['DOUBLE\nPOT', '#c9713d'], ['FREE\nENTRY', C.blue], ['SWAP', '#7a3fd4']].map(([l, c]) => side(l, c))}</View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1436',
          borderWidth: 3, borderColor: C.navyD, paddingVertical: 12 }}>
          <Text style={{ fontFamily: PS, fontSize: 8, color: C.dim }}>TODAY'S TOKEN</Text>
          <Text style={{ fontFamily: PS, fontSize: 20, color: C.yellow, marginVertical: 8 }}>$BONK</Text>
          <Mask size={118} color={C.blue} fs={44} />
          <View style={{ marginTop: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.navyD, borderWidth: 2, borderColor: C.panelL }}>
            <Text style={{ fontFamily: SK, fontSize: 11, color: C.white }}>HIDDEN FILLS · 5 MIN</Text>
          </View>
        </View>
        <View style={{ width: 72, gap: 8 }}>{[['DAILY\nQUEST', C.green], ['SOCIAL\nBONUS', C.greenD], ['RANK\nB1', C.panelL]].map(([l, c]) => side(l, c))}</View>
      </View>
      <Bevel style={{ padding: 10 }}>
        <Text style={{ fontFamily: PS, fontSize: 9, color: C.yellow, marginBottom: 8 }}>POT DEPOSIT</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[1, 5, 25, 100].map((v) => (
            <Btn key={v} style={{ flex: 1 }} color={v === stake ? C.orange : C.panelL} label={'$' + v} size={10} onPress={() => setStake(v)} />
          ))}
        </View>
        <Text style={{ fontFamily: SK, fontSize: 11, color: C.dim, marginTop: 8 }}>WINNER TAKES {money(pot)} · 2% RAKE</Text>
      </Bevel>
      <Btn color={C.green} label="FIND MATCH" size={14} style={{ paddingVertical: 18 }} onPress={onFind} />
      <Text style={{ fontFamily: SK, fontSize: 11, color: C.dimmer, textAlign: 'center' }}>
        FOG DUEL 1V1 · PRIVATE ROLLUP · SETTLES ON SOLANA
      </Text>
    </View>
  );
}

function Searching({ pot, onStart }) {
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 18 }}>
      <Text style={{ fontFamily: PS, fontSize: 12, color: C.yellow }}>MATCHING...</Text>
      <Mask size={150} color={C.blue} fs={56} />
      <Text style={{ fontFamily: SK, fontSize: 13, color: C.white }}>POT {money(pot)} · 5:00 · $BONK</Text>
      <Btn color={C.yellow} textColor="#3a2a00" label="OPPONENT FOUND ›" size={11} style={{ paddingHorizontal: 24 }} onPress={onStart} />
    </View>
  );
}

function Live({ clock, pot, series, price, myPnl, posLabel, oppName, oppFills, fills, onLong, onClose, onSkip }) {
  return (
    <View style={{ padding: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, backgroundColor: C.navyD,
        borderWidth: 3, borderColor: C.panelL }}>
        <Text style={{ fontFamily: PS, fontSize: 8, color: C.dim }}>FOG DUEL · $BONK</Text>
        <Text style={{ fontFamily: PS, fontSize: 14, color: C.yellow }}>{clock}</Text>
        <Text style={{ fontFamily: PS, fontSize: 8, color: C.green }}>POT {money(pot)}</Text>
      </View>
      <View style={{ marginTop: 10, backgroundColor: '#0d1436', borderWidth: 3, borderColor: C.navyD, padding: 8 }}>
        <Svg width="100%" height="200" viewBox="0 0 340 200">
          <Path d="M0 100 H340" stroke="#26306a" strokeWidth="2" />
          <Path d={path(series.length > 1 ? series : [100, 100], 340, 200)} stroke={C.cyan} strokeWidth="3" fill="none" />
        </Svg>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontFamily: SK, fontSize: 11, color: C.dim }}>PRICE {price.toFixed(4)}</Text>
          <Text style={{ fontFamily: SK, fontSize: 11, color: C.yellow }}>YOUR PNL {pct(myPnl)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 1, padding: 10, backgroundColor: C.panel, borderWidth: 3, borderColor: C.cyan }}>
          <Text style={{ fontFamily: PS, fontSize: 8, color: C.cyan }}>YOU</Text>
          <Text style={{ fontFamily: PS, fontSize: 13, color: C.white, marginTop: 6 }}>{pct(myPnl)}</Text>
          <Text style={{ fontFamily: SK, fontSize: 11, color: C.dim, marginTop: 4 }}>{posLabel}</Text>
        </View>
        <View style={{ flex: 1, padding: 10, backgroundColor: '#0d1436', borderWidth: 3, borderColor: '#3b4a86' }}>
          <Text style={{ fontFamily: PS, fontSize: 8, color: C.dimmer }}>{oppName.toUpperCase()}</Text>
          <Text style={{ fontFamily: PS, fontSize: 13, color: '#5f74bd', marginTop: 6 }}>████</Text>
          <Text style={{ fontFamily: SK, fontSize: 11, color: C.dimmer, marginTop: 4 }}>FOGGED · {oppFills} FILLS</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Btn style={{ flex: 1, paddingVertical: 16 }} color={C.green} label="LONG" onPress={onLong} />
        <Btn style={{ flex: 1, paddingVertical: 16 }} color={C.red} label="CLOSE" onPress={onClose} />
      </View>
      <View style={{ marginTop: 10, backgroundColor: C.panel, borderWidth: 3, borderColor: C.navyD, padding: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontFamily: PS, fontSize: 8, color: C.yellow }}>YOUR TAPE</Text>
          <Text style={{ fontFamily: PS, fontSize: 8, color: C.dimmer }}>HIDDEN UNTIL REVEAL</Text>
        </View>
        {(fills.length ? fills : [{ side: '—', px: 'no fills yet', t: '' }]).map((f, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4,
            borderTopWidth: 2, borderTopColor: C.panelL }}>
            <Text style={{ fontFamily: SK, fontSize: 11, color: C.white }}>{f.side}</Text>
            <Text style={{ fontFamily: SK, fontSize: 11, color: C.dim }}>{f.px}</Text>
            <Text style={{ fontFamily: SK, fontSize: 11, color: C.white }}>{f.t}</Text>
          </View>
        ))}
      </View>
      <Btn color={C.panelL} label="SKIP TO REVEAL (DEMO)" size={8} style={{ marginTop: 10, paddingVertical: 8 }} onPress={onSkip} />
    </View>
  );
}

function Reveal({ won, pot, stake, eq, oppPnl, myPnl, myFills, oppFills, oppName, onRematch, onFade, onPost }) {
  const mine = eq.length > 2 ? eq : [0, 0.2, -0.1, 0.4, 0.1, myPnl];
  const opp = toEnd(mine.length, oppPnl);
  const lo = Math.min(...mine, ...opp), hi = Math.max(...mine, ...opp);
  return (
    <View style={{ padding: 14 }}>
      <Text style={{ fontFamily: PS, fontSize: 17, color: C.yellow, textAlign: 'center' }}>
        {won ? 'YOU TAKE THE POT' : 'POT LOST'}
      </Text>
      <View style={{ alignSelf: 'center', marginVertical: 10, paddingHorizontal: 12, paddingVertical: 6,
        backgroundColor: won ? C.green : C.red, borderWidth: 3, borderColor: C.navyD }}>
        <Text style={{ fontFamily: PS, fontSize: 11, color: C.white }}>{won ? '+' + money(pot) : '-' + money(stake)}</Text>
      </View>
      <View style={{ backgroundColor: '#0d1436', borderWidth: 3, borderColor: C.navyD, padding: 8 }}>
        <Text style={{ fontFamily: PS, fontSize: 8, color: C.dim, marginBottom: 6 }}>TAPE REVEAL</Text>
        <Svg width="100%" height="170" viewBox="0 0 340 170">
          <Path d={path(mine, 340, 170, lo, hi)} stroke={C.cyan} strokeWidth="3" fill="none" />
          <Path d={path(opp, 340, 170, lo, hi)} stroke={C.magenta} strokeWidth="3" strokeDasharray="5 4" fill="none" />
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 1, padding: 10, backgroundColor: C.panel, borderWidth: 3, borderColor: C.cyan }}>
          <Text style={{ fontFamily: SK, fontSize: 11, color: C.cyan }}>YOU</Text>
          <Text style={{ fontFamily: PS, fontSize: 13, color: C.white, marginTop: 4 }}>{pct(myPnl)}</Text>
          <Text style={{ fontFamily: SK, fontSize: 10, color: C.dim, marginTop: 4 }}>{myFills} FILLS</Text>
        </View>
        <View style={{ flex: 1, padding: 10, backgroundColor: C.panel, borderWidth: 3, borderColor: C.magenta }}>
          <Text style={{ fontFamily: SK, fontSize: 11, color: C.magenta }}>{oppName.toUpperCase()}</Text>
          <Text style={{ fontFamily: PS, fontSize: 13, color: C.white, marginTop: 4 }}>{pct(oppPnl)}</Text>
          <Text style={{ fontFamily: SK, fontSize: 10, color: C.dim, marginTop: 4 }}>{oppFills} FILLS</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Btn style={{ flex: 1 }} color={C.yellow} textColor="#3a2a00" label="REMATCH" size={10} onPress={onRematch} />
        <Btn style={{ flex: 1 }} color={C.red} label="FADE WINNER" size={10} onPress={onFade} />
      </View>
      <Btn color={C.blue} label="POST REVEAL TO FEED" size={9} style={{ marginTop: 8 }} onPress={onPost} />
    </View>
  );
}

function Modes() {
  return (
    <View style={{ padding: 12 }}>
      <Text style={{ fontFamily: PS, fontSize: 13, color: C.white, marginBottom: 12 }}>GAME MODES</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {MODES.map(([name, desc, tag]) => {
          const live = tag === 'LIVE';
          return (
            <View key={name} style={{ width: '47.5%', minHeight: 108, padding: 10, justifyContent: 'space-between',
              backgroundColor: live ? C.greenD : C.panel, borderWidth: 3, borderColor: C.navyD, borderBottomWidth: 7 }}>
              <Text style={{ fontFamily: PS, fontSize: 9, color: live ? C.white : '#c8d3f7', lineHeight: 14 }}>{name}</Text>
              <Text style={{ fontFamily: SK, fontSize: 10, color: live ? '#d5ffe4' : '#7f91d1', lineHeight: 14 }}>{desc}</Text>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 3, backgroundColor: C.navyD }}>
                <Text style={{ fontFamily: PS, fontSize: 7, color: live ? '#7dffab' : C.yellow }}>{tag}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Quests() {
  return (
    <View style={{ padding: 12 }}>
      <Text style={{ fontFamily: PS, fontSize: 13, color: C.white, marginBottom: 12 }}>DAILY QUESTS</Text>
      {QUESTS.map((q) => (
        <Bevel key={q.name} style={{ marginBottom: 10, padding: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontFamily: SK, fontSize: 12, color: C.white }}>{q.name}</Text>
            <Text style={{ fontFamily: PS, fontSize: 9, color: C.yellow }}>{q.reward}</Text>
          </View>
          <View style={{ marginTop: 8, height: 14, backgroundColor: C.navyD, borderWidth: 2, borderColor: C.panelL }}>
            <View style={{ height: '100%', width: `${q.pct * 100}%`, backgroundColor: C.green }} />
          </View>
          <Text style={{ fontFamily: SK, fontSize: 10, color: C.dim, marginTop: 4 }}>{q.progress}</Text>
        </Bevel>
      ))}
    </View>
  );
}

/* ---------- colorful bottom tabs ---------- */
const TABS = [
  { key: 'feed', label: 'FEED', glyph: '▤', icon: C.cyan, ink: '#06263a' },
  { key: 'board', label: 'RANK', glyph: '▲', icon: C.orange, ink: '#4a2e00' },
  { key: 'duel', label: 'DUEL', glyph: '⚔', icon: C.red, ink: '#fff', big: true },
  { key: 'modes', label: 'MODES', glyph: '▦', icon: C.purple, ink: '#2c0a4a' },
  { key: 'quests', label: 'QUEST', glyph: '✓', icon: C.green, ink: '#05270f' },
];
function TabBar({ screen, go }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, paddingHorizontal: 8, paddingTop: 8,
      paddingBottom: 12, backgroundColor: C.navyD, borderTopWidth: 4, borderTopColor: C.panelL }}>
      {TABS.map((t) => {
        const on = screen === t.key;
        const plate = t.big ? (on ? C.yellow : '#c9971a') : (on ? C.blue : C.panel);
        const s = t.big ? 34 : 26;
        return (
          <Pressable key={t.key} onPress={() => go(t.key)} style={{ flex: t.big ? 1.3 : 1, alignItems: 'center',
            paddingVertical: t.big ? 12 : 8, backgroundColor: plate, borderWidth: 3, borderColor: C.navyD,
            borderRadius: 10, borderBottomWidth: 7 }}>
            <View style={{ width: s, height: s, backgroundColor: t.icon, borderRadius: 6, borderWidth: 2,
              borderColor: t.ink === '#fff' ? '#5c0a12' : t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: PS, fontSize: t.big ? 15 : 12, color: t.ink }}>{t.glyph}</Text>
            </View>
            <Text style={{ fontFamily: PS, fontSize: t.big ? 8 : 7, color: t.big && on ? '#3a2a00' : C.white, marginTop: 5 }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- app ---------- */
export default function App() {
  const [fontsLoaded] = useFonts({ PressStart2P_400Regular, Silkscreen_400Regular });
  const [screen, setScreen] = useState('duel');
  const [phase, setPhase] = useState('lobby');
  const [stake, setStake] = useState(5);
  const [bal, setBal] = useState(50);
  const [left, setLeft] = useState(300);
  const [series, setSeries] = useState([100]);
  const [eq, setEq] = useState([0]);
  const [pos, setPos] = useState(null);
  const [realized, setRealized] = useState(0);
  const [fills, setFills] = useState([]);
  const [oppPnl, setOppPnl] = useState(0);
  const [oppFills, setOppFills] = useState(0);
  const oppName = 'nofills.sol';
  const pot = stake * 2 * 0.98;
  const price = series[series.length - 1];
  const unreal = pos ? (price - pos.px) / pos.px * 100 : 0;
  const myPnl = realized + unreal;

  const marquee = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(marquee, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true })).start();
  }, [marquee]);

  const settle = () => {
    const r = realized + unreal;
    const o = +((Math.random() * 7) - 3).toFixed(2);
    if (pos) setFills((f) => [{ side: 'SETTLE', px: price.toFixed(4), t: mmss(left) }, ...f].slice(0, 6));
    setRealized(r); setEq((e) => [...e, r]); setPos(null); setOppPnl(o); setPhase('reveal');
    if (r >= o) setBal((b) => b + pot);
  };

  useEffect(() => {
    if (phase !== 'live') return undefined;
    const id = setInterval(() => {
      setSeries((s) => {
        const last = s[s.length - 1];
        const px = +(last * (1 + (Math.random() - 0.49) * 0.012)).toFixed(4);
        return [...s, px].slice(-120);
      });
      setEq((e) => [...e, realized + unreal].slice(-120));
      setOppFills((n) => n + (Math.random() < 0.22 ? 1 : 0));
      setLeft((t) => { if (t <= 1) { settle(); return 0; } return t - 1; });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, realized, unreal]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMatch = () => {
    setPhase('live'); setLeft(300); setSeries([100]); setEq([0]); setPos(null);
    setRealized(0); setFills([]); setOppFills(1 + Math.floor(Math.random() * 3)); setBal((b) => b - stake);
  };
  const openLong = () => { if (pos) return; setPos({ px: price }); setFills((f) => [{ side: 'LONG', px: price.toFixed(4), t: mmss(left) }, ...f].slice(0, 6)); };
  const closeLong = () => { if (!pos) return; setRealized((r) => r + unreal); setPos(null); setFills((f) => [{ side: 'CLOSE', px: price.toFixed(4), t: mmss(left) }, ...f].slice(0, 6)); };
  const toSearch = () => { setScreen('duel'); setPhase('searching'); };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.navy }} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#2b1a4a' }}>
      <StatusBar barStyle="light-content" />
      <Beach />
      {/* red pocket shell, centered */}
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: '100%', maxWidth: 440, backgroundColor: C.shellB, borderWidth: 6, borderColor: C.shellD,
          borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 70,
          paddingHorizontal: 14, paddingTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10 }}>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#ff8a90' }} />
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.shellBtn }} />
            </View>
            <Text style={{ fontFamily: PS, fontSize: 8, color: '#ffd0d3' }}>MASKED·POCKET</Text>
            <View style={{ width: 34, height: 6, borderRadius: 3, backgroundColor: C.shellBtn }} />
          </View>

          <View style={{ backgroundColor: C.shellI, padding: 10, borderTopLeftRadius: 16, borderTopRightRadius: 16,
            borderBottomRightRadius: 16, borderBottomLeftRadius: 30 }}>
            <View style={{ height: 700, backgroundColor: C.navy, borderWidth: 4, borderColor: C.line,
              borderRadius: 22, overflow: 'hidden' }}>
              {/* header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }}>
                <Pressable onPress={() => setScreen('feed')} style={{ width: 38, height: 32, backgroundColor: C.blue,
                  borderWidth: 3, borderColor: C.navyD, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: PS, fontSize: 11, color: C.white }}>↺</Text>
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, backgroundColor: C.panel,
                  borderWidth: 3, borderColor: C.navyD }}>
                  <View style={{ width: 22, height: 22, backgroundColor: C.blue, borderWidth: 2, borderColor: C.navyD,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: PS, fontSize: 9, color: C.yellow }}>$</Text>
                  </View>
                  <Text style={{ fontFamily: PS, fontSize: 10, color: C.white }}>{bal.toFixed(2)}</Text>
                </View>
                <Text style={{ flex: 1, textAlign: 'center', fontFamily: PS, fontSize: 15, color: C.white }}>MASKED</Text>
                <View style={{ width: 38, height: 32, backgroundColor: C.green, borderWidth: 3, borderColor: C.navyD,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: PS, fontSize: 10, color: C.white }}>≡</Text>
                </View>
              </View>
              {/* ticker */}
              <View style={{ height: 26, backgroundColor: C.navyD, borderTopWidth: 3, borderBottomWidth: 3,
                borderColor: C.panel, overflow: 'hidden', justifyContent: 'center' }}>
                <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: marquee.interpolate({ inputRange: [0, 1], outputRange: [0, -900] }) }] }}>
                  <Text style={{ fontFamily: SK, fontSize: 11, color: C.dim }} numberOfLines={1}>{TICKER + TICKER}</Text>
                </Animated.View>
              </View>
              {/* screens */}
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {screen === 'feed' && <Feed onChallenge={toSearch} />}
                {screen === 'board' && <Leaderboard />}
                {screen === 'modes' && <Modes />}
                {screen === 'quests' && <Quests />}
                {screen === 'duel' && phase === 'lobby' && <Lobby stake={stake} setStake={setStake} pot={pot} onFind={toSearch} />}
                {screen === 'duel' && phase === 'searching' && <Searching pot={pot} onStart={startMatch} />}
                {screen === 'duel' && phase === 'live' && (
                  <Live clock={mmss(left)} pot={pot} series={series} price={price} myPnl={myPnl}
                    posLabel={pos ? 'LONG FROM ' + pos.px.toFixed(4) : 'FLAT'} oppName={oppName} oppFills={oppFills}
                    fills={fills} onLong={openLong} onClose={closeLong} onSkip={settle} />
                )}
                {screen === 'duel' && phase === 'reveal' && (
                  <Reveal won={myPnl >= oppPnl} pot={pot} stake={stake} eq={eq} oppPnl={oppPnl} myPnl={myPnl}
                    myFills={fills.length} oppFills={oppFills} oppName={oppName}
                    onRematch={() => setPhase('searching')} onFade={() => setPhase('searching')}
                    onPost={() => { setScreen('feed'); setPhase('lobby'); }} />
                )}
              </ScrollView>
              <TabBar screen={screen} go={setScreen} />
            </View>
          </View>

          {/* shell controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 12, paddingTop: 16, paddingBottom: 20 }}>
            <View style={{ width: 74, height: 74 }}>
              <View style={{ position: 'absolute', left: 24, width: 26, height: 74, backgroundColor: '#5c0a12',
                borderWidth: 3, borderColor: C.shellI, borderRadius: 6 }} />
              <View style={{ position: 'absolute', top: 24, width: 74, height: 26, backgroundColor: '#5c0a12',
                borderWidth: 3, borderColor: C.shellI, borderRadius: 6 }} />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: PS, fontSize: 9, color: '#ffd0d3' }}>FOG DUEL</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <View style={{ width: 30, height: 8, borderRadius: 4, backgroundColor: C.shellBtn }} />
                <View style={{ width: 30, height: 8, borderRadius: 4, backgroundColor: C.shellBtn }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, transform: [{ rotate: '-16deg' }] }}>
              {['B', 'A'].map((l) => (
                <View key={l} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.shellBtn,
                  borderWidth: 3, borderColor: C.shellI, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: PS, fontSize: 10, color: '#ffd0d3' }}>{l}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
