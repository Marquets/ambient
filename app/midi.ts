// The Akai MPK mini's eight knobs send CC 70–77 out of the box; learning a knob overrides these
export const DEFAULT_BINDINGS: Record<number, string> = {
  70: "Volume",
  71: "Pad",
  72: "Drone",
  73: "Rain",
  74: "Random",
  75: "Keys",
  76: "Light",
  77: "Pitch",
};

/** The scale degree a MIDI note plays, counted like the canvas's from the key's root above middle C;
 * a note between two of the scale's falls to the one below */
export function noteDegree(note: number, key: number, scale: number[]) {
  const from = note - 60 - key;
  const octave = Math.floor(from / 12);
  return octave * scale.length + scale.findLastIndex((s) => s <= from - octave * 12);
}
