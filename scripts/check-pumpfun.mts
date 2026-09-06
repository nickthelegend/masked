/** Proves the pump.fun integration is a real API call with real data. */
import assert from 'node:assert/strict';
import { fetchTopMarkets, fetchMarket, priceFromReserves } from '../src/chain/pumpfun';

async function main() {
  console.log('fetching live markets from pump.fun…');
  const markets = await fetchTopMarkets(8);

  assert.ok(markets.length > 0, 'must return markets');
  console.log(`  ${markets.length} markets returned`);

  for (const m of markets.slice(0, 5)) {
    assert.match(m.mint, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, `${m.symbol}: mint must be base58`);
    assert.ok(m.symbol.length > 0, 'symbol required');
    assert.ok(m.priceSol > 0, `${m.symbol}: price must be positive`);
    console.log(
      `  ${m.symbol.padEnd(10)} ${m.mint.slice(0, 6)}…  ${m.priceSol.toExponential(3)} SOL  ` +
      `$${m.usdMarketCap.toLocaleString('en-US', { maximumFractionDigits: 0 }).padStart(14)}  ` +
      `${m.imageUri ? 'logo' : 'no logo'}`
    );
  }

  const withLogo = markets.filter((m) => m.imageUri).length;
  assert.ok(withLogo > 0, 'at least some markets must carry a real logo URL');
  console.log(`  ${withLogo}/${markets.length} carry a real logo URL`);

  // Bonding-curve maths, checked against a known pump.fun launch state.
  const p = priceFromReserves(30_000_000_000, 1_073_000_000_000_000);
  assert.ok(p > 0 && p < 1, `launch price should be a small fraction of a SOL, got ${p}`);
  console.log(`  launch-state curve price: ${p.toExponential(3)} SOL`);

  // A single-market lookup must agree with the list.
  const one = await fetchMarket(markets[0].mint);
  assert.ok(one, 'single-market lookup must resolve');
  assert.equal(one!.mint, markets[0].mint);
  console.log(`  single lookup agrees: ${one!.symbol}`);

  // A logo URL must actually serve an image.
  const logo = markets.find((m) => m.imageUri)!;
  const res = await fetch(logo.imageUri!, { method: 'GET', signal: AbortSignal.timeout(15_000) });
  assert.ok(res.ok, `logo must load, got ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  assert.ok(type.startsWith('image/'), `logo must be an image, got ${type}`);
  console.log(`  ${logo.symbol} logo loads: ${res.status} ${type}`);

  console.log('\npump.fun OK — live API, real mints, real prices, real logos');
}

main().catch((e) => { console.error(e); process.exit(1); });
