import { describe, expect, it } from "vitest";
import { MODES } from "@/lib/ambient";
import { randomPreset } from "./preset";
import { SCENES } from "./sky";

describe("randomPreset", () => {
  it("stays inside each setting's range at either end of the draw", () => {
    for (const random of [() => 0, () => 0.999999]) {
      const p = randomPreset(random);
      expect(p.key).toBeGreaterThanOrEqual(0);
      expect(p.key).toBeLessThan(12);
      expect(Object.keys(MODES)).toContain(p.mode);
      expect(SCENES).toContain(p.scene);
      expect(p.light).toBeGreaterThanOrEqual(0.15);
      expect(p.light).toBeLessThanOrEqual(0.95);
      expect(p.synth.attack).toBeGreaterThanOrEqual(0.005);
      expect(p.synth.attack).toBeLessThanOrEqual(0.405);
      expect(p.tape.saturation).toBeLessThanOrEqual(0.4);
      for (const level of Object.values(p.levels)) expect(level).toBeLessThanOrEqual(0.8);
    }
  });

  it("draws something different each time", () => {
    expect(randomPreset()).not.toEqual(randomPreset());
  });
});
