"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  initial: number;
  // The phone's sheet has room for a longer throw than the strip along the bottom
  tall?: boolean;
  // The main volume, a wider cap like a desk's master fader
  master?: boolean;
  // While MIDI is being assigned, a press picks the fader instead of moving it
  selected?: boolean;
  onSelect?(): void;
  onChange(value: number): void;
  format(value: number): string;
};

// Scale marks down the side, every tenth of the throw
const TICKS = Array.from({ length: 11 }, (_, i) => i / 10);
const STEPS = 24;

/** A mixing desk's fader: grabbing the track jumps the cap there and dragging slides it; arrows step
 * through it, a double click puts it back where it started */
export function Fader({ label, value, min, max, initial, tall, master, selected, onSelect, onChange, format }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [sliding, setSliding] = useState(false);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const step = (max - min) / STEPS;
  const share = (value - min) / (max - min);

  function slideTo(y: number) {
    const box = track.current!.getBoundingClientRect();
    onChange(clamp(min + (1 - (y - box.top) / box.height) * (max - min)));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (onSelect) return onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSliding(true);
    slideTo(e.clientY);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (sliding) slideTo(e.clientY);
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
    // The value only shows while the fader is pointed at, focused or moved; the rest of the time the label does
    <div className="group flex flex-col items-center gap-1.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setSliding(false)}
        onPointerCancel={() => setSliding(false)}
        onDoubleClick={() => onChange(initial)}
        onKeyDown={onKeyDown}
        className={`relative w-7 py-1.5 ${tall ? "h-32" : "h-20"} ${onSelect ? "cursor-pointer" : "cursor-ns-resize"} ${selected ? "rounded-md ring-2 ring-activo ring-offset-2 ring-offset-transparent" : ""} touch-none outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent`}
      >
        {/* The throw the cap travels, inset by half the cap so it reaches both ends */}
        <div ref={track} className="relative size-full">
          {TICKS.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className={`absolute left-0 h-px -translate-y-1/2 bg-line ${tick === 0 || tick === 1 || tick === 0.5 ? "w-1.5 opacity-70" : "w-1 opacity-25"}`}
              style={{ bottom: `${tick * 100}%` }}
            />
          ))}
          {/* The slot, and up it the level */}
          <span aria-hidden className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-line/20" />
          <span aria-hidden className="absolute bottom-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-line" style={{ height: `${share * 100}%` }} />
          {/* The cap, with a line across where it reads */}
          <span
            aria-hidden
            className={`absolute left-1/2 flex h-3 -translate-x-1/2 translate-y-1/2 items-center rounded-sm bg-line shadow-[0_1px_3px_rgb(0_0_0/0.35)] ${master ? "w-6" : "w-4"}`}
            style={{ bottom: `${share * 100}%` }}
          >
            <span className="h-px w-full bg-fondo/60" />
          </span>
        </div>
      </div>
      {/* The value takes the label's place, so showing it never makes the strip taller */}
      <span aria-hidden className="grid text-center leading-none tracking-wider *:[grid-area:1/1]">
        <span className={`transition-opacity motion-reduce:transition-none ${sliding ? "opacity-0" : "group-hover:opacity-0 group-focus-within:opacity-0"}`}>{label}</span>
        <span className={`text-line tabular-nums transition-opacity motion-reduce:transition-none ${sliding ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
          {format(value)}
        </span>
      </span>
    </div>
  );
}
