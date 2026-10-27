import { createServerFn } from "@tanstack/react-start";
import { WEDGES, findPrize, normaliseCode } from "./prizes";
import {
  getPlayerCode,
  getCodeRecord,
  getCodesCount,
  getAllCodesList,
  markCodeRedeemed,
  drawPrize,
  getPinFail,
  setPinFail,
  clearPinFail,
  type CodeRecord,
} from "./storage.server";

export type SpinResult = {
  fresh: boolean;
  code: string;
  prizeIndex: number;
  label: string;
  desc: string;
  redeemed: boolean;
  wins: boolean;
};

export type StaffCode = {
  code: string;
  label: string;
  desc: string;
  issuedAt: string;
  redeemedAt: string | null;
  wins: boolean;
};

type Fail<E extends string = string> = { ok: false; error: E; message: string };

const COOKIE = "of_player";

function view(code: string, prizeId: string, redeemed: boolean, fresh: boolean): SpinResult {
  const i = WEDGES.findIndex((w) => w.id === prizeId);
  const w = findPrize(prizeId);
  return {
    fresh,
    code,
    prizeIndex: i,
    label: w?.label ?? prizeId,
    desc: w?.desc ?? "",
    redeemed,
    wins: w?.wins ?? false,
  };
}

async function ip() {
  const { getRequestIP, getRequestHeader } = await import("@tanstack/react-start/server");
  // On Netlify this header is set by the platform and can't be spoofed by the visitor.
  return getRequestHeader("x-nf-client-connection-ip") || getRequestIP({ xForwardedFor: true }) || "unknown";
}

async function playerId() {
  const { getCookie } = await import("@tanstack/react-start/server");
  const v = getCookie(COOKIE);
  return v && /^[a-f0-9]{32}$/.test(v) ? v : null;
}

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const { limits } = await import("./prizes.server");
  const id = await playerId();
  if (id) {
    const record = await getPlayerCode(id);
    if (record) {
      return {
        played: true as const,
        result: view(record.code, record.prize_id, record.redeemed_at != null, false),
      };
    }
  }
  const count = await getCodesCount();
  return { played: false as const, closed: count >= limits().maxCodes };
});

export const spin = createServerFn({ method: "POST" }).handler(
  async (): Promise<({ ok: true } & SpinResult) | Fail> => {
    const { setCookie, getRequestHeader } = await import("@tanstack/react-start/server");
    let id = await playerId();
    if (!id) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      setCookie(COOKIE, id, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 60,
        secure: (getRequestHeader("x-forwarded-proto") || "") === "https",
      });
    }

    const clientIp = await ip();
    const result = await drawPrize(id, clientIp);
    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      ...view(result.code, result.prize_id, result.redeemed, result.fresh),
    };
  },
);

// ---------- staff ----------

async function checkPin(pin: string): Promise<Fail<"pin" | "locked" | "config"> | null> {
  // Default to 1234 if not specified in Netlify environment variables
  const want = process.env["STAFF_PIN"] || "1234";
  const addr = await ip();
  const f = await getPinFail(addr);
  if (f?.locked_until && new Date(f.locked_until).getTime() > Date.now()) {
    return { ok: false, error: "locked", message: "Too many wrong PINs. Wait a few minutes." };
  }

  const enc = new TextEncoder();
  const a = enc.encode(String(pin));
  const b = enc.encode(want);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (diff !== 0) {
    let n = (f?.n ?? 0) + 1;
    let locked_until: string | null = null;
    if (n >= 5) {
      n = 0;
      locked_until = new Date(Date.now() + 10 * 60000).toISOString();
    }
    await setPinFail(addr, n, locked_until);
    return { ok: false, error: "pin", message: "Wrong PIN." };
  }
  if (f) await clearPinFail(addr);
  return null;
}

function staffView(row: CodeRecord): StaffCode {
  const w = findPrize(row.prize_id);
  return {
    code: row.code,
    label: w?.label ?? row.prize_id,
    desc: w?.desc ?? "",
    issuedAt: row.created_at,
    redeemedAt: row.redeemed_at,
    wins: w?.wins ?? false,
  };
}

const pinInput = (d: { pin: string }) => ({ pin: String(d?.pin ?? "").slice(0, 64) });
const codeInput = (d: { pin: string; code: string }) => ({
  pin: String(d?.pin ?? "").slice(0, 64),
  code: String(d?.code ?? "").slice(0, 16),
});

export const staffStats = createServerFn({ method: "POST" })
  .validator(pinInput)
  .handler(async ({ data }) => {
    const bad = await checkPin(data.pin);
    if (bad) return bad;
    const { PRIZE_ODDS, limits } = await import("./prizes.server");
    const rows = await getAllCodesList();
    const max = limits().maxCodes;
    return {
      ok: true as const,
      issued: rows.length,
      remaining: Math.max(0, max - rows.length),
      max,
      redeemed: rows.filter((r) => r.redeemed_at).length,
      prizes: WEDGES.map((w) => ({
        label: w.label,
        issued: rows.filter((r) => r.prize_id === w.id).length,
        redeemed: rows.filter((r) => r.prize_id === w.id && r.redeemed_at).length,
        stock: PRIZE_ODDS.find((p) => p.id === w.id)?.stock ?? null,
      })),
    };
  });

export const staffLookup = createServerFn({ method: "POST" })
  .validator(codeInput)
  .handler(async ({ data }): Promise<({ ok: true } & StaffCode) | Fail> => {
    const bad = await checkPin(data.pin);
    if (bad) return bad;
    const code = normaliseCode(data.code);
    if (!code) return { ok: false, error: "format", message: "That is not a valid code. Codes have 4 characters." };
    const row = await getCodeRecord(code);
    if (!row) return { ok: false, error: "unknown", message: "No such code. Do not give a prize." };
    return { ok: true, ...staffView(row) };
  });

export const staffRedeem = createServerFn({ method: "POST" })
  .validator(codeInput)
  .handler(async ({ data }): Promise<({ ok: true } & StaffCode) | (Fail & Partial<StaffCode>)> => {
    const bad = await checkPin(data.pin);
    if (bad) return bad;
    const code = normaliseCode(data.code);
    if (!code) return { ok: false, error: "format", message: "That is not a valid code. Codes have 4 characters." };
    const res = await markCodeRedeemed(code);
    if (!res.ok) {
      return {
        ok: false,
        error: res.error,
        message: res.message,
        ...(res.record ? staffView(res.record) : {}),
      };
    }
    return { ok: true, ...staffView(res.record) };
  });
