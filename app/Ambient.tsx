"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type PointerEvent, type ReactNode } from "react";
import { KEYS, MODES, passed, touchDegree } from "@/lib/ambient";
import { createEngine, type Channel, type Echo, type Engine, type Reverb, type Synth, type Tape } from "./engine";
import { Fader } from "./Fader";
import { Knob } from "./Knob";
import { DEFAULT_BINDINGS, noteDegree } from "./midi";
import { randomPreset } from "./preset";
import { MAX_STARS, skyColors, startSky } from "./sky";

const CHANNELS: { channel: Channel; label: string }[] = [
  { channel: "pad", label: "Pad" },
  { channel: "drone", label: "Drone" },
  { channel: "lluvia", label: "Lluvia" },
  // The notes that fall by themselves, and the ones played by hand or by MIDI
  { channel: "notas", label: "Azar" },
  { channel: "lienzo", label: "Tus notas" },
];
const LEVELS: Record<Channel, number> = { pad: 0.6, drone: 0.4, lluvia: 0.15, notas: 0.5, lienzo: 0.6 };
const ECHO: Echo = { amount: 0.3, time: 0.6, repeats: 0.45, color: 2500 };
const REVERB: Reverb = { amount: 0.4, size: 5, color: 6000 };
const MASTER = { volume: 0.8, light: 0.5, pitch: 0 };
const SYNTH: Synth = { wave: "sine", attack: 0.01, decay: 3.5, cutoff: 6000, resonance: 1 };
// A touch of tape from the start, so it sounds worn before anyone reaches for it
const TAPE: Tape = { saturation: 0.2, wow: 0.15, flutter: 0.15 };
const WAVES: { wave: OscillatorType; label: string; symbol: string }[] = [
  { wave: "sine", label: "Sine", symbol: "∿" },
  { wave: "triangle", label: "Triangle", symbol: "△" },
  { wave: "sawtooth", label: "Saw", symbol: "⩘" },
  { wave: "square", label: "Square", symbol: "⊓" },
];
// Only the picture: chaos is how much the arc writhes
const VISUAL = { chaos: 1 };
// How long the controls stay over the sky after the last move
const BAR_MS = 10_000;
const MIDI_KEY = "ambient-midi";
const SECTIONS = ["Mixer", "Oscillator", "Le Jazz", "Tape", "FX", "Ciel", "Output"];
// The faders at the end: the master volume and how loud each effect comes back
const OUTPUTS = ["Volume", "Reverb", "Delay"];
// Empty, recording the first pass, playing it round, or playing it while recording on top
type Looper = "empty" | "recording" | "playing" | "overdub";
const LOOPER_LABELS: Record<Looper, string> = { empty: "", recording: "● Rec", playing: "⟳ Loop", overdub: "● Encima" };
const POWER = "M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0";
const EXPAND = "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5";
const SHRINK = "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5";
const INFO = "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 8h.01M12 11v5";
const percent = (v: number) => `${Math.round(v * 100)}%`;
const seconds = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(1)}s`);
const kHz = (v: number) => `${(v / 1000).toFixed(1)}k`;

type Settings = { key: number; scale: number[]; levels: typeof LEVELS; echo: Echo; reverb: Reverb; master: typeof MASTER; synth: Synth; tape: Tape };

function sync(e: Engine, { key, scale, levels, echo, reverb, master, synth, tape }: Settings) {
  e.setKey(key, scale);
  for (const { channel } of CHANNELS) e.setLevel(channel, levels[channel]);
  e.setEcho(echo);
  e.setReverb(reverb);
  e.setVolume(master.volume);
  e.setLight(master.light);
  e.setPitch(master.pitch);
  e.setSynth(synth);
  e.setTape(tape);
}

// A note's star, kept as a degree so one set off with an older scale still lands in a column
type Ripple = { degree: number; y: number; at: number };

export function Ambient() {
  const engine = useRef<Engine>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ripples = useRef<Ripple[]>([]);
  const lastDegree = useRef<number>(null);
  const [on, setOn] = useState(false);
  const [bar, setBar] = useState(true);
  // Whether the browser's own bars are hidden too
  const [fullscreen, setFullscreen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const [midi, setMidi] = useState<"off" | "on" | "unavailable">("off");
  // Not assigning (false), assigning with no knob picked yet (null), or the knob waiting for a control
  const [learn, setLearn] = useState<string | null | false>(false);
  // On a phone the controls are a sheet showing one section at a time, and fold down to its tabs
  const [tab, setTab] = useState("Mixer");
  const [sheet, setSheet] = useState(true);
  const access = useRef<MIDIAccess>(null);
  // Which knob each controller number turns, by its label
  const bindings = useRef(DEFAULT_BINDINGS);
  const onMidi = useRef<(data: Uint8Array) => void>(() => {});
  const info = useRef<HTMLDialogElement>(null);
  // The computer keyboard's octave, moved with Z and X
  const octave = useRef(0);
  const [looper, setLooper] = useState<Looper>("empty");
  // The loop's notes, each at its time (ms) from the loop's start and in the layer it was recorded
  // in, the first pass being 0; one recorded on top keeps when it was played, so the pass it was
  // played in doesn't play it again straight away
  const loop = useRef<{
    start: number;
    length: number;
    layer: number;
    notes: { t: number; degree: number; brightness: number; layer: number; at?: number }[];
  }>({ start: 0, length: 0, layer: 0, notes: [] });
  const [levels, setLevels] = useState(LEVELS);
  const [echo, setEcho] = useState(ECHO);
  const [reverb, setReverb] = useState(REVERB);
  const [master, setMaster] = useState(MASTER);
  const [visual, setVisual] = useState(VISUAL);
  const [synth, setSynth] = useState(SYNTH);
  const [tape, setTape] = useState(TAPE);
  const [key, setKey] = useState(9);
  const [mode, setMode] = useState("Dórico");
  const scale = MODES[mode];

  // Every visit opens on a different sky and sound. Drawn after hydrating, since the server can't
  // know the draw, but before the first paint, so the defaults never show; double clicks still go
  // back to the defaults
  useLayoutEffect(() => {
    const p = randomPreset();
    /* eslint-disable react-hooks/set-state-in-effect */
    setKey(p.key);
    setMode(p.mode);
    setLevels(p.levels);
    setSynth(p.synth);
    setEcho(p.echo);
    setReverb(p.reverb);
    setTape(p.tape);
    setMaster((s) => ({ ...s, light: p.light }));
    setVisual({ chaos: p.chaos });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (engine.current) sync(engine.current, { key, scale, levels, echo, reverb, master, synth, tape });
  }, [key, scale, levels, echo, reverb, master, synth, tape]);
  useEffect(() => () => engine.current?.destroy(), []);

  // The sky always fills the window. The controls come up over it on any move, tap or key and
  // fade after a while still, unless they are in use: pointed at, focused from the keyboard,
  // assigning MIDI, or not playing yet, when they show where to start
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const busy = () => !on || learn !== false || !!panel.current?.matches(":hover, :has(:focus-visible)");
    const rest = () => (busy() ? (timer = setTimeout(rest, BAR_MS)) : setBar(false));
    const wake = () => {
      setBar(true);
      clearTimeout(timer);
      timer = setTimeout(rest, BAR_MS);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    for (const e of events) addEventListener(e, wake);
    wake();
    return () => {
      clearTimeout(timer);
      for (const e of events) removeEventListener(e, wake);
    };
  }, [on, learn]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Every connected input, and any plugged in later, feeds the handler above
  useEffect(() => {
    const a = access.current;
    if (midi !== "on" || !a) return;
    const listen = (e: MIDIMessageEvent) => e.data && onMidi.current(e.data);
    const attach = () => a.inputs.forEach((input) => (input.onmidimessage = listen));
    attach();
    a.onstatechange = attach;
    return () => {
      a.onstatechange = null;
      a.inputs.forEach((input) => (input.onmidimessage = null));
    };
  }, [midi]);

  async function connectMidi() {
    if (midi === "on") return setLearn(learn === false ? null : false);
    // A click is the only moment the browser lets sound start, and MIDI notes come later
    start();
    try {
      access.current = await navigator.requestMIDIAccess();
      try {
        bindings.current = { ...DEFAULT_BINDINGS, ...JSON.parse(localStorage.getItem(MIDI_KEY) ?? "{}") };
      } catch {}
      setMidi("on");
    } catch {
      // No Web MIDI (Safari), or the visitor said no
      setMidi("unavailable");
    }
  }

  function toggleFullscreen() {
    // Where the browser can; an iPhone can't, and keeps its bars
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  // What the horizon reads each frame; a ref, so turning a knob doesn't restart the loop
  const look = useRef({ levels, echo, reverb, master, visual, mode });
  useEffect(() => {
    look.current = { levels, echo, reverb, master, visual, mode };
  }, [levels, echo, reverb, master, visual, mode]);

  // The sky follows the sound: the drone is the wind, the mode picks its colours and the light runs
  // them from night through dawn and day to sunset, the pad and how loud it plays thicken the
  // clouds, pitch warms or cools them, the reverb's size softens them, chaos makes them writhe and
  // lluvia rains from them. Every note you play lights the cloud where you touched from within and
  // parts it, pulsed again by the eco and spread by the reverb. Reduced motion holds the sky still.
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const stars = new Float32Array(MAX_STARS * 4);
    let time = 0;
    let pulse = 0;
    let last = performance.now();
    return startSky(canvas.current!, () => {
      const { levels, echo, reverb, master, visual, mode } = look.current;
      const now = performance.now();
      const still = reduced.matches;
      if (!still) time += ((now - last) / 1000) * (0.3 + levels.drone * 1.5);
      last = now;
      // Eased, so the arc breathes with the sound instead of flickering on every sample
      pulse += (Math.min(1, (engine.current?.level() ?? 0) * 4) - pulse) * (still ? 0 : 0.15);

      const linger = 1500 + reverb.amount * reverb.size * 500;
      const echoes = echo.amount > 0.01 ? Math.round(echo.repeats * 10) : 0;
      const echoMs = echo.time * 1000;
      ripples.current = ripples.current.filter((r) => now - r.at < linger + echoes * echoMs);
      stars.fill(1);
      let n = 0;
      // A MIDI note can land past the canvas's two octaves; it wraps back into them
      const columns = 2 * scale.length;
      for (const r of ripples.current) {
        for (let k = 0; k <= echoes && n < MAX_STARS; k++) {
          const age = now - r.at - k * echoMs;
          if (age < 0 || age > linger) continue;
          stars.set([((((r.degree % columns) + columns) % columns) + 0.5) / columns, 1 - r.y, age / linger, k === 0 ? 1 : Math.min(1, echo.repeats ** k * echo.amount * 2)], n++ * 4);
        }
      }

      return {
        time,
        colors: skyColors(mode, master.light, master.pitch),
        rain: levels.lluvia,
        clock: still ? 0 : now / 1000,
        pad: levels.pad,
        halo: reverb.amount,
        warp: visual.chaos,
        width: 0.4 + (reverb.size / 10) * 1.2,
        pulse,
        stars,
      };
    });
  }, [scale.length]);

  function start() {
    // iOS keeps Web Audio silent with the ringer switch off unless the page asks to play like media
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
    // Synced here too, not left to the effect: a first tap on the canvas plays its note straight away
    if (!engine.current) sync((engine.current = createEngine()), { key, scale, levels, echo, reverb, master, synth, tape });
    engine.current.resume();
    setOn(true);
  }

  function toggle() {
    if (!on) return start();
    engine.current?.pause();
    setOn(false);
  }

  function play(degree: number, brightness: number) {
    if (!on) start();
    engine.current!.touch(degree, brightness);
    const now = performance.now();
    ripples.current.push({ degree, y: 1 - brightness, at: now });
    const l = loop.current;
    if (looper === "recording") l.notes.push({ t: now - l.start, degree, brightness, layer: 0 });
    if (looper === "overdub") l.notes.push({ t: (now - l.start) % l.length, degree, brightness, layer: l.layer, at: now });
  }

  // Space, like a looper pedal: record, close the loop and play it round, record on top, stop
  // recording on top. Closing a pass with nothing in it leaves the looper empty.
  function pedal() {
    const now = performance.now();
    const l = loop.current;
    if (looper === "empty") {
      if (!on) start();
      loop.current = { start: now, length: 0, layer: 0, notes: [] };
      return setLooper("recording");
    }
    if (looper === "recording") {
      if (!l.notes.length) return setLooper("empty");
      l.length = now - l.start;
      l.start = now;
      return setLooper("playing");
    }
    if (looper === "playing") l.layer++;
    setLooper(looper === "playing" ? "overdub" : "playing");
  }

  // Ctrl/Cmd+Z takes off the last layer: the one being recorded on top, or the newest one kept;
  // taking off the first pass empties the looper
  function undo() {
    const l = loop.current;
    if (looper === "empty") return;
    if (looper === "recording") return setLooper("empty");
    const top = looper === "overdub" ? l.layer : Math.max(...l.notes.map((n) => n.layer));
    l.notes = l.notes.filter((n) => n.layer !== top);
    if (!l.notes.length) return setLooper("empty");
    l.layer = Math.max(...l.notes.map((n) => n.layer));
    setLooper("playing");
  }

  // Plays the loop's notes as the clock passes them, coming round again at its end.
  // shortcut: a 20 ms tick, so notes land up to that late and a hidden tab bunches them; scheduling
  // on the audio clock would be exact if it ever matters
  const looping = looper === "playing" || looper === "overdub";
  useEffect(() => {
    if (!looping) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const { start, length, notes } = loop.current;
      const from = (last - start) % length;
      const to = (now - start) % length;
      last = now;
      for (const n of notes) {
        if (!passed(n.t, from, to) || (n.at !== undefined && now - n.at < 100)) continue;
        engine.current?.touch(n.degree, n.brightness);
        ripples.current.push({ degree: n.degree, y: 1 - n.brightness, at: now });
      }
    }, 20);
    return () => clearInterval(id);
  }, [looping]);

  function onPointer(e: PointerEvent<HTMLCanvasElement>) {
    if (e.type === "pointermove" && e.buttons === 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const degree = touchDegree((e.clientX - box.left) / box.width, scale.length);
    // Dragging plays a note each time it crosses into a new column, not on every pixel
    if (e.type === "pointermove" && degree === lastDegree.current) return;
    lastDegree.current = degree;
    play(degree, 1 - Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)));
  }

  // 1 to 9 and 0 play ten degrees anywhere on the page, unless typing or choosing in a field;
  // Z and X move them down and up an octave, two each way at most
  useEffect(() => {
    const press = (e: globalThis.KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement).closest("input, select, textarea")) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        return undo();
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const shift = { z: -1, x: 1 }[e.key.toLowerCase()];
      if (shift) octave.current = Math.min(2, Math.max(-2, octave.current + shift));
      const n = "1234567890".indexOf(e.key);
      if (n >= 0) play(n + octave.current * scale.length, 0.5);
      // Not on a focused button or the settings toggle, where Space already means press
      if (e.code === "Space" && !(e.target as HTMLElement).closest("button, summary")) {
        e.preventDefault();
        pedal();
      }
      if (e.key === "Backspace") setLooper("empty");
    };
    addEventListener("keydown", press);
    return () => removeEventListener("keydown", press);
  });

  const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

  // The main knobs: the mix and its sounds, then what colours them
  const sounds: ComponentProps<typeof Knob>[] = [
    { label: "Volume", value: master.volume, min: 0, max: 1, initial: MASTER.volume, onChange: (volume) => setMaster((s) => ({ ...s, volume })), format: percent },
    ...CHANNELS.map(({ channel, label }) => ({
      label,
      value: levels[channel],
      min: 0,
      max: 1,
      initial: LEVELS[channel],
      onChange: (v: number) => setLevels((s) => ({ ...s, [channel]: v })),
      format: percent,
    })),
  ];
  const shades: ComponentProps<typeof Knob>[] = [
    // Turned all the way down is darkness
    { label: "Luz", value: master.light, min: 0, max: 1, initial: MASTER.light, onChange: (light) => setMaster((s) => ({ ...s, light })), format: percent },
    { label: "Pitch", value: master.pitch, min: -12, max: 12, initial: MASTER.pitch, onChange: (pitch) => setMaster((s) => ({ ...s, pitch })), format: signed },
    { label: "Delay", value: echo.amount, min: 0, max: 1, initial: ECHO.amount, onChange: (amount) => setEcho((s) => ({ ...s, amount })), format: percent },
    { label: "Reverb", value: reverb.amount, min: 0, max: 1, initial: REVERB.amount, onChange: (amount) => setReverb((s) => ({ ...s, amount })), format: percent },
  ];
  const synthKnobs: ComponentProps<typeof Knob>[] = [
    { label: "Attack", value: synth.attack, min: 0.005, max: 2, initial: SYNTH.attack, onChange: (attack) => setSynth((s) => ({ ...s, attack })), format: seconds },
    { label: "Decay", value: synth.decay, min: 0.3, max: 8, initial: SYNTH.decay, onChange: (decay) => setSynth((s) => ({ ...s, decay })), format: seconds },
    { label: "Cutoff", value: synth.cutoff, min: 200, max: 12000, initial: SYNTH.cutoff, onChange: (cutoff) => setSynth((s) => ({ ...s, cutoff })), format: kHz },
    { label: "Resonance", value: synth.resonance, min: 0.5, max: 15, initial: SYNTH.resonance, onChange: (resonance) => setSynth((s) => ({ ...s, resonance })), format: (v) => v.toFixed(1) },
  ];
  const waves = (
    // Rounded keys like a sequencer's pads, the chosen one filled
    <div role="radiogroup" aria-label="Onda" className="grid grid-cols-2 gap-1">
      {WAVES.map(({ wave, label, symbol }) => (
        <button
          key={wave}
          role="radio"
          aria-checked={synth.wave === wave}
          aria-label={label}
          title={label}
          onClick={() => setSynth((s) => ({ ...s, wave }))}
          className="flex size-7 items-center justify-center rounded-md border border-white/60 text-base leading-none normal-case hover:opacity-80 aria-checked:border-white aria-checked:bg-white aria-checked:text-fondo aria-checked:[text-shadow:none]"
        >
          {symbol}
        </button>
      ))}
    </div>
  );
  const extras: ComponentProps<typeof Knob>[] = [
    { label: "Delay time", value: echo.time, min: 0.05, max: 1.5, initial: ECHO.time, onChange: (time) => setEcho((s) => ({ ...s, time })), format: (v) => `${Math.round(v * 1000)}ms` },
    { label: "Feedback", value: echo.repeats, min: 0, max: 0.9, initial: ECHO.repeats, onChange: (repeats) => setEcho((s) => ({ ...s, repeats })), format: percent },
    { label: "Delay tone", value: echo.color, min: 400, max: 8000, initial: ECHO.color, onChange: (color) => setEcho((s) => ({ ...s, color })), format: kHz },
    { label: "Size", value: reverb.size, min: 1, max: 10, initial: REVERB.size, onChange: (size) => setReverb((s) => ({ ...s, size })), format: (v) => `${v.toFixed(1)}s` },
    { label: "Reverb tone", value: reverb.color, min: 400, max: 12000, initial: REVERB.color, onChange: (color) => setReverb((s) => ({ ...s, color })), format: kHz },
    { label: "Caos", value: visual.chaos, min: 0, max: 4, initial: VISUAL.chaos, onChange: (chaos) => setVisual((s) => ({ ...s, chaos })), format: (v) => v.toFixed(1) },
  ];
  const tapeKnobs: ComponentProps<typeof Knob>[] = [
    { label: "Saturación", value: tape.saturation, min: 0, max: 1, initial: TAPE.saturation, onChange: (saturation) => setTape((s) => ({ ...s, saturation })), format: percent },
    { label: "Wow", value: tape.wow, min: 0, max: 1, initial: TAPE.wow, onChange: (wow) => setTape((s) => ({ ...s, wow })), format: percent },
    { label: "Flutter", value: tape.flutter, min: 0, max: 1, initial: TAPE.flutter, onChange: (flutter) => setTape((s) => ({ ...s, flutter })), format: percent },
  ];
  // Clicking a knob picks it while assigning MIDI
  const learnable = (knob: ComponentProps<typeof Knob>) => ({ ...knob, selected: learn === knob.label, onSelect: learn === false ? undefined : () => setLearn(knob.label) });

  // A note plays like a touch on the sky; a control turns the knob bound to it, or binds to the
  // one picked while assigning. Refreshed every render so it always sees the latest state.
  useEffect(() => {
    onMidi.current = ([status, a, b]) => {
      const type = status & 0xf0;
      if (type === 0x90 && b > 0) return play(noteDegree(a, key, scale), b / 127);
      if (type !== 0xb0) return;
      if (learn) {
        bindings.current = { ...Object.fromEntries(Object.entries(bindings.current).filter(([, label]) => label !== learn)), [a]: learn };
        try {
          localStorage.setItem(MIDI_KEY, JSON.stringify(bindings.current));
        } catch {}
        return setLearn(null);
      }
      const knob = [...sounds, ...shades, ...extras, ...synthKnobs, ...tapeKnobs].find((k) => k.label === bindings.current[a]);
      knob?.onChange(knob.min + (b / 127) * (knob.max - knob.min));
    };
  });

  const tuning = (
    <>
      <label className="flex flex-col gap-1">
        Key
        <select value={key} onChange={(e) => setKey(Number(e.target.value))} className="rounded-md border border-white/50 bg-black/25 px-2 py-1 [&>option]:bg-fondo">
          {KEYS.map((k, i) => (
            <option key={k} value={i}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Mode
        <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-md border border-white/50 bg-black/25 px-2 py-1 [&>option]:bg-fondo">
          {Object.keys(MODES).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
    </>
  );
  const midiButton = (
    <button
      onClick={connectMidi}
      aria-pressed={learn !== false}
      className="rounded-md border-[1.5px] border-current px-2 py-1 hover:text-white aria-pressed:border-activo aria-pressed:bg-activo aria-pressed:text-fondo aria-pressed:[text-shadow:none]"
    >
      {midi !== "on" ? "Conectar MIDI" : learn === false ? "Asignar MIDI" : "Hecho"}
    </button>
  );

  // A section shows in the phone's sheet only while its tab is picked and the sheet is up
  const onPhone = (title: string) => (sheet && tab === title ? "w-full" : "hidden");

  // Hidden controls fade out with the pointer, leaving the sky alone
  const fade = `transition-opacity duration-700 motion-reduce:transition-none ${bar ? "" : "pointer-events-none opacity-0"}`;

  const byLabel = Object.fromEntries([...sounds, ...shades, ...extras, ...synthKnobs, ...tapeKnobs].map((knob) => [knob.label, knob]));
  const knob = (label: string, small?: "small") => <Knob key={label} {...learnable(byLabel[label])} small={!!small} />;
  const fine = (labels: string[]) => labels.map((label) => knob(label, "small"));
  // The levels slide like a mixing desk's, the main volume with a master's wider cap
  const fader = (label: string, tall?: boolean) => <Fader key={label} {...learnable(byLabel[label])} tall={tall} master={label === "Volume"} />;
  const faders = (tall?: boolean) => CHANNELS.map(({ label }) => fader(label, tall));
  const midiControls = (
    <div className="flex flex-col items-center gap-1">
      {midiButton}
      <p className="max-w-40 text-center normal-case" aria-live="polite">
        {midi === "unavailable"
          ? "Este navegador no tiene MIDI; prueba con Chrome"
          : learn === null
            ? "Pulsa un knob y mueve un mando del controlador"
            : learn
              ? `Mueve un mando para ${learn}`
              : midi === "on"
                ? "Teclado y knobs conectados"
                : ""}
      </p>
    </div>
  );

  return (
    // The sky fills the window, and over it, in white, the controls along the bottom, in sections
    // after the Minimoog's in the order the sound flows
    <>
      {/* The sky, behind everything */}
      <div className={`fixed inset-0 bg-black ${bar ? "" : "cursor-none"}`}>
        <canvas
          ref={canvas}
          tabIndex={0}
          role="application"
          aria-label="Cielo: toca o arrastra para soltar notas, más agudas a la derecha y más brillantes arriba. Con el teclado, las teclas del 1 al 0 en cualquier parte de la página."
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerUp={() => (lastDegree.current = null)}
          className="absolute inset-0 block size-full touch-none -outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
        />
        <p aria-live="polite" className="absolute top-3 left-3 font-mono text-xs text-white uppercase drop-shadow">
          {LOOPER_LABELS[looper]}
        </p>
        <div className={`absolute top-2 right-2 text-white drop-shadow ${fade}`}>
          <RoundButton bare label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} path={fullscreen ? SHRINK : EXPAND} onClick={toggleFullscreen} />
        </div>
      </div>
      <h1 className="sr-only">Le Ciel</h1>
      {/* The controls, to tell whether they are in use */}
      <div ref={panel} className="contents">
        {/* Every control, small along the bottom, each section with its fine knobs out; wraps where it
            doesn't fit. In the order the sound flows: the mix, what plays and in which key, the tape it
            goes through, the effects, the sky it draws, and out */}
        <div
          className={`fixed inset-x-0 bottom-0 flex flex-wrap items-start justify-center gap-x-5 gap-y-3 bg-linear-to-t from-black/40 via-black/15 to-transparent px-4 pt-14 pb-4 font-mono text-[9px] text-white uppercase [text-shadow:0_1px_3px_rgb(0_0_0/0.45)] max-sm:hidden ${fade}`}
        >
          <Section title="Mixer" small>
            {faders()}
          </Section>
          <div className="flex flex-col items-start gap-3">
            <Section title="Oscillator" small>
              <div className="w-16 self-center">{waves}</div>
              {fine(["Cutoff", "Resonance", "Attack", "Decay"])}
            </Section>
            <Section title="Le Jazz" small>
              <div className="grid w-40 grid-cols-2 gap-2">{tuning}</div>
            </Section>
          </div>
          <Section title="Tape" small>
            {fine(["Saturación", "Wow", "Flutter", "Pitch"])}
          </Section>
          <Section title="FX" small>
            {fine(["Delay time", "Feedback", "Delay tone", "Size", "Reverb tone"])}
          </Section>
          <Section title="Ciel" small>
            {fine(["Luz", "Caos"])}
          </Section>
          {/* The master and the two effect returns, like a desk's */}
          <Section title="Output" small>
            {OUTPUTS.map((label) => fader(label))}
            <div className="flex flex-col items-center gap-2 self-center">
              <div className="flex items-center gap-2">
                <RoundButton label={on ? "Apagar" : "Encender"} path={POWER} pressed={on} onClick={toggle} />
                <RoundButton bare label="Cómo funciona" path={INFO} onClick={() => info.current?.showModal()} />
              </div>
              {midiControls}
            </div>
          </Section>
        </div>
        {/* On a phone, a sheet along the bottom showing one section at a time */}
        <div className={`fixed inset-x-0 bottom-0 z-10 sm:hidden ${fade}`}>
          <div className="flex max-h-[60svh] flex-col gap-y-3 overflow-y-auto rounded-t-2xl bg-black/45 px-2 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] font-mono text-[9px] text-white uppercase backdrop-blur-md [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]">
            {/* A tab per section, the power button, and the fold */}
            <div role="tablist" aria-label="Secciones" className="flex items-center gap-1">
              <div className="flex flex-1 gap-1 overflow-x-auto">
                {SECTIONS.map((title) => (
                  <button
                    key={title}
                    role="tab"
                    aria-selected={sheet && tab === title}
                    onClick={() => {
                      setTab(title);
                      setSheet(true);
                    }}
                    className="shrink-0 rounded-md px-2 py-1.5 font-bold tracking-[0.15em] text-line/60 uppercase aria-selected:bg-line/10 aria-selected:text-line"
                  >
                    {title}
                  </button>
                ))}
              </div>
              <RoundButton label={on ? "Apagar" : "Encender"} path={POWER} pressed={on} onClick={toggle} />
              <button onClick={() => setSheet(!sheet)} aria-expanded={sheet} aria-label={sheet ? "Plegar controles" : "Desplegar controles"} className="px-2 text-sm">
                {sheet ? "▾" : "▴"}
              </button>
            </div>
            <Section title="Mixer" className={onPhone("Mixer")}>
              {faders(true)}
            </Section>
            <Section title="Oscillator" className={onPhone("Oscillator")} fine={fine(["Attack", "Decay"])}>
              <div className="w-16 self-center">{waves}</div>
              {knob("Cutoff")}
              {knob("Resonance")}
            </Section>
            <Section title="Le Jazz" className={onPhone("Le Jazz")}>
              <div className="grid w-40 grid-cols-2 gap-2">{tuning}</div>
            </Section>
            <Section title="Tape" className={onPhone("Tape")}>
              {["Saturación", "Wow", "Flutter", "Pitch"].map((label) => knob(label))}
            </Section>
            <Section title="FX" className={onPhone("FX")} fine={<div className="flex gap-4">{["Size", "Reverb tone"].map((label) => knob(label))}</div>}>
              {["Delay time", "Feedback", "Delay tone"].map((label) => knob(label))}
            </Section>
            <Section title="Ciel" className={onPhone("Ciel")}>
              {knob("Luz")}
              {knob("Caos")}
            </Section>
            <Section title="Output" className={onPhone("Output")} fine={midiControls}>
              {OUTPUTS.map((label) => fader(label, true))}
              {/* The power button already sits in the tab bar */}
              <div className="self-center">
                <RoundButton bare label="Cómo funciona" path={INFO} onClick={() => info.current?.showModal()} />
              </div>
            </Section>
          </div>
        </div>
      </div>
      {/* A click on the backdrop closes it too; the padding lives inside, so a click there doesn't */}
      <dialog
        ref={info}
        aria-labelledby="como-funciona"
        onClick={(e) => e.target === e.currentTarget && info.current?.close()}
        className="m-auto max-w-md rounded-2xl border-[1.5px] border-line/50 bg-panel text-sm text-line backdrop:bg-black/70"
      >
        <div className="p-6">
          <h2 id="como-funciona" className="font-display text-3xl uppercase">
            Cómo funciona
          </h2>
          <ul className="mt-4 flex flex-col gap-3 font-mono">
            <li>
              <strong>Enciéndelo</strong> con ⏻ y gira los knobs arrastrando arriba o abajo, o con las flechas. Doble clic y vuelven a su valor inicial.
            </li>
            <li>
              <strong>Toca el cielo</strong> para soltar notas: más agudas a la derecha, más brillantes arriba. Arrastrando tocas varias seguidas.
            </li>
            <li>
              <strong>Con el teclado</strong>, las teclas del 1 al 0 tocan diez notas de la escala, y Z y X bajan y suben una octava.
            </li>
            <li>
              <strong>Espacio graba un loop</strong> de las notas que toques: púlsalo para empezar, otra vez para cerrarlo y que suene en bucle, y otra para grabar encima. Ctrl+Z (o Cmd+Z) quita la última capa y Retroceso lo borra entero.
            </li>
            <li>
              <strong>Azar</strong> es el volumen de las notas que caen solas; <strong>Tus notas</strong>, el de las que tocas tú.
            </li>
            <li>
              <strong>Por MIDI</strong>, conecta un teclado o un controlador desde la sección Output (en Chrome, Edge o Firefox). Los knobs de un Akai MPK mini funcionan sin configurar nada, y con Asignar MIDI enlazas cualquier mando a cualquier knob.
            </li>
            <li>
              <strong>Los controles se esconden</strong> si no tocas nada en un rato, y el cielo se queda solo; vuelven al mover el ratón o tocar la pantalla. Con el icono de la esquina, pantalla completa.
            </li>
          </ul>
          <button onClick={() => info.current?.close()} className="mt-6 border border-current px-3 py-1 font-mono uppercase hover:text-white">
            Cerrar
          </button>
        </div>
      </dialog>
    </>
  );
}

// Ringed, or bare (just the icon) where it sits over the sky
function RoundButton({ label, path, pressed, bare, onClick }: { label: string; path: string; pressed?: boolean; bare?: boolean; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={`group flex size-8 shrink-0 items-center justify-center rounded-full hover:opacity-80 ${bare ? "" : "border-[1.5px] border-current aria-pressed:border-activo aria-pressed:bg-activo"}`}
    >
      <svg viewBox="0 0 24 24" className={`group-aria-pressed:text-fondo ${bare ? "size-5" : "size-4"}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
        <path d={path} />
      </svg>
    </button>
  );
}

// One section of the controls, its title printed over it like the Minimoog's: the big knobs, then the fine ones
// small: the bottom strip's, everything in fine knobs and its title showing; otherwise the phone's sheet's,
// where the tabs name it
type SectionProps = { title: string; fine?: ReactNode; small?: boolean; className?: string; children: ReactNode };

function Section({ title, fine, small, className, children }: SectionProps) {
  return (
    <section aria-label={title} className={`relative flex min-w-0 flex-col gap-2.5 ${small ? "" : "px-3 py-2"} ${className ?? ""}`}>
      <h2 className={`font-mono text-[10px] font-bold tracking-[0.15em] text-line/80 ${small ? "" : "sr-only"}`}>{title}</h2>
      <div className={`flex items-start justify-center ${small ? "gap-2" : "gap-4"}`}>{children}</div>
      {fine && <div className="flex items-start justify-center gap-4 pt-2">{fine}</div>}
    </section>
  );
}
