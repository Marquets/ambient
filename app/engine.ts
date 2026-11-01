import { PAD_CHORD, degreeHz } from "@/lib/ambient";
import type { Scene } from "./sky";

export type Channel = "pad" | "drone" | "lluvia" | "notas" | "lienzo";
// amount is how much of every channel goes in; time in seconds, repeats the feedback, color the damping in Hz
export type Echo = { amount: number; time: number; repeats: number; color: number };
// size is the tail in seconds
export type Reverb = { amount: number; size: number; color: number };
// How every note sounds: its waveform, attack and decay in seconds, and a low-pass filter (Hz, Q)
export type Synth = { wave: OscillatorType; attack: number; decay: number; cutoff: number; resonance: number };
// The whole mix as if off a worn cassette, each 0–1: soft clipping, and the speed wobbling slowly and fast
export type Tape = { saturation: number; wow: number; flutter: number };

const NOTE_TICK_MS = 400;
// How long the pad and the drone fade out and back in when the scene changes their sound
const RETIMBRE_S = 0.25;

// How the pad and the drone sound in each scene: the pad's waveform, how far its two voices per
// note drift apart (cents), how loud each note is, and its filter (Hz, Q) swept slowly (Hz, depth
// in Hz); the drone's two tones (a ratio over the root, a waveform and a level) and how deeply and
// fast its volume laps
type Timbre = {
  pad: { wave: OscillatorType; detune: number; level: number; cutoff: number; q: number; sweep: number; depth: number };
  drone: { ratio: number; wave: OscillatorType; level: number }[];
  lap: { depth: number; hz: number };
};
const TIMBRES: Record<Scene, Timbre> = {
  // Two saws a little apart per note, so the pad drifts instead of buzzing; a root and its fifth
  Sky: {
    pad: { wave: "sawtooth", detune: 7, level: 0.06, cutoff: 900, q: 1, sweep: 0.05, depth: 400 },
    drone: [
      { ratio: 1, wave: "sine", level: 0.5 },
      { ratio: 1.5, wave: "triangle", level: 0.15 },
    ],
    lap: { depth: 0, hz: 0.25 },
  },
  // Pure sines a breath apart through an open filter that swells slowly, like a glass harmonica;
  // a root and a faint twelfth above it, rising and falling like a slow tide
  Pond: {
    pad: { wave: "sine", detune: 4, level: 0.16, cutoff: 2400, q: 0.7, sweep: 0.07, depth: 600 },
    drone: [
      { ratio: 1, wave: "sine", level: 0.5 },
      { ratio: 3, wave: "sine", level: 0.06 },
    ],
    lap: { depth: 0.3, hz: 0.12 },
  },
  // Soft triangles through a filter that opens and closes very slowly, like a bloom breathing;
  // a root and its octave, swelling gently
  Flower: {
    pad: { wave: "triangle", detune: 9, level: 0.09, cutoff: 1800, q: 2, sweep: 0.03, depth: 500 },
    drone: [
      { ratio: 1, wave: "sine", level: 0.45 },
      { ratio: 2, wave: "triangle", level: 0.1 },
    ],
    lap: { depth: 0.15, hz: 0.08 },
  },
};

function noise(ctx: AudioContext, seconds: number, decay: number) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

/** All the sound of the ambient page; created from a tap, since browsers only start audio from one */
export function createEngine() {
  const ctx = new AudioContext();
  let key = 0;
  let scale = [0];
  let light = 0.5;
  // Semitones on top of the key, not rounded, so turning the knob slides everything
  let pitch = 0;
  let synth: Synth = { wave: "sine", attack: 0.01, decay: 3.5, cutoff: 6000, resonance: 1 };
  let timbre = TIMBRES.Sky;

  const out = ctx.createDynamicsCompressor();
  out.connect(ctx.destination);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  out.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const master = ctx.createGain();
  master.connect(out);
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";

  // Tape: the mix through a short delay whose time wobbles, which bends the pitch, slowly (wow) and
  // fast (flutter); then a soft clipper blended in for saturation, its highs worn down with it
  const wobble = ctx.createDelay(0.1);
  wobble.delayTime.value = 0.02;
  const lfo = (hz: number) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    const depth = ctx.createGain();
    depth.gain.value = 0;
    osc.connect(depth).connect(wobble.delayTime);
    osc.start();
    return depth;
  };
  const wow = lfo(0.6);
  const flutter = lfo(7);
  const clean = ctx.createGain();
  const drive = ctx.createGain();
  const clipper = ctx.createWaveShaper();
  clipper.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh((i / 511.5 - 1) * 3));
  clipper.oversample = "4x";
  const worn = ctx.createBiquadFilter();
  worn.type = "lowpass";
  const dirty = ctx.createGain();
  tone.connect(wobble);
  wobble.connect(clean).connect(master);
  wobble.connect(drive).connect(clipper).connect(worn).connect(dirty).connect(master);

  // Eco: a delay fed back into itself through a damping filter
  const echoIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.6;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.45;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2500;
  echoIn.connect(delay).connect(damp).connect(feedback).connect(delay);
  damp.connect(tone);

  // Reverb: a convolver over a decaying burst of noise, as long as the room is big
  const reverbIn = ctx.createGain();
  const reverbColor = ctx.createBiquadFilter();
  reverbColor.type = "lowpass";
  reverbColor.connect(tone);
  let reverbSize = 5;
  let reverb = ctx.createConvolver();
  reverb.buffer = noise(ctx, reverbSize, 3);
  reverbIn.connect(reverb).connect(reverbColor);

  // Each channel feeds the mix and both effects
  const bus = () => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(tone);
    g.connect(echoIn);
    g.connect(reverbIn);
    return g;
  };
  const levels: Record<Channel, GainNode> = { pad: bus(), drone: bus(), lluvia: bus(), notas: bus(), lienzo: bus() };

  // The pad: two voices per chord note through a swept filter, sounding as the scene's timbre says
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = timbre.pad.cutoff;
  padFilter.Q.value = timbre.pad.q;
  padFilter.connect(levels.pad);
  const sweep = ctx.createOscillator();
  sweep.frequency.value = timbre.pad.sweep;
  const sweepDepth = ctx.createGain();
  sweepDepth.gain.value = timbre.pad.depth;
  sweep.connect(sweepDepth).connect(padFilter.frequency);
  const voices = [0, 1, 2, 3].map(() => {
    const gain = ctx.createGain();
    gain.gain.value = timbre.pad.level;
    gain.connect(padFilter);
    const oscs = [-1, 1].map((side) => {
      const osc = ctx.createOscillator();
      osc.type = timbre.pad.wave;
      osc.detune.value = side * timbre.pad.detune;
      osc.connect(gain);
      return osc;
    });
    return { gain, oscs };
  });

  // The drone: two tones over the root, through a gain an LFO can make lap
  const lapping = ctx.createGain();
  lapping.connect(levels.drone);
  const lap = ctx.createOscillator();
  lap.frequency.value = timbre.lap.hz;
  const lapDepth = ctx.createGain();
  lapDepth.gain.value = timbre.lap.depth;
  lap.connect(lapDepth).connect(lapping.gain);
  const drone = timbre.drone.map(({ wave, level }) => {
    const osc = ctx.createOscillator();
    osc.type = wave;
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(lapping);
    return { osc, gain };
  });

  const rain = ctx.createBufferSource();
  rain.buffer = noise(ctx, 4, 0);
  rain.loop = true;
  const rainHigh = ctx.createBiquadFilter();
  rainHigh.type = "highpass";
  rainHigh.frequency.value = 500;
  const rainLow = ctx.createBiquadFilter();
  rainLow.type = "lowpass";
  rainLow.frequency.value = 4000;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.3;
  rain.connect(rainHigh).connect(rainLow).connect(rainGain).connect(levels.lluvia);

  function tune(glide: number) {
    const now = ctx.currentTime;
    PAD_CHORD.forEach((degree, i) => voices[i].oscs.forEach((osc) => osc.frequency.setTargetAtTime(degreeHz(key + pitch, scale, degree), now, glide)));
    drone.forEach(({ osc }, i) => osc.frequency.setTargetAtTime((degreeHz(key + pitch, scale, 0) / 2) * timbre.drone[i].ratio, now, glide));
  }

  // A note two octaves up from the pad, shaped by the synth settings; brightness adds its upper
  // partials and opens the filter
  function bell(degree: number, brightness: number, into: GainNode) {
    const now = ctx.currentTime;
    const { wave, attack, decay, cutoff, resonance } = synth;
    const hz = degreeHz(key + pitch, scale, degree + scale.length);
    const end = now + attack + decay;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff * (0.5 + brightness);
    filter.Q.value = resonance;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.25, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    filter.connect(env).connect(into);
    [
      [1, 1],
      [2.01, brightness * 0.5],
      [3.98, brightness * 0.15],
    ].forEach(([ratio, level]) => {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = hz * ratio;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(filter);
      osc.start(now);
      osc.stop(end + 0.1);
    });
  }

  for (const v of voices) for (const osc of v.oscs) osc.start();
  for (const { osc } of drone) osc.start();
  sweep.start();
  lap.start();
  rain.start();

  // Faded out, the new sound set while silent, then faded back in, so the change doesn't click
  let retimbre: ReturnType<typeof setTimeout> | undefined;
  function setTimbre(next: Timbre) {
    if (next === timbre) return;
    timbre = next;
    const now = ctx.currentTime;
    for (const { gain } of [...voices, ...drone]) gain.gain.setTargetAtTime(0, now, RETIMBRE_S / 4);
    clearTimeout(retimbre);
    retimbre = setTimeout(() => {
      const now = ctx.currentTime;
      const { pad } = timbre;
      for (const { gain, oscs } of voices) {
        oscs.forEach((osc, side) => {
          osc.type = pad.wave;
          osc.detune.value = (side ? 1 : -1) * pad.detune;
        });
        gain.gain.setTargetAtTime(pad.level, now, RETIMBRE_S / 2);
      }
      padFilter.frequency.value = pad.cutoff;
      padFilter.Q.setTargetAtTime(pad.q, now, 0.05);
      sweep.frequency.value = pad.sweep;
      sweepDepth.gain.value = pad.depth;
      drone.forEach(({ osc, gain }, i) => {
        osc.type = timbre.drone[i].wave;
        gain.gain.setTargetAtTime(timbre.drone[i].level, now, RETIMBRE_S / 2);
      });
      lap.frequency.value = timbre.lap.hz;
      lapDepth.gain.setTargetAtTime(timbre.lap.depth, now, 0.1);
      tune(0);
    }, RETIMBRE_S * 1000);
  }

  // The brighter the light, the more often a note falls
  const notes = setInterval(() => {
    if (levels.notas.gain.value < 0.01 || Math.random() > 0.08 + 0.35 * light) return;
    bell(Math.floor(Math.random() * 2 * scale.length), Math.random(), levels.notas);
  }, NOTE_TICK_MS);

  return {
    setKey(newKey: number, newScale: number[]) {
      key = newKey;
      scale = newScale;
      tune(0.5);
    },
    setPitch(semitones: number) {
      pitch = semitones;
      tune(0.05);
    },
    setLevel(channel: Channel, value: number) {
      levels[channel].gain.setTargetAtTime(value, ctx.currentTime, 0.05);
    },
    setEcho({ amount, time, repeats, color }: Echo) {
      const now = ctx.currentTime;
      echoIn.gain.setTargetAtTime(amount, now, 0.05);
      delay.delayTime.setTargetAtTime(time, now, 0.1);
      feedback.gain.setTargetAtTime(repeats, now, 0.05);
      damp.frequency.setTargetAtTime(color, now, 0.05);
    },
    setReverb({ amount, size, color }: Reverb) {
      const now = ctx.currentTime;
      reverbIn.gain.setTargetAtTime(amount, now, 0.05);
      reverbColor.frequency.setTargetAtTime(color, now, 0.05);
      // A new room means a new impulse; rebuilt only on a clear change, since it cuts the tail
      if (Math.abs(size - reverbSize) < 0.25) return;
      reverbSize = size;
      const next = ctx.createConvolver();
      next.buffer = noise(ctx, size, 3);
      reverbIn.connect(next).connect(reverbColor);
      reverbIn.disconnect(reverb);
      reverb.disconnect();
      reverb = next;
    },
    setTape({ saturation, wow: slow, flutter: fast }: Tape) {
      const now = ctx.currentTime;
      // Up to ±4 ms at 0.6 Hz and ±0.3 ms at 7 Hz: about a quarter of a semitone each at the top
      wow.gain.setTargetAtTime(slow * 0.004, now, 0.05);
      flutter.gain.setTargetAtTime(fast * 0.0003, now, 0.05);
      // The clipper's slope is 3 at rest, so the made-up gain keeps quiet passages as loud as clean
      const push = 0.3 + saturation * 1.2;
      drive.gain.setTargetAtTime(push, now, 0.05);
      dirty.gain.setTargetAtTime(saturation / (3 * push), now, 0.05);
      clean.gain.setTargetAtTime(1 - saturation, now, 0.05);
      worn.frequency.setTargetAtTime(12000 - saturation * 7000, now, 0.05);
    },
    // Each scene gives the pad and the drone their own sound
    setScene(scene: Scene) {
      setTimbre(TIMBRES[scene]);
    },
    setSynth(value: Synth) {
      synth = value;
    },
    setVolume(value: number) {
      master.gain.setTargetAtTime(value, ctx.currentTime, 0.05);
    },
    // Closes the filter for dark, opens it for light: 200 Hz to 8 kHz
    setLight(value: number) {
      light = value;
      tone.frequency.setTargetAtTime(200 * 40 ** value, ctx.currentTime, 0.2);
    },
    touch(degree: number, brightness: number) {
      bell(degree, brightness, levels.lienzo);
    },
    // How loud it sounds right now, as the RMS of the last few milliseconds
    level() {
      if (ctx.state !== "running") return 0;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      return Math.sqrt(sum / samples.length);
    },
    pause: () => ctx.suspend(),
    resume: () => ctx.resume(),
    destroy() {
      clearInterval(notes);
      clearTimeout(retimbre);
      ctx.close();
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
