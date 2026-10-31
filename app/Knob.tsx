"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  initial: number;
  small?: boolean;
  // The panel's main volume, a size up like the Minimoog's output
  big?: boolean;
  // While MIDI is being assigned, a press picks the knob instead of turning it
  selected?: boolean;
  onSelect?(): void;
  onChange(value: number): void;
  format(value: number): string;
};

// Scale marks round the knob, every 27° across its 270° sweep
const TICKS = Array.from({ length: 11 }, (_, i) => -135 + i * 27);
// Pixels of vertical drag that sweep the whole range, and arrow presses that do
const TRAVEL = 150;
const STEPS = 24;

/** Turned by dragging up or down; arrows step through it, a double click puts it back where it started */
export function Knob({ label, value, min, max, initial, small, big, selected, onSelect, onChange, format }: Props) {
  const drag = useRef<{ y: number; value: number }>(null);
  const [turning, setTurning] = useState(false);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const step = (max - min) / STEPS;
  const sweep = ((value - min) / (max - min)) * 270;
  // Small knobs light up in their line colour, the main ones in orange and the volume in a hotter one
  const accent = small ? "text-line" : big ? "text-vivo" : "text-knob";

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (onSelect) return onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, value };
    setTurning(true);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (drag.current) onChange(clamp(drag.current.value + ((drag.current.y - e.clientY) / TRAVEL) * (max - min)));
  }

  function onPointerUp() {
    drag.current = null;
    setTurning(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (onSelect && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      return onSelect();
    }
    const next = { ArrowUp: value + step, ArrowRight: value + step, ArrowDown: value - step, ArrowLeft: value - step, Home: min, End: max }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(clamp(next));
  }

  return (
    // The value only shows while the knob is pointed at, focused or turned; the rest of the time the label does
    <div className="group flex flex-col items-center gap-1.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onChange(initial)}
        onKeyDown={onKeyDown}
        className={`relative ${small ? "size-8" : big ? "size-14 hd:size-11 hd2:size-14" : "size-11 hd:size-10 hd2:size-12"} ${accent} ${onSelect ? "cursor-pointer" : "cursor-ns-resize"} ${selected ? "ring-2 ring-activo ring-offset-4 ring-offset-fondo" : ""} touch-none rounded-full outline-offset-6 focus-visible:outline-2 focus-visible:outline-accent`}
      >
        {TICKS.map((tick, i) => (
          <div key={tick} aria-hidden className="absolute -inset-[5px]" style={{ rotate: `${tick}deg` }}>
            <span className={`absolute top-0 left-1/2 h-[3px] w-px -translate-x-1/2 bg-line ${i === 0 || i === TICKS.length - 1 ? "opacity-70" : "opacity-25"}`} />
          </div>
        ))}
        {/* A faint track, and over it the value as an arc in the knob's colour */}
        <span aria-hidden className="absolute inset-0 rounded-full border-2 border-line/15" />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from -135deg, currentColor ${sweep}deg, transparent 0)`,
            mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
          }}
        />
        {/* The cap, and on it a short pointer */}
        <span aria-hidden className="absolute inset-[22%] rounded-full bg-line/10" />
        <div aria-hidden className="absolute inset-0" style={{ rotate: `${sweep - 135}deg` }}>
          <span className="absolute top-[26%] left-1/2 h-[24%] w-0.5 -translate-x-1/2 rounded-full bg-current" />
        </div>
      </div>
      {/* The value takes the label's place, so showing it never makes the panel taller */}
      <span aria-hidden className="grid text-center leading-none tracking-wider *:[grid-area:1/1]">
        <span className={`transition-opacity motion-reduce:transition-none ${turning ? "opacity-0" : "group-hover:opacity-0 group-focus-within:opacity-0"}`}>{label}</span>
        <span className={`text-line tabular-nums transition-opacity motion-reduce:transition-none ${turning ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
          {format(value)}
        </span>
      </span>
    </div>
  );
}
