import { describe, expect, it } from "vitest";
import { skyColors } from "./sky";

describe("skyColors", () => {
  it("is the mode's own daylight at half light", () => {
    expect(skyColors("Dórico", 0.5, 0)[0]).toEqual([0x87 / 255, 0xce / 255, 0xeb / 255]);
  });

  it("runs into a dark night and a warm sunset at either end", () => {
    const sum = (c: number[]) => c.reduce((a, b) => a + b);
    const [night] = skyColors("Dórico", 0, 0);
    const [day] = skyColors("Dórico", 0.5, 0);
    const [sunset] = skyColors("Dórico", 1, 0);
    expect(sum(night)).toBeLessThan(sum(day) / 2);
    expect(sunset[0]).toBeGreaterThan(sunset[2]);
  });

  it("blends between stops instead of jumping", () => {
    const dawn = skyColors("Eólico", 0.25, 0)[0][0];
    const day = skyColors("Eólico", 0.5, 0)[0][0];
    const between = skyColors("Eólico", 0.375, 0)[0][0];
    expect(between).toBeCloseTo((dawn + day) / 2, 5);
  });

  it("gives each mode a different day", () => {
    expect(skyColors("Mixolidio", 0.5, 0)[0]).not.toEqual(skyColors("Dórico", 0.5, 0)[0]);
  });

  it("warms the clouds with a low pitch and cools them with a high one, leaving the sky be", () => {
    const [sky, clouds] = skyColors("Dórico", 0.5, 0);
    const [lowSky, low] = skyColors("Dórico", 0.5, -12);
    const [, high] = skyColors("Dórico", 0.5, 12);
    expect(lowSky).toEqual(sky);
    expect(low[0] - low[2]).toBeGreaterThan(clouds[0] - clouds[2]);
    expect(high[2] - high[0]).toBeGreaterThan(clouds[2] - clouds[0]);
  });
});
