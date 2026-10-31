import { describe, expect, it } from "vitest";
import { MODES } from "@/lib/ambient";
import { noteDegree } from "./midi";

describe("noteDegree", () => {
  const la = 9;
  const dorian = MODES.Dórico;

  it("plays the key's root on the A above middle C", () => {
    expect(noteDegree(69, la, dorian)).toBe(0);
  });

  it("climbs the scale and carries on through the octaves", () => {
    expect(noteDegree(71, la, dorian)).toBe(1);
    expect(noteDegree(81, la, dorian)).toBe(7);
    expect(noteDegree(57, la, dorian)).toBe(-7);
  });

  it("drops a note outside the scale to the one below", () => {
    expect(noteDegree(70, la, dorian)).toBe(0);
    expect(noteDegree(68, la, dorian)).toBe(-1);
  });
});
