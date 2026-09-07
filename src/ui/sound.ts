/**
 * The arcade's voice.
 *
 * Everything here is synthesized at play time out of oscillators and gain
 * envelopes — there are no audio files in the repo and nothing is fetched.
 * That is partly taste (a 1-bit machine should sound like one, and a square
 * wave is what one sounds like) and partly honesty: a sample pack would be
 * an asset dependency for something the platform can generate exactly.
 *
 * The house motion language is "things snap, they do not ease". The sound
 * follows it: every voice is short, hard-edged and quantised to the same
 * 83ms frame the animations use.
 */
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { FRAME_MS } from './motion';

const STORAGE_KEY = 'masked.sound';

type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine';

/** One note of a voice: a frequency held for a number of frames. */
interface Step {
  /** Hz. A step at 0 is a rest. */
  hz: number;
  /** Length in frames (83ms each). */
  frames: number;
  wave?: Wave;
  /** Peak gain, 0..1. Kept low — several of these can overlap. */
  level?: number;
}

/**
 * The voices.
 *
 * Pitches are a pentatonic-ish set so two overlapping sounds never land on a
 * semitone clash, which is what makes a fill during the closing ticks sound
 * like part of the same machine rather than a mistake.
 */
const VOICES = {
  /** A long filled: two steps up. */
  fill: [
    { hz: 523.25, frames: 1 },
    { hz: 783.99, frames: 2 },
  ],
  /** A close filled: the same shape inverted. */
  close: [
    { hz: 659.25, frames: 1 },
    { hz: 392.0, frames: 2 },
  ],
  /** Positions sealed on the rollup — the moment the fog comes down. */
  seal: [
    { hz: 196.0, frames: 2, wave: 'triangle' as Wave },
    { hz: 261.63, frames: 2, wave: 'triangle' as Wave },
    { hz: 392.0, frames: 4, wave: 'triangle' as Wave, level: 0.1 },
  ],
  /** One second of the closing countdown. */
  tick: [{ hz: 880.0, frames: 1, level: 0.05 }],
  /** The buzzer. Deliberately the ugliest thing in the app. */
  buzzer: [
    { hz: 174.61, frames: 3, wave: 'sawtooth' as Wave, level: 0.14 },
    { hz: 138.59, frames: 5, wave: 'sawtooth' as Wave, level: 0.14 },
  ],
  /** You took the pot. */
  win: [
    { hz: 523.25, frames: 1 },
    { hz: 659.25, frames: 1 },
    { hz: 783.99, frames: 1 },
    { hz: 1046.5, frames: 5, level: 0.12 },
  ],
  /** You did not. */
  loss: [
    { hz: 415.3, frames: 2 },
    { hz: 349.23, frames: 2 },
    { hz: 261.63, frames: 6, wave: 'triangle' as Wave },
  ],
} satisfies Record<string, Step[]>;

export type SoundName = keyof typeof VOICES;

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

/* --------------------------------- state --------------------------------- */

const readStored = (): boolean => {
  if (!isWeb) return false;
  try {
    // Default on. A sound toggle that starts muted is a feature nobody finds.
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    // Private windows and blocked site data both throw on access rather than
    // returning null, so this cannot be a null check.
    return true;
  }
};

let enabled = readStored();
const listeners = new Set<(on: boolean) => void>();

export const soundEnabled = (): boolean => enabled;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (isWeb) {
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // Not being able to remember the choice is not a reason to ignore it.
    }
  }
  listeners.forEach((f) => f(on));
}

/** The mute toggle's state, kept in step across every component that shows it. */
export function useSoundEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return [on, setSoundEnabled];
}

/* --------------------------------- audio --------------------------------- */

type Ctx = AudioContext & { resume(): Promise<void> };
let ctx: Ctx | null = null;

/**
 * The shared context, created on demand.
 *
 * A browser will not start audio until the page has been interacted with, and
 * a context constructed before that starts `suspended` and stays there. So it
 * is built at the first play — which is always downstream of a click — and
 * resumed each time, because it can be suspended again when a tab is hidden.
 */
function audio(): Ctx | null {
  if (!isWeb || !enabled) return null;
  try {
    if (!ctx) {
      const C =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C() as Ctx;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    // A browser that refuses to give us an audio context is a browser that
    // plays the app silently, which is a fine way to play it.
    return null;
  }
}

/**
 * Play one voice.
 *
 * Safe to call from anywhere, at any time: with sound off, on a platform
 * without Web Audio, or before the page has been touched, it does nothing and
 * says nothing. Sound is decoration — it must never be able to break a round.
 */
export function play(name: SoundName): void {
  const c = audio();
  if (!c) return;
  try {
    const steps = VOICES[name] as Step[];
    let at = c.currentTime;
    for (const step of steps) {
      const seconds = (step.frames * FRAME_MS) / 1000;
      if (step.hz > 0) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = step.wave ?? 'square';
        osc.frequency.setValueAtTime(step.hz, at);

        // A hard attack and a short decay. Ramping to an exact zero throws on
        // an exponential ramp, so the floor is an inaudible epsilon.
        const peak = step.level ?? 0.08;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(peak, at + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

        osc.connect(gain).connect(c.destination);
        osc.start(at);
        osc.stop(at + seconds + 0.02);
      }
      at += seconds;
    }
  } catch {
    // Ditto.
  }
}
