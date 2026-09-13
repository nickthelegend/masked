/**
 * The deployed code's size, without downloading the code.
 *
 * An upgradeable program's own account is a 36-byte pointer to its ProgramData
 * account — and "36 bytes" is what /health, and then /proof, used to report as
 * the program. The code lives in ProgramData behind a 45-byte header. Its
 * `space` is read with a zero-length slice, since the account is the whole
 * program and both pages poll; web3.js does not surface `space`, so the call is
 * direct.
 */
import { PublicKey, type AccountInfo } from '@solana/web3.js';

const PROGRAM_DATA_HEADER = 45;
const UPGRADEABLE_POINTER_LEN = 36;

const programDataCodeBytes = async (rpcUrl: string, programData: PublicKey): Promise<number | null> => {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [programData.toBase58(), { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }],
    }),
  });
  const body = (await r.json()) as { result?: { value?: { space?: number } | null } };
  const space = body.result?.value?.space;
  return typeof space === 'number' ? space - PROGRAM_DATA_HEADER : null;
};

/**
 * Bytes of code behind an executable account, or null when its ProgramData
 * could not be read. A program that is not upgradeable is its own code.
 */
export const programCodeBytes = async (rpcUrl: string, program: AccountInfo<Buffer>): Promise<number | null> =>
  program.data.length === UPGRADEABLE_POINTER_LEN
    ? programDataCodeBytes(rpcUrl, new PublicKey(program.data.subarray(4, UPGRADEABLE_POINTER_LEN)))
    : program.data.length;
