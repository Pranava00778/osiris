// Prize odds: weight = relative chance (these sum to 100, so each weight is the % chance),
// stock = hard cap (null = unlimited). NAH UH stays on the wheel but can never be drawn (weight 0).
export const PRIZE_ODDS: { id: string; weight: number; stock: number | null }[] = [
  { id: "off5a", weight: 33, stock: null },
  { id: "off10", weight: 27, stock: null },
  { id: "off15", weight: 16, stock: null },
  { id: "bookmark", weight: 19, stock: 800 },
  { id: "mystery", weight: 5, stock: 100 },
  { id: "nahuh", weight: 0, stock: null },
];

export function limits() {
  return {
    maxCodes: Number(process.env["MAX_CODES"]) || 3500,
    maxSpinsPerIpPerDay: Number(process.env["MAX_SPINS_PER_IP_PER_DAY"]) || 40,
  };
}
