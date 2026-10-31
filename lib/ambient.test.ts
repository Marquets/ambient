import { describe, expect, it } from "vitest";
import { MODES, degreeHz, passed, touchDegree } from "./ambient";

describe("degreeHz", () => {
  it("tunes the key's root", () => {
    expect(degreeHz(9, MODES.Eólico, 0)).toBeCloseTo(220, 1);
  });

  it("carries on into the next octave", () => {
    expect(degreeHz(0, MODES.Pentatónica, 5)).toBeCloseTo(261.62, 1);
    expect(degreeHz(0, MODES.Dórico, 9)).toBeCloseTo(2 * degreeHz(0, MODES.Dórico, 2), 5);
  });
});

describe("touchDegree", () => {
  it("spans two octaves across the pad without running off either edge", () => {
    expect(touchDegree(0, 7)).toBe(0);
    expect(touchDegree(0.5, 7)).toBe(7);
    expect(touchDegree(1, 7)).toBe(13);
    expect(touchDegree(-0.1, 5)).toBe(0);
  });
});

describe("passed", () => {
  it("catches a note inside the stretch, the end included and the start not", () => {
    expect(passed(150, 100, 200)).toBe(true);
    expect(passed(200, 100, 200)).toBe(true);
    expect(passed(100, 100, 200)).toBe(false);
    expect(passed(250, 100, 200)).toBe(false);
  });

  it("wraps past the loop's end when the clock comes round", () => {
    expect(passed(980, 950, 30)).toBe(true);
    expect(passed(10, 950, 30)).toBe(true);
    expect(passed(0, 950, 30)).toBe(true);
    expect(passed(500, 950, 30)).toBe(false);
  });
});
