import { describe, expect, it } from "vitest";
import { skyColors } from "./sky";

describe("skyColors", () => {
  it("is the mode's own daylight at half light", () => {
    expect(skyColors("Dorian", 0.5, 0)[0]).toEqual([0x87 / 255, 0xce / 255, 0xeb / 255]);
  });

  it("runs into a dark night and a warm sunset at either end", () => {
    const sum = (c: number[]) => c.reduce((a, b) => a + b);
    const [night] = skyColors("Dorian", 0, 0);
    const [day] = skyColors("Dorian", 0.5, 0);
    const [sunset] = skyColors("Dorian", 1, 0);
    expect(sum(night)).toBeLessThan(sum(day) / 2);
    expect(sunset[0]).toBeGreaterThan(sunset[2]);
  });

  it("blends between stops instead of jumping", () => {
    const dawn = skyColors("Aeolian", 0.25, 0)[0][0];
    const day = skyColors("Aeolian", 0.5, 0)[0][0];
    const between = skyColors("Aeolian", 0.375, 0)[0][0];
    expect(between).toBeCloseTo((dawn + day) / 2, 5);
  });

  it("gives each mode a different day", () => {
    expect(skyColors("Mixolydian", 0.5, 0)[0]).not.toEqual(skyColors("Dorian", 0.5, 0)[0]);
  });

  it("warms the clouds with a low pitch and cools them with a high one, leaving the sky be", () => {
    const [sky, clouds] = skyColors("Dorian", 0.5, 0);
    const [lowSky, low] = skyColors("Dorian", 0.5, -12);
    const [, high] = skyColors("Dorian", 0.5, 12);
    expect(lowSky).toEqual(sky);
    expect(low[0] - low[2]).toBeGreaterThan(clouds[0] - clouds[2]);
    expect(high[2] - high[0]).toBeGreaterThan(clouds[2] - clouds[0]);
  });
});
