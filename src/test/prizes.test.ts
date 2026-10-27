import { describe, expect, it } from "vitest";
import { findPrize, WEDGES } from "@/lib/prizes";
import { PRIZE_ODDS } from "@/lib/prizes.server";

describe("wheel prize eligibility", () => {
  it("offers the five prizes plus the dud wedge", () => {
    expect(WEDGES.map((p) => p.id)).toEqual(["off5a", "off10", "off15", "bookmark", "mystery", "nahuh"]);
    expect(PRIZE_ODDS.map((p) => p.id)).toEqual(WEDGES.map((p) => p.id));
    expect(PRIZE_ODDS.filter((p) => p.id !== "nahuh").every((p) => p.weight > 0)).toBe(true);
  });

  it("never draws nah uh, keeps mystery mini at 5%, and weights total 100", () => {
    const w = Object.fromEntries(PRIZE_ODDS.map((p) => [p.id, p.weight]));
    expect(w["nahuh"]).toBe(0);
    expect(w["mystery"]).toBe(5);
    expect(PRIZE_ODDS.reduce((n, p) => n + p.weight, 0)).toBe(100);
  });

  it("makes only nah uh the segment that wins nothing", () => {
    expect(WEDGES.filter((p) => !p.wins).map((p) => p.id)).toEqual(["nahuh"]);
    expect(findPrize("nahuh")?.label).toBe("NAH UH");
  });

  it("keeps previously issued prizes redeemable without making them eligible", () => {
    expect(findPrize("grand")?.desc).toBe("50% off one figurine of your choice");
    expect(PRIZE_ODDS.some((p) => p.id === "grand")).toBe(false);
  });
});