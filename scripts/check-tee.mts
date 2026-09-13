/**
 * Is the private rollup really running inside a TEE? Asked live, not assumed.
 *
 * /proof used to answer "gate attested: YES" from a flag in the cluster config,
 * which is a sentence about how this app was configured rather than about the
 * machine on the other end. This asks the machine. It sends a fresh random
 * 64-byte challenge to the rollup's `/quote` endpoint, gets back an Intel TDX
 * quote, checks that quote against Intel's collateral, and checks that the
 * quote's report data is the challenge — so the answer cannot be a recording.
 *
 * It runs here rather than on the page because the quote verifier needs Node's
 * crypto, which a browser bundle does not have; the page points at this script
 * instead of printing a YES it cannot back.
 *
 *   npx tsx scripts/check-tee.mts                       # MagicBlock's devnet TEE
 *   npx tsx scripts/check-tee.mts <rollup-url>          # any other
 *
 * Needs the network. Exits non-zero if the quote does not verify.
 */
import { verifyTeeRpcIntegrity } from '@magicblock-labs/ephemeral-rollups-sdk';

const url = process.argv[2] ?? 'https://devnet-tee.magicblock.app';

const started = Date.now();
try {
  await verifyTeeRpcIntegrity(url);
} catch (e) {
  console.error(`tee FAIL — ${url}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
console.log(
  `tee ok — ${url} answered a fresh 64-byte challenge with an Intel TDX quote that verified against Intel's collateral, report data matching the challenge (${Date.now() - started}ms)`
);
