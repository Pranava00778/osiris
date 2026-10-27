import { getStore } from "@netlify/blobs";
import { PRIZE_ODDS, limits } from "./prizes.server";
import { WEDGES, findPrize, normaliseCode } from "./prizes";

export type CodeRecord = {
  code: string;
  prize_id: string;
  player_id: string;
  ip: string;
  created_at: string;
  redeemed_at: string | null;
};

export type PinFailRecord = {
  ip: string;
  n: number;
  locked_until: string | null;
};

// In-memory fallback if Blobs and Supabase are both inactive (e.g. local dev without Netlify context)
const memCodes: Map<string, CodeRecord> = new Map();
const memPinFails: Map<string, PinFailRecord> = new Map();

function getBlobStore() {
  try {
    return getStore({ name: "forge_data", consistency: "strong" });
  } catch {
    return null;
  }
}

async function getAllCodes(): Promise<CodeRecord[]> {
  const store = getBlobStore();
  if (store) {
    try {
      const data = await store.get("codes", { type: "json" });
      if (Array.isArray(data)) return data as CodeRecord[];
    } catch (e) {
      console.warn("Netlify Blobs get codes failed, falling back to memory:", e);
    }
  }
  return Array.from(memCodes.values());
}

async function saveAllCodes(codes: CodeRecord[]): Promise<void> {
  const store = getBlobStore();
  if (store) {
    try {
      await store.setJSON("codes", codes);
      return;
    } catch (e) {
      console.warn("Netlify Blobs set codes failed, using memory:", e);
    }
  }
  memCodes.clear();
  for (const c of codes) memCodes.set(c.code, c);
}

export async function getPlayerCode(playerId: string): Promise<CodeRecord | null> {
  const codes = await getAllCodes();
  return codes.find((c) => c.player_id === playerId) ?? null;
}

export async function getCodeRecord(code: string): Promise<CodeRecord | null> {
  const norm = normaliseCode(code);
  if (!norm) return null;
  const codes = await getAllCodes();
  return codes.find((c) => c.code === norm) ?? null;
}

export async function getCodesCount(): Promise<number> {
  const codes = await getAllCodes();
  return codes.length;
}

export async function getAllCodesList(): Promise<CodeRecord[]> {
  return await getAllCodes();
}

export async function markCodeRedeemed(code: string): Promise<{ ok: true; record: CodeRecord } | { ok: false; error: "unknown" | "used" | "dud"; message: string; record?: CodeRecord }> {
  const norm = normaliseCode(code);
  if (!norm) return { ok: false, error: "unknown", message: "That is not a valid code." };
  const codes = await getAllCodes();
  const idx = codes.findIndex((c) => c.code === norm);
  if (idx < 0) return { ok: false, error: "unknown", message: "No such code. Do not give a prize." };

  const record = codes[idx]!;
  if (!findPrize(record.prize_id)?.wins) {
    return { ok: false, error: "dud", message: "This code wins nothing. Do not hand anything over.", record };
  }
  if (record.redeemed_at) {
    return { ok: false, error: "used", message: "This code was already redeemed.", record };
  }

  const updated: CodeRecord = { ...record, redeemed_at: new Date().toISOString() };
  codes[idx] = updated;
  await saveAllCodes(codes);
  return { ok: true, record: updated };
}

export async function drawPrize(playerId: string, ip: string): Promise<
  | { ok: true; fresh: boolean; code: string; prize_id: string; redeemed: boolean }
  | { ok: false; error: string; message: string }
> {
  const codes = await getAllCodes();
  const existing = codes.find((c) => c.player_id === playerId);
  if (existing) {
    return {
      ok: true,
      fresh: false,
      code: existing.code,
      prize_id: existing.prize_id,
      redeemed: existing.redeemed_at !== null,
    };
  }

  const l = limits();
  if (codes.length >= l.maxCodes) {
    return { ok: false, error: "soldout", message: "Every bag has been claimed. The wheel is closed." };
  }

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const ipSpinsToday = codes.filter(
    (c) => c.ip === ip && new Date(c.created_at).getTime() > oneDayAgo,
  ).length;
  if (ipSpinsToday >= l.maxSpinsPerIpPerDay) {
    return { ok: false, error: "limited", message: "Too many spins from this connection. Try again tomorrow." };
  }

  // Filter open prizes
  const openPrizes: typeof PRIZE_ODDS = [];
  let totalWeight = 0;
  for (const pr of PRIZE_ODDS) {
    const issuedCount = codes.filter((c) => c.prize_id === pr.id).length;
    if (pr.stock === null || issuedCount < pr.stock) {
      openPrizes.push(pr);
      totalWeight += pr.weight;
    }
  }

  if (totalWeight <= 0) {
    return { ok: false, error: "soldout", message: "All prizes have been claimed." };
  }

  let roll = Math.floor(Math.random() * totalWeight);
  let chosen = openPrizes[openPrizes.length - 1]?.id ?? "nahuh";
  for (const pr of openPrizes) {
    if (roll < pr.weight) {
      chosen = pr.id;
      break;
    }
    roll -= pr.weight;
  }

  // Generate unique 4-char code
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let newCode = "";
  let attempts = 0;
  while (attempts < 1000) {
    newCode = "";
    for (let i = 0; i < 4; i++) {
      newCode += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!codes.some((c) => c.code === newCode)) break;
    attempts++;
  }

  const newRecord: CodeRecord = {
    code: newCode,
    prize_id: chosen,
    player_id: playerId,
    ip,
    created_at: new Date().toISOString(),
    redeemed_at: null,
  };

  codes.push(newRecord);
  await saveAllCodes(codes);

  return {
    ok: true,
    fresh: true,
    code: newCode,
    prize_id: chosen,
    redeemed: false,
  };
}

// PIN fail tracking
export async function getPinFail(ip: string): Promise<PinFailRecord | null> {
  const store = getBlobStore();
  if (store) {
    try {
      const data = await store.get(`fail:${ip}`, { type: "json" });
      if (data) return data as PinFailRecord;
    } catch {}
  }
  return memPinFails.get(ip) ?? null;
}

export async function setPinFail(ip: string, n: number, lockedUntil: string | null): Promise<void> {
  const record: PinFailRecord = { ip, n, locked_until: lockedUntil };
  const store = getBlobStore();
  if (store) {
    try {
      await store.setJSON(`fail:${ip}`, record);
      return;
    } catch {}
  }
  memPinFails.set(ip, record);
}

export async function clearPinFail(ip: string): Promise<void> {
  const store = getBlobStore();
  if (store) {
    try {
      await store.delete(`fail:${ip}`);
      return;
    } catch {}
  }
  memPinFails.delete(ip);
}
