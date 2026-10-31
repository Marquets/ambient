export const KEYS = ["Do", "Do♯", "Re", "Mi♭", "Mi", "Fa", "Fa♯", "Sol", "La♭", "La", "Si♭", "Si"];

// Semitones above the key
export const MODES: Record<string, number[]> = {
  Dórico: [0, 2, 3, 5, 7, 9, 10],
  Lidio: [0, 2, 4, 6, 7, 9, 11],
  Eólico: [0, 2, 3, 5, 7, 8, 10],
  Mixolidio: [0, 2, 4, 5, 7, 9, 10],
  Pentatónica: [0, 3, 5, 7, 10],
};

// The pad holds the key's chord: four degrees stacked a third apart
export const PAD_CHORD = [0, 2, 4, 6];

const C3 = 130.81;

/** Frequency of a scale degree, counting on past the octave; key 0 and degree 0 is C3 */
export function degreeHz(key: number, scale: number[], degree: number) {
  const octave = Math.floor(degree / scale.length);
  return C3 * 2 ** ((key + scale[degree - octave * scale.length]) / 12 + octave);
}

/** Which degree a touch on the pad plays: left to right climbs two octaves of the scale */
export function touchDegree(x: number, scaleLength: number) {
  return Math.min(2 * scaleLength - 1, Math.max(0, Math.floor(x * 2 * scaleLength)));
}

/** Whether a loop note at `t` falls in the stretch the clock just covered, from `from` (exclusive) to
 * `to`, both positions in the loop; when the clock came round, the stretch wraps past the end */
export function passed(t: number, from: number, to: number) {
  return from <= to ? t > from && t <= to : t > from || t <= to;
}
