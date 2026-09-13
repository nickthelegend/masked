/**
 * The rollup running the round by itself, proved against a real Ephemeral
 * Rollup and its task scheduler.
 *
 * `schedule_round_cranks` hands a sealed round's upkeep to the rollup's own
 * crank: a keeper that liquidates a blown-up position, and a buzzer that
 * commits both positions and the round status back to Solana. Nothing in the
 * first suite calls `liquidate` or commits anything — if the tape says
 * liquidated and the accounts come home, the rollup did it.
 *
 * Both suites also release the access-control lists sealing put on the rollup.
 * That is each owner's job, not the program's: the permission program pays for
 * the commit from whoever signs as the list's authority, and a delegated PDA
 * cannot pay without a fee vault the permission program does not pass. So the
 * wallet the list names signs, and the position goes read-only — which is what
 * lets the release happen before or after the position's own commit.
 *
 * Requires the MagicBlock stack, as scripts/localnet.sh starts it:
 *   base L1  http://127.0.0.1:8999   (mb-test-validator, has DELeGG + ACLseo, plus
 *                                     the committor ComtrB2K… a busy commit needs)
 *   ER       http://127.0.0.1:7799   (ephemeral-validator, with its task scheduler)
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Fogduel } from "../target/types/fogduel";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Connection,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  permissionPdaFromAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { assert } from "chai";

const PRICE_SCALE = 1_000_000;
/** Base units times price, per lamport of quote. See units.ts. */
const VALUE_DIV = 1_000_000_000_000;
const ER_URL = "http://127.0.0.1:7799";
/** Local ER validator identity, per the MagicBlock docs. */
const LOCAL_ER_VALIDATOR = new PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev");
const PERMISSION_PROGRAM = new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");
const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT = new PublicKey("MagicContext1111111111111111111111111111111");
/** The permission program's CommitAndUndelegatePermission discriminator. */
const COMMIT_AND_UNDELEGATE_PERMISSION = 5n;

const ENTRY = 0.1 * LAMPORTS_PER_SOL;
const START_PX = 100 * PRICE_SCALE;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(what: string, timeoutMs: number, probe: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe().catch(() => null);
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
    await sleep(1000);
  }
}

describe("fogduel · rollup cranks and ACL release", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Fogduel as Program<Fogduel>;
  const creator = provider.wallet as anchor.Wallet;
  const creatorKp = creator.payer;

  const erConnection = new Connection(ER_URL, "confirmed");
  const erProvider = new anchor.AnchorProvider(erConnection, creator, { commitment: "confirmed" });
  const erProgram = new Program<Fogduel>(program.idl as Fogduel, erProvider);

  const programId = program.programId.toBase58();
  const permissionProgramId = PERMISSION_PROGRAM.toBase58();

  let treasuryPda: PublicKey;
  const statsPda = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("stats"), owner.toBuffer()], program.programId)[0];

  function pdas(matchId: number, joiner: PublicKey) {
    const idBuf = new BN(matchId).toArrayLike(Buffer, "le", 8);
    const find = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];
    const matchPda = find([Buffer.from("match"), creator.publicKey.toBuffer(), idBuf]);
    return {
      matchPda,
      vault: find([Buffer.from("vault"), matchPda.toBuffer()]),
      feed: find([Buffer.from("feed"), matchPda.toBuffer(), creator.publicKey.toBuffer()]),
      feedB: find([Buffer.from("feed"), matchPda.toBuffer(), joiner.toBuffer()]),
      status: find([Buffer.from("status"), matchPda.toBuffer()]),
      posA: find([Buffer.from("position"), matchPda.toBuffer(), creator.publicKey.toBuffer()]),
      posB: find([Buffer.from("position"), matchPda.toBuffer(), joiner.toBuffer()]),
      tape: find([Buffer.from("tape"), matchPda.toBuffer()]),
    };
  }
  type Round = ReturnType<typeof pdas> & { joiner: Keypair };

  /** Send on the rollup and wait for it by polling — its websocket confirmations can take half a minute. */
  async function sendOnEr(tx: Transaction, signer: Keypair): Promise<string[]> {
    tx.feePayer = signer.publicKey;
    tx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
    tx.sign(signer);
    const sig = await erConnection.sendRawTransaction(tx.serialize());
    await until(`rollup confirmation of ${sig.slice(0, 12)}`, 30_000, async () => {
      const [s] = (await erConnection.getSignatureStatuses([sig])).value;
      return s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") ? s : null;
    });
    const landed = await erConnection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const logs = landed?.meta?.logMessages ?? [];
    assert.isNull(landed?.meta?.err ?? null, `rollup transaction failed:\n${logs.join("\n")}`);
    return logs;
  }

  /** The owner releases their own ACL from the rollup, with the position passed read-only. */
  async function releaseAcl(owner: Keypair, position: PublicKey) {
    const data = Buffer.alloc(8);
    data.writeBigUInt64LE(COMMIT_AND_UNDELEGATE_PERMISSION);
    const ix = new TransactionInstruction({
      programId: PERMISSION_PROGRAM,
      keys: [
        { pubkey: owner.publicKey, isSigner: true, isWritable: false },
        { pubkey: position, isSigner: false, isWritable: false },
        { pubkey: permissionPdaFromAccount(position), isSigner: false, isWritable: true },
        { pubkey: MAGIC_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: MAGIC_CONTEXT, isSigner: false, isWritable: true },
      ],
      data,
    });
    const logs = await sendOnEr(new Transaction().add(ix), owner);
    assert.ok(
      logs.some((l) => l.includes(`Scheduling undelegation for accounts: ${permissionPdaFromAccount(position).toBase58()}`)),
      "the rollup scheduled the ACL's undelegation"
    );
  }

  /** Open, join and seal a round exactly as the app does: ACL, delegate the ACL, delegate the position, then the status. */
  async function openSealedRound(matchId: number, duration: number): Promise<Round> {
    const joiner = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(joiner.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
    const p = { ...pdas(matchId, joiner.publicKey), joiner };

    await program.methods
      .createMatch(new BN(matchId), PublicKey.default, new BN(duration), new BN(ENTRY), new BN(START_PX), { meme: {} }, "CRANK", "Rollup Crank Check")
      .accounts({ creator: creator.publicKey, matchAccount: p.matchPda, vault: p.vault, priceFeed: p.feed, roundStatus: p.status, systemProgram: SystemProgram.programId })
      .rpc();
    await program.methods
      .joinMatch(PublicKey.default, new BN(START_PX), { meme: {} }, "CRANK", "Rollup Crank Check")
      .accounts({ joiner: joiner.publicKey, matchAccount: p.matchPda, vault: p.vault, priceFeed: p.feed, priceFeedB: p.feedB, positionA: p.posA, positionB: p.posB, systemProgram: SystemProgram.programId })
      .signers([joiner])
      .rpc();

    const sides: [PublicKey, PublicKey][] = [
      [creator.publicKey, p.posA],
      [joiner.publicKey, p.posB],
    ];
    for (const [owner, position] of sides) {
      const permission = permissionPdaFromAccount(position);
      await program.methods
        .createPositionPermission(owner)
        .accounts({ payer: creator.publicKey, matchAccount: p.matchPda, position, permission, permissionProgram: PERMISSION_PROGRAM, systemProgram: SystemProgram.programId })
        .rpc();
      await program.methods
        .delegatePositionPermission(owner)
        .accounts({
          payer: creator.publicKey,
          matchAccount: p.matchPda,
          position,
          permission,
          delegationBuffer: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(permission, PERMISSION_PROGRAM),
          delegationRecord: delegationRecordPdaFromDelegatedAccount(permission),
          delegationMetadata: delegationMetadataPdaFromDelegatedAccount(permission),
          validator: LOCAL_ER_VALIDATOR,
          permissionProgram: PERMISSION_PROGRAM,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
    for (const [owner] of sides) {
      await program.methods
        .delegatePositionToEr(owner, LOCAL_ER_VALIDATOR, 1_000)
        .accounts({ payer: creator.publicKey, matchAccount: p.matchPda })
        .rpc();
    }
    await program.methods
      .delegateStatusToEr(LOCAL_ER_VALIDATOR, 0)
      .accounts({ payer: creator.publicKey, matchAccount: p.matchPda, roundStatus: p.status })
      .rpc();
    return p;
  }

  async function buzzerMs(p: Round): Promise<number> {
    const m = await program.account.match.fetch(p.matchPda);
    return (m.startTs.toNumber() + m.duration.toNumber()) * 1000;
  }

  /** L1 owners of everything a round delegates: both positions, the status, both ACLs. */
  async function l1Owners(p: Round): Promise<(string | undefined)[]> {
    const keys = [p.posA, p.posB, p.status, permissionPdaFromAccount(p.posA), permissionPdaFromAccount(p.posB)];
    return Promise.all(keys.map(async (k) => (await provider.connection.getAccountInfo(k))?.owner.toBase58()));
  }
  const roundHome = (o: (string | undefined)[]) => o[0] === programId && o[1] === programId && o[2] === programId;
  const aclsHome = (o: (string | undefined)[]) => o[3] === permissionProgramId && o[4] === permissionProgramId;

  async function settle(p: Round) {
    // The base layer's clock can trail the wall clock by a second or two.
    await until("the base layer's clock to pass the buzzer", 30_000, async () => {
      try {
        await program.methods.requestSettle().accounts({ cranker: creator.publicKey, matchAccount: p.matchPda }).rpc();
        return true;
      } catch (e) {
        if (String(e).includes("MatchStillRunning")) return null;
        throw e;
      }
    });
    await program.methods
      .settleMatch()
      .accounts({
        cranker: creator.publicKey, matchAccount: p.matchPda, vault: p.vault,
        priceFeed: p.feed, priceFeedB: p.feedB, roundStatus: p.status,
        positionA: p.posA, positionB: p.posB, creator: creator.publicKey, joiner: p.joiner.publicKey,
        treasury: treasuryPda, tape: p.tape,
        statsCreator: statsPda(creator.publicKey), statsJoiner: statsPda(p.joiner.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  before(async () => {
    [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], program.programId);
    if (!(await provider.connection.getAccountInfo(treasuryPda))) {
      await program.methods.initTreasury()
        .accounts({ payer: creator.publicKey, treasury: treasuryPda, systemProgram: SystemProgram.programId }).rpc();
    }

    // Straight after `anchor test` redeploys, the rollup can still be running
    // its cached copy of the program, which does not know the crank
    // instructions yet — the first run of this file failed on exactly that.
    // Until the rollup has the new build, simulating one of them fails before
    // Anchor can even name it; afterwards it is named, and refused, correctly,
    // for a match that is not live.
    const anyMatch = (await program.account.match.all())[0]?.publicKey;
    if (anyMatch) {
      await until("the rollup to load the redeployed program", 90_000, async () => {
        const ix = await erProgram.methods.scheduleRoundCranks().accounts({ payer: creator.publicKey, matchAccount: anyMatch }).instruction();
        const tx = new Transaction().add(ix);
        tx.feePayer = creator.publicKey;
        tx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
        tx.sign(creatorKp);
        const res = await erConnection.simulateTransaction(tx);
        return (res.value.logs ?? []).some((l) => l.includes("Instruction: ScheduleRoundCranks")) ? true : null;
      });
    }
  });

  describe("the rollup's crank runs the round", () => {
    // Long enough to seal, short, walk the mark past the short's equity at the
    // program's 5%-a-second limit, and let the keeper see it before the buzzer.
    const DURATION = 75;
    const RUN = Math.floor(Date.now() / 1000) * 1000 + 500 + Math.floor(Math.random() * 90);
    let p: Round;

    before(async () => {
      p = await openSealedRound(RUN, DURATION);
    });

    it("schedules a keeper and a buzzer on the rollup's task scheduler", async () => {
      const sig = await erProgram.methods
        .scheduleRoundCranks()
        .accounts({ payer: creator.publicKey, matchAccount: p.matchPda })
        .rpc();
      const tx = await erConnection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const logs = tx?.meta?.logMessages ?? [];
      assert.equal(
        logs.filter((l) => l.includes("Scheduled task request with ID")).length,
        2,
        `the magic program accepted both tasks:\n${logs.join("\n")}`
      );
      assert.ok(logs.some((l) => l.includes("round cranks scheduled")), "the program reported the schedule");
    });

    it("the keeper liquidates a blown-up short, with nobody calling liquidate", async () => {
      const mark = (await program.account.priceFeed.fetch(p.feed)).px.toNumber();
      // Most of what the entry can carry, so a doubling-and-a-bit of the mark
      // wipes it — the walk below then fits well inside the round.
      const capacity = Math.floor((ENTRY * VALUE_DIV) / mark);
      await erProgram.methods
        .applyFill({ sell: {} }, new BN(Math.floor(capacity * 0.8)), creator.publicKey)
        .accounts({ player: creator.publicKey, matchAccount: p.matchPda, priceFeed: p.feed, position: p.posA, sessionToken: null })
        .rpc();
      const shorted = await erProgram.account.position.fetch(p.posA);
      assert.isBelow(shorted.baseQty.toNumber(), 0, "A is short on the rollup");

      // Walk A's mark up on Solana, one rate-limited step at a time, each step
      // taken from the feed as it actually stands. The rollup reads its clone
      // of the feed; this test never touches the position again.
      const keeperStopsAt = (await buzzerMs(p)) - 3_000;
      let flagged = false;
      let pushes = 0;
      while (Date.now() < keeperStopsAt) {
        if ((await erProgram.account.roundStatus.fetch(p.status)).liquidatedA) {
          flagged = true;
          break;
        }
        const current = (await program.account.priceFeed.fetch(p.feed)).px.toNumber();
        await sleep(1100);
        await program.methods
          .pushPrice(new BN(Math.floor(current * 1.049)), creator.publicKey)
          .accounts({ authority: creator.publicKey, matchAccount: p.matchPda, priceFeed: p.feed })
          .rpc()
          .then(() => {
            pushes += 1;
          })
          .catch(() => {
            /* PriceTooSoon when two pushes share a chain second; the next step retries */
          });
      }
      const walked = (await program.account.priceFeed.fetch(p.feed)).px.toNumber() / mark;
      assert.ok(flagged, `the keeper never flagged A (mark at ${walked.toFixed(2)}x after ${pushes} pushes)`);

      const closed = await erProgram.account.position.fetch(p.posA);
      assert.equal(closed.baseQty.toNumber(), 0, "the short was closed out");
      assert.equal(closed.quoteBalance.toNumber(), 0, "and wiped");
      const last = closed.fills[closed.fills.length - 1];
      assert.deepEqual(Object.keys(last.side), ["liquidation"], "recorded as a liquidation, not a trade");
      assert.equal(closed.fillCount, closed.fills.length, "a liquidation counts as one fill, not two");
      assert.isFalse((await erProgram.account.roundStatus.fetch(p.status)).liquidatedB, "B was left alone");
    });

    it("at the buzzer the crank commits both positions and the status to Solana", async () => {
      await sleep(Math.max(0, (await buzzerMs(p)) - Date.now()));
      await until("positions and status to come home", 60_000, async () => {
        const o = await l1Owners(p);
        return roundHome(o) ? o : null;
      });

      // And the rollup's own history says who did it.
      const sigs = await erConnection.getSignaturesForAddress(p.posA, { limit: 100 });
      let committedByCrank = false;
      for (const s of sigs) {
        const tx = await erConnection.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        const logs = tx?.meta?.logMessages ?? [];
        if (logs.some((l) => l.includes("buzzer: committing position")) && logs.some((l) => l.includes("Executed crank"))) {
          committedByCrank = true;
          break;
        }
      }
      assert.ok(committedByCrank, "the commit ran inside a crank transaction");
    });

    it("each player releases their own ACL, and both land back under the permission program", async () => {
      await releaseAcl(creatorKp, p.posA);
      await releaseAcl(p.joiner, p.posB);
      const owners = await until("both ACLs to come home", 60_000, async () => {
        const o = await l1Owners(p);
        return aclsHome(o) ? o : null;
      });
      assert.ok(roundHome(owners) && aclsHome(owners), "every account the round delegated is back on Solana");
    });

    it("settles on Solana, and the permanent record says A was liquidated", async () => {
      await settle(p);
      const tape = await program.account.tape.fetch(p.tape);
      assert.isTrue(tape.liquidatedA, "tape records A's liquidation");
      assert.isFalse(tape.liquidatedB);
      assert.equal(tape.winner.toBase58(), p.joiner.publicKey.toBase58(), "a wiped side cannot win");
    });
  });

  describe("a player's client brings the round home", () => {
    const DURATION = 12;
    const RUN = Math.floor(Date.now() / 1000) * 1000 + 600 + Math.floor(Math.random() * 90);
    let p: Round;

    before(async () => {
      p = await openSealedRound(RUN, DURATION);
    });

    it("releases an ACL before its position's commit, and another after", async () => {
      await sleep(Math.max(0, (await buzzerMs(p)) + 1_000 - Date.now()));

      // A: release the ACL first, then commit the position.
      await releaseAcl(creatorKp, p.posA);
      await erProgram.methods.commitAndUndelegatePosition().accounts({ payer: creator.publicKey, position: p.posA }).rpc();

      // B: commit the position first — anyone may — and only then does its
      // owner release the ACL, with the position already on its way home.
      await erProgram.methods.commitAndUndelegatePosition().accounts({ payer: creator.publicKey, position: p.posB }).rpc();
      await until("B's position to come home", 60_000, async () => ((await l1Owners(p))[1] === programId ? true : null));
      await releaseAcl(p.joiner, p.posB);

      await erProgram.methods.commitAndUndelegateStatus().accounts({ payer: creator.publicKey, roundStatus: p.status }).rpc();

      const owners = await until("every delegated account to come home", 60_000, async () => {
        const o = await l1Owners(p);
        return roundHome(o) && aclsHome(o) ? o : null;
      });
      assert.ok(roundHome(owners) && aclsHome(owners), "positions and status back under fogduel, ACLs back under the permission program");
    });

    it("settles on Solana after the client-driven commit", async () => {
      await settle(p);
      const m = await program.account.match.fetch(p.matchPda);
      assert.deepEqual(m.status, { settled: {} });

      // Nothing was traded, so nothing was folded: the tape starts at the entry.
      const tape = await program.account.tape.fetch(p.tape);
      assert.equal(tape.fillCountA, 0);
      assert.equal(tape.startQuoteA.toNumber(), ENTRY);
      assert.equal(tape.startBaseA.toNumber(), 0);
    });
  });

  describe("a busy round still comes home", () => {
    // A quiet round's positions barely change, and the rollup commits each as
    // instruction data in one transaction. Twenty-odd fills rewrite a couple of
    // hundred of a position's 559 bytes — every fill past the sixteenth shifts
    // the whole fill list — which does not fit in one transaction, so the
    // rollup stages the commit in a buffer owned by MagicBlock's committor
    // program. On a base layer without that program the commit stayed pending
    // for good: the round never came home and its pot could not be settled.
    const DURATION = 60;
    const FILLS_PER_SIDE = 24;
    const RUN = Math.floor(Date.now() / 1000) * 1000 + 700 + Math.floor(Math.random() * 90);
    let p: Round;
    const sealedData = new Map<string, Buffer>();

    before(async () => {
      p = await openSealedRound(RUN, DURATION);
      // What Solana holds for each position while it is delegated — the state
      // the rollup's commit is diffed against.
      for (const position of [p.posA, p.posB]) {
        sealedData.set(position.toBase58(), Buffer.from((await provider.connection.getAccountInfo(position))!.data));
      }
    });

    /** One fill on the rollup, polled to confirmation rather than waiting on its websocket. */
    async function fill(owner: Keypair, feed: PublicKey, position: PublicKey, buy: boolean, qty: number) {
      const ix = await erProgram.methods
        .applyFill(buy ? { buy: {} } : { sell: {} }, new BN(qty), owner.publicKey)
        .accounts({ player: owner.publicKey, matchAccount: p.matchPda, priceFeed: feed, position, sessionToken: null })
        .instruction();
      const tx = new Transaction().add(ix);
      tx.feePayer = owner.publicKey;
      tx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
      tx.sign(owner);
      const sig = await erConnection.sendRawTransaction(tx.serialize());
      for (let i = 0; i < 200; i++) {
        const [s] = (await erConnection.getSignatureStatuses([sig])).value;
        if (s?.err) throw new Error(`fill ${sig.slice(0, 12)} failed: ${JSON.stringify(s.err)}`);
        if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return;
        await sleep(100);
      }
      throw new Error(`fill ${sig.slice(0, 12)} was not confirmed within 20s`);
    }

    it("trades both sides twenty-odd times on the rollup, with the crank scheduled", async () => {
      const schedule = await erProgram.methods
        .scheduleRoundCranks()
        .accounts({ payer: creator.publicKey, matchAccount: p.matchPda })
        .instruction();
      await sendOnEr(new Transaction().add(schedule), creatorKp);

      // Small round trips: spend a fiftieth of the entry, then sell about what
      // it bought. The book's impact leaves a sliver of a short, far inside
      // what the entry covers, so the keeper has nothing to liquidate.
      const quote = Math.floor(ENTRY / 50);
      const base = Math.floor((quote * VALUE_DIV) / START_PX);
      const sides: [Keypair, PublicKey, PublicKey][] = [
        [creatorKp, p.feed, p.posA],
        [p.joiner, p.feedB, p.posB],
      ];
      for (let i = 0; i < FILLS_PER_SIDE; i++) {
        const buy = i % 2 === 0;
        // `+ i` keeps two otherwise identical fills from sharing a signature.
        await Promise.all(sides.map(([owner, feed, position]) => fill(owner, feed, position, buy, (buy ? quote : base) + i)));
      }

      for (const [, , position] of sides) {
        const pos = await erProgram.account.position.fetch(position);
        assert.equal(pos.fillCount, FILLS_PER_SIDE, "every fill landed");
        const now = (await erConnection.getAccountInfo(position))!.data;
        const sealed = sealedData.get(position.toBase58())!;
        let changed = 0;
        for (let i = 0; i < now.length; i++) if (now[i] !== sealed[i]) changed += 1;
        assert.isAtLeast(changed, 150, `a busy position differs from its sealed copy in only ${changed} bytes`);
      }
    });

    it("at the buzzer the crank still brings both positions and the status home", async () => {
      await sleep(Math.max(0, (await buzzerMs(p)) - Date.now()));
      const owners = await until("a busy round's positions and status to come home", 120_000, async () => {
        const o = await l1Owners(p);
        return roundHome(o) ? o : null;
      });
      assert.ok(roundHome(owners), "positions and status back under fogduel");
    });

    it("releases both ACLs and settles on Solana", async () => {
      await releaseAcl(creatorKp, p.posA);
      await releaseAcl(p.joiner, p.posB);
      await until("both ACLs to come home", 60_000, async () => (aclsHome(await l1Owners(p)) ? true : null));
      await settle(p);
      const m = await program.account.match.fetch(p.matchPda);
      assert.deepEqual(m.status, { settled: {} });
    });

    it("the tape says where its last sixteen fills start, so they replay onto the chain's PnL", async () => {
      // A tape keeps only the last sixteen fills a side. Replayed from the
      // entry they end somewhere the chain never was; replayed from the start
      // the program recorded, they land on its own pnl_bps.
      const tape = await program.account.tape.fetch(p.tape);
      const value = BigInt(VALUE_DIV);
      const entry = BigInt(ENTRY);
      const sides = [
        { label: "A", fills: tape.fillsA, quote: tape.startQuoteA, base: tape.startBaseA, count: tape.fillCountA, bps: tape.pnlABps },
        { label: "B", fills: tape.fillsB, quote: tape.startQuoteB, base: tape.startBaseB, count: tape.fillCountB, bps: tape.pnlBBps },
      ];
      for (const s of sides) {
        assert.equal(s.fills.length, 16, `${s.label}: the tape keeps the last sixteen fills`);
        assert.isAbove(s.count, s.fills.length, `${s.label}: the tape counts every fill, not only the stored ones`);
        let quote = BigInt(s.quote.toString());
        let base = BigInt(s.base.toString());
        assert.ok(quote !== entry || base !== 0n, `${s.label}: the evicted fills were folded into the start`);
        for (const f of s.fills) {
          const qty = BigInt(f.qty.toString());
          const moved = (qty * BigInt(f.px.toString())) / value;
          const side = Object.keys(f.side)[0];
          if (side === "buy") {
            quote -= moved;
            base += qty;
          } else if (side === "sell") {
            quote += moved;
            base -= qty;
          } else if (side === "settle") {
            if (base > 0n) {
              quote += moved;
              base -= qty;
            } else {
              quote -= moved;
              base += qty;
            }
          } else {
            quote = 0n;
            base = 0n;
          }
        }
        assert.equal(base, 0n, `${s.label}: replayed from the recorded start, the round ends flat`);
        const replayBps = Number(((quote - entry) * 10_000n) / entry);
        assert.isAtMost(
          Math.abs(replayBps - s.bps.toNumber()),
          1,
          `${s.label}: replay ${replayBps} bps vs chain ${s.bps.toNumber()} bps`
        );
      }
    });
  });
});
