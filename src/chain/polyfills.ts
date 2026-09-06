/**
 * Node globals that @solana/web3.js expects and Expo/Hermes does not ship.
 *
 * Must be imported before anything that touches web3.js — the root layout does
 * it first. On web most of this already exists; on native none of it does.
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'undefined') {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}
