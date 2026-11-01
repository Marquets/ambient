import { KEYS, MODES } from "@/lib/ambient";
import type { Channel, Echo, Reverb, Synth, Tape } from "./engine";

const WAVES: OscillatorType[] = ["sine", "triangle", "sawtooth", "square"];

/**
 * A different sky and sound every time the page opens: each setting drawn from a range that
 * sounds good, never from the whole of a knob's. The volume and the pitch stay as they are, so it
 * never comes in too loud, and the key already moves the tuning.
 */
export function randomPreset(random = Math.random) {
  const between = (from: number, to: number) => from + random() * (to - from);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const levels: Record<Channel, number> = {
    pad: between(0.3, 0.8),
    drone: between(0.2, 0.6),
    // Half the time it doesn't rain at all
    lluvia: random() < 0.5 ? 0 : between(0.1, 0.4),
    notas: between(0.3, 0.7),
    lienzo: 0.6,
  };
  const synth: Synth = {
    wave: pick(WAVES),
    // Mostly a pluck, now and then a swell
    attack: 0.005 + random() ** 3 * 0.4,
    decay: between(2, 6),
    cutoff: between(2000, 9000),
    resonance: between(0.5, 4),
  };
  const echo: Echo = { amount: between(0.15, 0.45), time: between(0.3, 0.9), repeats: between(0.3, 0.6), color: between(1500, 4000) };
  const reverb: Reverb = { amount: between(0.25, 0.55), size: between(3, 8), color: between(3000, 9000) };
  const tape: Tape = { saturation: between(0, 0.4), wow: between(0, 0.3), flutter: between(0, 0.3) };
  return {
    key: Math.floor(random() * KEYS.length),
    mode: pick(Object.keys(MODES)),
    levels,
    synth,
    echo,
    reverb,
    tape,
    // Short of full night, where the sky is nearly black
    light: between(0.15, 0.95),
    chaos: between(0.5, 2),
  };
}
