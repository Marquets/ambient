import { PAD_CHORD, degreeHz } from "@/lib/ambient";

export type Channel = "pad" | "drone" | "lluvia" | "notas" | "lienzo";
// amount is how much of every channel goes in; time in seconds, repeats the feedback, color the damping in Hz
export type Echo = { amount: number; time: number; repeats: number; color: number };
// size is the tail in seconds
export type Reverb = { amount: number; size: number; color: number };
// How every note sounds: its waveform, attack and decay in seconds, and a low-pass filter (Hz, Q)
export type Synth = { wave: OscillatorType; attack: number; decay: number; cutoff: number; resonance: number };

const NOTE_TICK_MS = 400;

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
  tone.connect(master);

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

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.connect(levels.pad);
  const sweep = ctx.createOscillator();
  sweep.frequency.value = 0.05;
  const sweepDepth = ctx.createGain();
  sweepDepth.gain.value = 400;
  sweep.connect(sweepDepth).connect(padFilter.frequency);
  // Two slightly detuned saws per chord note, so the pad drifts instead of buzzing
  const voices = [0, 1, 2, 3].map(() => {
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    gain.connect(padFilter);
    return [-7, 7].map((detune) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.detune.value = detune;
      osc.connect(gain);
      return osc;
    });
  });

  const drone = [1, 1.5].map((ratio) => {
    const osc = ctx.createOscillator();
    osc.type = ratio === 1 ? "sine" : "triangle";
    const gain = ctx.createGain();
    gain.gain.value = ratio === 1 ? 0.5 : 0.15;
    osc.connect(gain).connect(levels.drone);
    return { osc, ratio };
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
    PAD_CHORD.forEach((degree, i) => voices[i].forEach((osc) => osc.frequency.setTargetAtTime(degreeHz(key + pitch, scale, degree), now, glide)));
    for (const { osc, ratio } of drone) osc.frequency.setTargetAtTime((degreeHz(key + pitch, scale, 0) / 2) * ratio, now, glide);
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

  for (const v of voices) for (const osc of v) osc.start();
  for (const { osc } of drone) osc.start();
  sweep.start();
  rain.start();

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
      ctx.close();
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
