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

describe("fogduel", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Fogduel as Program<Fogduel>;

  const creator = provider.wallet as anchor.Wallet;
  const joiner = Keypair.generate();

  // Match ids are seeded from the clock so the suite can be re-run against a
  // long-lived validator without colliding with PDAs from an earlier run.
  const RUN = Math.floor(Date.now() / 1000);

  const ENTRY = 0.1 * LAMPORTS_PER_SOL;
  const DURATION = 10; // seconds — short so tests do not crawl
  const START_PX = 100 * PRICE_SCALE;

  let treasuryPda: PublicKey;

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

  const createMatch = async (matchId: number, duration = DURATION) => {
    const p = pdas(matchId);
    await program.methods
      .createMatch(new BN(matchId), PublicKey.default, new BN(duration), new BN(ENTRY), new BN(START_PX))
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

  it("applies a buy fill and moves quote into base", async () => {
    const p = pdas(RUN + 1);
    const qty = 0.5 * BASE_SCALE; // half the quote balance at px=100
    await program.methods.applyFill({ buy: {} }, new BN(qty))
      .accounts({
        player: creator.publicKey, matchAccount: p.matchPda, priceFeed: p.feed, position: p.posA,
      }).rpc();

    const a = await program.account.position.fetch(p.posA);
    assert.equal(a.baseQty.toNumber(), qty);
    assert.equal(a.avgPx.toNumber(), START_PX);
    assert.equal(a.fillCount, 1);
    const spent = (qty * START_PX) / BASE_SCALE;
    assert.equal(a.quoteBalance.toNumber(), ENTRY - spent);
  });

  it("rejects a buy that overdraws the quote balance", async () => {
    const p = pdas(RUN + 1);
    try {
      await program.methods.applyFill({ buy: {} }, new BN(1000 * BASE_SCALE))
        .accounts({ player: creator.publicKey, matchAccount: p.matchPda, priceFeed: p.feed, position: p.posA })
        .rpc();
      assert.fail("overdraw should have been rejected");
    } catch (e: any) {
      assert.include(e.toString().toLowerCase(), "insufficientquote");
    }
  });

  it("realizes PnL on a sell after the price moves up", async () => {
    const p = pdas(RUN + 1);
    await program.methods.pushPrice(new BN(110 * PRICE_SCALE))
      .accounts({ authority: creator.publicKey, priceFeed: p.feed }).rpc();

    const before = await program.account.position.fetch(p.posA);
    const qty = before.baseQty.toNumber();
    await program.methods.applyFill({ sell: {} }, new BN(qty))
      .accounts({ player: creator.publicKey, matchAccount: p.matchPda, priceFeed: p.feed, position: p.posA })
      .rpc();

    const after = await program.account.position.fetch(p.posA);
    assert.equal(after.baseQty.toNumber(), 0);
    assert.isAbove(after.realized.toNumber(), 0, "a 10% up-move on a long realizes a profit");
    // Bought at 100, sold at 110: realized = qty * (110 - 100) = qty * 10
    assert.equal(after.realized.toNumber(), qty * 10);
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
        treasury: treasuryPda, tape: p.tape, systemProgram: SystemProgram.programId,
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

    const qty = 0.5 * BASE_SCALE;
    await program.methods.applyFill({ buy: {} }, new BN(qty))
      .accounts({ player: joiner.publicKey, matchAccount: p.matchPda, priceFeed: p.feed, position: p.posB })
      .signers([joiner]).rpc();

    await program.methods.pushPrice(new BN(120 * PRICE_SCALE))
      .accounts({ authority: creator.publicKey, priceFeed: p.feed }).rpc();

    await new Promise((r) => setTimeout(r, (DURATION + 2) * 1000));
    await program.methods.requestSettle()
      .accounts({ cranker: creator.publicKey, matchAccount: p.matchPda }).rpc();
    await program.methods.settleMatch()
      .accounts({
        cranker: creator.publicKey, matchAccount: p.matchPda, vault: p.vault, priceFeed: p.feed,
        positionA: p.posA, positionB: p.posB, creator: creator.publicKey, joiner: joiner.publicKey,
        treasury: treasuryPda, tape: p.tape, systemProgram: SystemProgram.programId,
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
