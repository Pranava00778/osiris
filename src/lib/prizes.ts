// Public wheel config: labels and tiers only. Weights and stock live in prizes.server.ts.
// Wedges are drawn clockwise from the top in this order; keep in sync with prizes.server.ts.
export const STUDIO = "Osiris Forge Studio";
export const CLAIM_TEXT = "Show this code at the Osiris Forge Studio stall to claim your prize.";

export type Wedge = { id: string; label: string; desc: string; tier: 0 | 1 | 2 | 3; wins: boolean };

export const WEDGES: Wedge[] = [
  { id: "off5a", label: "5% OFF", desc: "5% off any purchase at the stall", tier: 1, wins: true },
  { id: "off10", label: "10% OFF", desc: "10% off any purchase at the stall", tier: 1, wins: true },
  { id: "off15", label: "15% OFF", desc: "15% off any purchase at the stall", tier: 2, wins: true },
  { id: "bookmark", label: "BOOKMARK", desc: "One free bookmark", tier: 2, wins: true },
  { id: "mystery", label: "MYSTERY MINI", desc: "One free mystery mini figurine", tier: 3, wins: true },
  { id: "nahuh", label: "NAH UH", desc: "The forge says no. Nothing this time.", tier: 0, wins: false },
];

// Previously issued codes keep their original prize, but cannot be drawn again.
export const LEGACY_PRIZES: Wedge[] = [
  { id: "sticker", label: "FREE STICKER", desc: "One free sticker", tier: 2, wins: true },
  { id: "off5b", label: "5% OFF", desc: "5% off any purchase at the stall", tier: 1, wins: true },
  { id: "off20", label: "20% OFF", desc: "20% off any purchase at the stall", tier: 2, wins: true },
  { id: "grand", label: "50% OFF", desc: "50% off one figurine of your choice", tier: 3, wins: true },
];

export function findPrize(id: string) {
  return WEDGES.find((w) => w.id === id) ?? LEGACY_PRIZES.find((w) => w.id === id);
}

export const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

export function normaliseCode(raw: unknown): string | null {
  const c = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CODE_RE.test(c) ? c : null;
}
