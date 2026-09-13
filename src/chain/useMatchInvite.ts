/**
 * One match, looked up by the address in an invite link.
 *
 * The open book lists joinable matches only, so a link to a match that has
 * since been joined, cancelled or left to go stale would simply be missing
 * from it — and a missing row explains nothing to the person who was sent the
 * link. This reads the account itself and says which of those happened.
 *
 * Polled like the book, because an invite changes state while it is open on
 * screen: it ages past the program's join window, or somebody else takes it.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER } from './config';
import { withDeadline } from './rpcTimeout';
import { MAX_OPEN_AGE_SECS } from './units';
import { decodeFixed } from './useOpenMatches';
import { short } from './useTapes';

export interface InvitedMatch {
  address: string;
  creator: string;
  /** The creator as every other row in the book prints it. */
  creatorShort: string;
  symbol: string;
  mint: string;
  entry: number;
  duration: number;
  ageSecs: number;
}

/**
 * `viewer` is the wallet the answer was worked out for, so a caller can tell a
 * stale answer (read before the wallet reconnected) from a current one. `mine`
 * marks the viewer's own match, open or live: that is not an invitation, and
 * `useDuel` resumes it.
 */
export type InviteState =
  | { kind: 'none' }
  | { kind: 'reading' }
  | { kind: 'joinable'; match: InvitedMatch; viewer: string | null }
  | { kind: 'refused'; title: string; detail: string; viewer: string | null; mine?: boolean };

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

export function useMatchInvite(address: string | null | undefined, myAddress: string | null, pollMs = 4000): InviteState {
  const [state, setState] = useState<InviteState>(address ? { kind: 'reading' } : { kind: 'none' });

  useEffect(() => {
    if (!address) {
      setState({ kind: 'none' });
      return;
    }
    let key: PublicKey;
    try {
      key = new PublicKey(address);
    } catch {
      setState({ kind: 'refused', title: 'NOT A MATCH LINK', detail: 'The address in this link is not a Solana account.', viewer: myAddress });
      return;
    }

    let alive = true;
    const read = async () => {
      try {
        const connection = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
        const provider = new AnchorProvider(connection, readOnlyWallet as never, { commitment: 'confirmed' });
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const program = new Program(FOGDUEL_IDL as Idl, provider) as any;
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        let m: any;
        try {
          m = await withDeadline(program.account.match.fetchNullable(key), 'the base layer');
        } catch (e) {
          // An account that exists but is not a Match fails Anchor's
          // discriminator check rather than coming back null.
          if (/discriminator/i.test(String((e as Error)?.message ?? e))) {
            if (alive) setState({ kind: 'refused', title: 'NOT A MATCH LINK', detail: 'That address holds an account, but not a match.', viewer: myAddress });
            return;
          }
          throw e;
        }
        if (!alive) return;
        if (!m) {
          setState({ kind: 'refused', title: 'NO SUCH MATCH', detail: 'Nothing exists at this address on this cluster.', viewer: myAddress });
          return;
        }

        const status = Object.keys(m.status)[0];
        const creator = m.creator.toBase58();
        if (status === 'cancelled') {
          setState({ kind: 'refused', title: 'MATCH CANCELLED', detail: 'Its creator cancelled it and took the entry back.', viewer: myAddress });
        } else if (status === 'live' || status === 'settling') {
          // Either seat counts: the creator following their own link after it
          // was taken is in this duel too, not beaten to it.
          const mine = !!myAddress && (creator === myAddress || m.joiner?.toBase58() === myAddress);
          setState(
            mine
              ? { kind: 'refused', title: 'YOU ARE IN THIS DUEL', detail: 'It is already running, on the DUEL tab.', viewer: myAddress, mine: true }
              : { kind: 'refused', title: 'ALREADY TAKEN', detail: 'Somebody else joined this match first.', viewer: myAddress }
          );
        } else if (status === 'settled') {
          setState({ kind: 'refused', title: 'ALREADY PLAYED', detail: 'This duel has settled. Its tape is public.', viewer: myAddress });
        } else if (myAddress && creator === myAddress) {
          setState({ kind: 'refused', title: 'YOUR OWN MATCH', detail: 'Send this link to someone else. The program refuses a self-join.', viewer: myAddress, mine: true });
        } else {
          const ageSecs = Math.max(0, Math.floor(Date.now() / 1000) - m.createdTs.toNumber());
          if (ageSecs > MAX_OPEN_AGE_SECS) {
            setState({
              kind: 'refused',
              title: 'INVITE EXPIRED',
              detail: `Opened ${Math.floor(ageSecs / 60)} min ago. The program refuses a join after ${MAX_OPEN_AGE_SECS / 60} minutes, because both books start from the price at opening.`,
              viewer: myAddress,
            });
          } else {
            setState({
              kind: 'joinable',
              match: {
                address,
                creator,
                creatorShort: short(m.creator),
                symbol: decodeFixed(m.legA.symbol),
                mint: m.legA.mint.toBase58(),
                entry: m.entry.toNumber(),
                duration: m.duration.toNumber(),
                ageSecs,
              },
              viewer: myAddress,
            });
          }
        }
      } catch {
        if (alive) setState({ kind: 'refused', title: 'CLUSTER NOT ANSWERING', detail: 'The match could not be read. Retrying.', viewer: myAddress });
      }
    };

    setState({ kind: 'reading' });
    read();
    const id = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [address, myAddress, pollMs]);

  return state;
}
