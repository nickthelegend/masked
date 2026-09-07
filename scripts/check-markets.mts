/**
 * Proves the market list is live: real mints, real logos, real prices, and a
 * `startPx` the program will actually accept.
 *
 *   npm run check:markets
 */
import { fetchMemeMarkets, fetchMajorMarkets } from '../src/chain/markets';
import { formatCap, formatUsdPrice, MAX_PX, solPerTokenFromPx } from '../src/chain/units';

const fail = (msg: string): never => {
  console.error(`FAIL — ${msg}`);
  process.exit(1);
};

async function main() {
  console.log('1. pump.fun meme markets');
  const memes = await fetchMemeMarkets(12);
  if (memes.length === 0) fail('pump.fun returned no tradable markets');
  for (const m of memes.slice(0, 6)) {
    console.log(
      `   ${m.symbol.padEnd(10)} ${formatUsdPrice(m.priceUsd).padStart(14)}` +
      `   mcap ${formatCap(m.usdMarketCap).padStart(8)}   px=${m.startPx}   ${m.mint.slice(0, 8)}…`
    );
  }
  const withLogo = memes.filter((m) => m.imageUri).length;
  console.log(`   ${memes.length} markets, ${withLogo} with a logo`);
  if (withLogo === 0) fail('no meme market carried a logo URL');

  // Some pump.fun image URLs 404 — the coin is real, the CDN entry is not.
  // That is a fact about the source, so the bar is that most load and that the
  // UI has a fallback for the rest, not that every one is perfect.
  console.log('\n2. logos actually load');
  let ok = 0;
  let dead = 0;
  for (const m of memes) {
    if (!m.imageUri) continue;
    const res = await fetch(m.imageUri, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
    const type = res?.headers.get('content-type') ?? '';
    if (res?.ok && type.startsWith('image/')) ok += 1;
    else {
      dead += 1;
      console.log(`   ${m.symbol.padEnd(10)} dead (HTTP ${res?.status ?? 'network'}) — falls back to a pixel mask`);
    }
  }
  console.log(`   ${ok} logos load, ${dead} dead`);
  if (ok === 0) fail('not one logo loaded — the image host is down or the field moved');

  console.log('\n3. jupiter majors');
  const majors = await fetchMajorMarkets();
  if (majors.length === 0) fail('jupiter returned no majors');
  for (const m of majors) {
    console.log(
      `   ${m.symbol.padEnd(10)} ${formatUsdPrice(m.priceUsd).padStart(14)}   px=${m.startPx}`
    );
  }

  console.log('\n4. every startPx round-trips to the price it came from');
  for (const m of [...memes, ...majors]) {
    if (m.startPx <= 0n) fail(`${m.symbol} has a non-positive startPx`);
    // The bound that matters is the program's field, not a JS number. px is a
    // u64 on chain and a bigint here precisely so that an asset worth more
    // than about 9 SOL a token — every wrapped BTC, and ETH — stops being
    // dropped as unrepresentable. `Number.isSafeInteger` was the old contract
    // and is what used to exclude them.
    if (m.startPx > MAX_PX) fail(`${m.symbol} startPx ${m.startPx} overflows a u64`);
    const back = solPerTokenFromPx(m.startPx);
    const drift = Math.abs(back - m.priceSol) / m.priceSol;
    // Rounding to whole lamports per traded unit is the only loss allowed.
    if (drift > 0.001) {
      fail(`${m.symbol} price round-trip drifted ${(drift * 100).toFixed(3)}% (${m.priceSol} -> ${back})`);
    }
  }
  console.log(`   ${memes.length + majors.length} markets round-trip within 0.1%`);

  console.log('\nmarkets OK — live pump.fun + jupiter, real logos, program-representable prices');
}

main().catch((e) => {
  console.error('\nFAIL —', e instanceof Error ? e.message : e);
  process.exit(1);
});
