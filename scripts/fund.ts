/**
 * Fund a script's second wallet.
 *
 * The local cluster's faucet answers every airdrop. Devnet's refuses them as
 * rate-limited often enough that a script built on `requestAirdrop` cannot run
 * there at all, so on devnet the lamports come from `from` instead: the deploy
 * wallet, which has to hold devnet SOL for the deploy anyway.
 */
import {
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Connection,
  type Keypair,
  type PublicKey,
} from '@solana/web3.js';

/** A transfer's fee, with room to spare; the check below only guards against an obviously empty wallet. */
const FEE_HEADROOM = 10_000;

export async function fund(l1: Connection, from: Keypair, to: PublicKey, lamports: number, devnet: boolean): Promise<void> {
  if (!devnet) {
    const sig = await l1.requestAirdrop(to, lamports);
    await l1.confirmTransaction(sig, 'confirmed');
    return;
  }
  const held = await l1.getBalance(from.publicKey, 'confirmed');
  if (held < lamports + FEE_HEADROOM) {
    throw new Error(
      `devnet: ${from.publicKey.toBase58()} holds ${held / LAMPORTS_PER_SOL} SOL and must send ` +
        `${lamports / LAMPORTS_PER_SOL} SOL to ${to.toBase58()}; fund the deploy wallet first`
    );
  }
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }));
  await sendAndConfirmTransaction(l1, tx, [from], { commitment: 'confirmed' });
}
