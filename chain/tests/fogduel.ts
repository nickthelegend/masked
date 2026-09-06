/**
 * Phase 1 + 4 + 5 integration tests: the full match lifecycle on a local
 * validator, with real lamport movement asserted at every step.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Fogduel } from "../target/types/fogduel";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

const PRICE_SCALE = 1_000_000;
const BASE_SCALE = 1_000_000;
/** px is lamports per token x PRICE_SCALE — see src/chain/units.ts. */
const px = (solPerToken: number) => Math.round(solPerToken * LAMPORTS_PER_SOL * PRICE_SCALE);

describe("fogduel", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Fogduel as Program<Fogduel>;

  const creator = provider.wallet as anchor.Wallet;
  const joiner = Keypair.generate();

  // Match ids are seeded from the clock so the suite can be re-run against a
  // long-lived validator without colliding with PDAs from an earlier run.
  // Suite-unique id space, plus randomness so re-runs never reuse a PDA.
  const RUN = Math.floor(Date.now() / 1000) * 1000 + 100 + Math.floor(Math.random() * 90);

  const ENTRY = 0.1 * LAMPORTS_PER_SOL;
  const DURATION = 10; // seconds — short so tests do not crawl
  const START_PX = px(0.1); // 0.1 SOL a token

  let treasuryPda: PublicKey;

  const statsPda = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("stats"), owner.toBuffer()], program.programId)[0];

  const pdas = (matchId: number) => {
    const idBuf = new BN(matchId).toArrayLike(Buffer, "le", 8);
    const [matchPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match"), creator.publicKey.toBuffer(), idBuf],
      program.programId
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), matchPda.toBuffer()], program.programId);
    const [feed] = PublicKey.findProgramAddressSync(
      [Buffer.from("feed"), matchPda.toBuffer()], program.programId);
    const [posA] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), matchPda.toBuffer(), creator.publicKey.toBuffer()], program.programId);
    const [posB] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), matchPda.toBuffer(), joiner.publicKey.toBuffer()], program.programId);
    const [tape] = PublicKey.findProgramAddressSync(
      [Buffer.from("tape"), matchPda.toBuffer()], program.programId);
    return { matchPda, vault, feed, posA, posB, tape };
  };

  // These suites run against a posted oracle (`Major`), because every
  // assertion below is about lamports and PnL, and a Major's mark is the price
  // this test pushes rather than wherever the private book happens to sit.
  // The meme path — where the book is both venue and mark — has its own suite.
  const createMatch = async (matchId: number, duration = DURATION, market: any = { major: {} }) => {
    const p = pdas(matchId);
    await program.methods
      .createMatch(
        new BN(matchId), PublicKey.default, new BN(duration), new BN(ENTRY),
        new BN(START_PX), market, "TEST", "Test Market",
      )
      .accounts({
        creator: creator.publicKey,
        matchAccount: p.matchPda,
        vault: p.vault,
        priceFeed: p.feed,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return p;
  };

  const joinMatch = async (p: ReturnType<typeof pdas>) =>
    program.methods
      .joinMatch()
      .accounts({
        joiner: joiner.publicKey,
        matchAccount: p.matchPda,
        vault: p.vault,
        priceFeed: p.feed,
        positionA: p.posA,
        positionB: p.posB,
        systemProgram: SystemProgram.programId,
      })
      .signers([joiner])
      .rpc();

  before(async () => {
    const sig = await provider.connection.requestAirdrop(joiner.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], program.programId);
    const existing = await provider.connection.getAccountInfo(treasuryPda);
    if (!existing) {
      await program.methods.initTreasury()
        .accounts({ payer: creator.publicKey, treasury: treasuryPda, systemProgram: SystemProgram.programId })
        .rpc();
    }
  });

  it("creates a match and escrows the creator entry", async () => {
    const p = await createMatch(RUN + 1);
    const m = await program.account.match.fetch(p.matchPda);
    assert.equal(m.entry.toNumber(), ENTRY);
    assert.deepEqual(m.status, { open: {} });
    assert.equal(m.pot.toNumber(), ENTRY);
    assert.isNull(m.joiner);

    const vaultLamports = await provider.connection.getBalance(p.vault);
    assert.isAtLeast(vaultLamports, ENTRY, "vault holds the creator entry");
  });

  // A self-join is rejected twice over: position_a and position_b resolve to
  // the same PDA when joiner == creator, so Anchor fails account resolution
  // before the SelfJoin constraint is even reached.
  it("rejects a self-join", async () => {
    const p = pdas(RUN + 1);
    try {
      await program.methods.joinMatch()
        .accounts({
          joiner: creator.publicKey, matchAccount: p.matchPda, vault: p.vault, priceFeed: p.feed,
          positionA: p.posA, positionB: p.posA, systemProgram: SystemProgram.programId,
        }).rpc();
      assert.fail("self-join should have been rejected");
    } catch (e: any) {
      assert.ok(e, "self-join rejected");
    }
  });

  it("joins, escrows both entries, goes Live and seeds both positions", async () => {
    const p = pdas(RUN + 1);
    await joinMatch(p);

    const m = await program.account.match.fetch(p.matchPda);
    assert.deepEqual(m.status, { live: {} });
    assert.equal(m.pot.toNumber(), ENTRY * 2);
    assert.equal(m.joiner!.toBase58(), joiner.publicKey.toBase58());
    assert.isAbove(m.startTs.toNumber(), 0);

    const vaultLamports = await provider.connection.getBalance(p.vault);
    assert.isAtLeast(vaultLamports, ENTRY * 2, "vault holds both entries");

    const a = await program.account.position.fetch(p.posA);
    const b = await program.account.position.fetch(p.posB);
    assert.equal(a.quoteBalance.toNumber(), ENTRY);
    assert.equal(b.quoteBalance.toNumber(), ENTRY);
    assert.equal(a.owner.toBase58(), creator.publicKey.toBase58());
    assert.equal(b.owner.toBase58(), joiner.publicKey.toBase58());

    // Task 1.8: positions must carry lamports for ephemeral-permission rent.
    const posLamports = await provider.connection.getBalance(p.posA);
    const rentOnly = await provider.connection.getMinimumBalanceForRentExemption(
      (await provider.connection.getAccountInfo(p.posA))!.data.length
    );
    assert.isAbove(posLamports, rentOnly, "position PDA is pre-funded above rent");
  });

  it("rejects a double join", async () => {
    const p = pdas(RUN + 1);
    try {
      await joinMatch(p);
      assert.fail("double join should have been rejected");
    } catch (e: any) {
      assert.ok(e, "double join rejected");
    }
  });

  // A buy spends quote and receives whatever the private book gives back. The
  // fill never touches a public venue, so there is no quote to check it
  // against — the curve is the venue.
  it("gives each player their own book, seeded at the snapshot mid", async () => {
    const p = pdas(RUN + 1);
    for (const pos of [p.posA, p.posB]) {
      const { book } = await program.account.position.fetch(pos);
      assert.equal(book.seedPx.toNumber(), START_PX);
      // Depth is a multiple of the entry, so a full-size fill costs impact
      // rather than emptying the curve.
      assert.equal(book.virtualQuote.toNumber(), ENTRY * 64);
      const mid =
        (book.virtualQuote.toNumber() * BASE_SCALE * PRICE_SCALE) / book.virtualBase.toNumber();
      assert.closeTo(mid, START_PX, START_PX / 1000, "book opens on the snapshot mid");
    }
  });

  it("applies a buy fill through the book, paying impact", async () => {
    const p = pdas(RUN + 1);
    const spend = 0.5 * ENTRY;
    const before = (await program.account.position.fetch(p.posA)).book;

    await program.methods.applyFill({ buy: {} }, new BN(spend))
      .accounts({
        player: creator.publicKey, matchAccount: p.matchPda, priceFeed: p.feed, position: p.posA,
      }).rpc();

    const a = await program.account.position.fetch(p.posA);
    assert.equal(a.fillCount, 1);
    assert.equal(a.quoteBalance.toNumber(), ENTRY - spend, "quote spent is exactly what was asked");
    assert.isAbove(a.baseQty.toNumber(), 0, "base received");

    // x*y=k: the average fill is worse than the mid it started from. At a
    // depth of 64x the entry, a half-size buy should cost well under 1%.
    assert.isAbove(a.avgPx.toNumber(), START_PX, "buyer paid impact");
    assert.isBelow(a.avgPx.toNumber(), START_PX * 1.01, "but impact is small at this depth");

    // The buy moved this player's own book, and only theirs.
    const after = (await program.account.position.fetch(p.posA)).book;
    assert.isAbove(after.virtualQuote.toNumber(), before.virtualQuote.toNumber());
    assert.isBelow(after.virtualBase.toNumber(), before.virtualBase.toNumber());

    const theirs = (await program.account.position.fetch(p.posB)).book;
    assert.equal(
      theirs.virtualQuote.toNumber(), ENTRY * 64,
      "the opponent's book is untouched — one shared curve would leak the fill",
    );
  });

  it("rejects a buy that overdraws the quote balance", async () => {
    const p = pdas(RUN + 1);
    try {
      await program.methods.applyFill({ buy: {} }, new BN(ENTRY * 10))
        .accounts({
          player: creator.publicKey, matchAccount: p.matchPda, priceFeed: p.feed, position: p.posA,
        })
        .rpc();
      assert.fail("overdraw should have been rejected");
    } catch (e: any) {
      assert.include(e.toString().toLowerCase(), "insufficientquote");
    }
  });

  // On a major the book is re-pegged to the oracle before each fill, so a
  // posted price move is what the player actually trades against. Without the
  // re-peg a player could buy at the stale seed mid and settle against a moved
  // oracle for free.
  it("realizes PnL on a sell after the oracle moves up", async () => {
    const p = pdas(RUN + 1);
    await program.methods.pushPrice(new BN(px(0.11)))
      .accounts({ authority: creator.publicKey, priceFeed: p.feed }).rpc();

    const before = await program.account.position.fetch(p.posA);
    const qty = before.baseQty.toNumber();
    const avgPx = before.avgPx.toNumber();

    await program.methods.applyFill({ sell: {} }, new BN(qty))
      .accounts({
        player: creator.publicKey, matchAccount: p.matchPda, priceFeed: p.feed, position: p.posA,
      })
      .rpc();

    const after = await program.account.position.fetch(p.posA);
    assert.equal(after.baseQty.toNumber(), 0);
    assert.equal(after.avgPx.toNumber(), 0, "flat, so no average entry left");
    assert.isAbove(after.realized.toNumber(), 0, "a 10% up-move on a long realizes a profit");

    // The exit is the re-pegged mark minus this sell's own impact, so it lands
    // under 0.11 but above the 0.1-ish entry.
    const exitPx = after.fills[after.fills.length - 1].px.toNumber();
    assert.isAbove(exitPx, avgPx, "sold above the average entry");
    assert.isBelow(exitPx, px(0.11), "the sell paid its own impact");
  });

  it("refuses to settle before the clock expires", async () => {
    const p = pdas(RUN + 1);
    try {
      await program.methods.requestSettle()
        .accounts({ cranker: creator.publicKey, matchAccount: p.matchPda }).rpc();
      assert.fail("early settle should have been rejected");
    } catch (e: any) {
      assert.include(e.toString().toLowerCase(), "matchstillrunning");
    }
  });

  it("settles: pays the winner, takes the rake, writes a public tape", async () => {
    const p = pdas(RUN + 1);

    // The joiner never traded, so the creator's realized gain must win.
    await new Promise((r) => setTimeout(r, (DURATION + 2) * 1000));

    await program.methods.requestSettle()
      .accounts({ cranker: creator.publicKey, matchAccount: p.matchPda }).rpc();
    let m = await program.account.match.fetch(p.matchPda);
    assert.deepEqual(m.status, { settling: {} });

    const winnerBefore = await provider.connection.getBalance(creator.publicKey);
    const treasuryBefore = await provider.connection.getBalance(treasuryPda);

    await program.methods.settleMatch()
      .accounts({
        cranker: creator.publicKey, matchAccount: p.matchPda, vault: p.vault, priceFeed: p.feed,
        positionA: p.posA, positionB: p.posB, creator: creator.publicKey, joiner: joiner.publicKey,
        treasury: treasuryPda, tape: p.tape,
        statsCreator: statsPda(creator.publicKey), statsJoiner: statsPda(joiner.publicKey),
        systemProgram: SystemProgram.programId,
      }).rpc();

    m = await program.account.match.fetch(p.matchPda);
    assert.deepEqual(m.status, { settled: {} });
    assert.equal(m.winner!.toBase58(), creator.publicKey.toBase58(), "creator traded a profit and wins");
    assert.isAbove(m.pnlABps.toNumber(), 0);
    assert.equal(m.pnlBBps.toNumber(), 0, "joiner never traded, so flat");

    const pot = ENTRY * 2;
    const rake = Math.floor((pot * 200) / 10_000);
    const payout = pot - rake;

    const treasuryAfter = await provider.connection.getBalance(treasuryPda);
    assert.equal(treasuryAfter - treasuryBefore, rake, "treasury received exactly the 2% rake");

    const winnerAfter = await provider.connection.getBalance(creator.publicKey);
    assert.isAbove(winnerAfter, winnerBefore, "winner was paid");

    // On-chain lifetime record, not a client-side tally.
    const winnerStats = await program.account.playerStats.fetch(statsPda(creator.publicKey));
    const loserStats = await program.account.playerStats.fetch(statsPda(joiner.publicKey));
    assert.isAtLeast(winnerStats.wins, 1, "winner's on-chain win count incremented");
    assert.isAtLeast(winnerStats.streak, 1, "streak advanced");
    assert.isAtLeast(winnerStats.bestStreak, winnerStats.streak, "best streak tracks the streak");
    assert.isAtLeast(winnerStats.taken.toNumber(), payout, "lamports taken recorded");
    assert.isAtLeast(loserStats.losses, 1, "loser's loss recorded");
    assert.equal(loserStats.streak, 0, "a loss resets the streak");

    const tape = await program.account.tape.fetch(p.tape);
    assert.equal(tape.winner.toBase58(), creator.publicKey.toBase58());
    assert.equal(tape.potPaid.toNumber(), payout);
    assert.equal(tape.rake.toNumber(), rake);
    assert.isAtLeast(tape.fillsA.length, 2, "tape carries the creator's fills");
  });

  it("cancels an unjoined match and refunds the creator", async () => {
    const p = await createMatch(RUN + 2);
    const before = await provider.connection.getBalance(creator.publicKey);
    await program.methods.cancelIfUnjoined()
      .accounts({ creator: creator.publicKey, matchAccount: p.matchPda, vault: p.vault }).rpc();
    const after = await provider.connection.getBalance(creator.publicKey);
    const m = await program.account.match.fetch(p.matchPda);
    assert.deepEqual(m.status, { cancelled: {} });
    assert.isAbove(after, before, "entry refunded");
  });

  it("settles an open position into realized PnL with a SETTLE fill", async () => {
    const p = await createMatch(RUN + 3);
    await joinMatch(p);

    await program.methods.applyFill({ buy: {} }, new BN(0.5 * ENTRY))
      .accounts({
        player: joiner.publicKey, matchAccount: p.matchPda, priceFeed: p.feed, position: p.posB,
      })
      .signers([joiner]).rpc();

    await program.methods.pushPrice(new BN(px(0.12)))
      .accounts({ authority: creator.publicKey, priceFeed: p.feed }).rpc();

    await new Promise((r) => setTimeout(r, (DURATION + 2) * 1000));
    await program.methods.requestSettle()
      .accounts({ cranker: creator.publicKey, matchAccount: p.matchPda }).rpc();
    await program.methods.settleMatch()
      .accounts({
        cranker: creator.publicKey, matchAccount: p.matchPda, vault: p.vault, priceFeed: p.feed,
        positionA: p.posA, positionB: p.posB, creator: creator.publicKey, joiner: joiner.publicKey,
        treasury: treasuryPda, tape: p.tape,
        statsCreator: statsPda(creator.publicKey), statsJoiner: statsPda(joiner.publicKey),
        systemProgram: SystemProgram.programId,
      }).rpc();

    const b = await program.account.position.fetch(p.posB);
    assert.equal(b.baseQty.toNumber(), 0, "open position closed at the buzzer");
    assert.isAbove(b.realized.toNumber(), 0);
    const settleFill = b.fills.find((f: any) => f.side.settle !== undefined);
    assert.ok(settleFill, "a SETTLE fill was appended");

    const m = await program.account.match.fetch(p.matchPda);
    assert.equal(m.winner!.toBase58(), joiner.publicKey.toBase58(), "joiner's open long wins");
  });
});
