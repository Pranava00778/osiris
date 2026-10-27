import { createFileRoute } from "@tanstack/react-router";
import logo from "@/assets/osiris-forge-logo.png.asset.json";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { staffLookup, staffRedeem, staffStats, type StaffCode } from "@/lib/wheel.functions";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Stall Desk | Osiris Forge Studio" },
      { name: "description", content: "Staff desk for checking and redeeming Osiris Forge Studio wheel prize codes." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Stall Desk | Osiris Forge Studio" },
      { property: "og:description", content: "Staff desk for checking and redeeming Osiris Forge Studio wheel prize codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Staff,
});

type Stats = Extract<Awaited<ReturnType<typeof staffStats>>, { ok: true }>;
type Verdict =
  | { kind: "none"; message: string }
  | { kind: "used"; label?: string | undefined; redeemedAt?: string | null | undefined }
  | { kind: "ok"; data: StaffCode }
  | { kind: "dud"; data: StaffCode };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Staff() {
  const statsFn = useServerFn(staffStats);
  const lookupFn = useServerFn(staffLookup);
  const redeemFn = useServerFn(staffRedeem);
  const [pin, setPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [code, setCode] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  function lock() {
    setPin("");
    try {
      sessionStorage.removeItem("of_pin");
    } catch {}
    setOpen(false);
    setVerdict(null);
    setPinInput("");
  }

  async function tryOpen(p: string, silent = false) {
    try {
      const s = await statsFn({ data: { pin: p } });
      if (!s.ok) {
        if (!silent) setPinMsg(s.message);
        return;
      }
      setPin(p);
      try {
        sessionStorage.setItem("of_pin", p);
      } catch {}
      setStats(s);
      setOpen(true);
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch {
      if (!silent) setPinMsg("Could not reach the server.");
    }
  }

  async function loadStats(p = pin) {
    const s = await statsFn({ data: { pin: p } }).catch(() => null);
    if (s && s.ok) setStats(s);
    else if (s && (s.error === "pin" || s.error === "locked")) lock();
  }

  useEffect(() => {
    let saved = "";
    try {
      saved = sessionStorage.getItem("of_pin") || "";
    } catch {}
    if (saved) tryOpen(saved, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCheck(e: React.FormEvent) {
    e.preventDefault();
    setVerdict(null);
    try {
      const r = await lookupFn({ data: { pin, code } });
      if (!r.ok) {
        if (r.error === "pin" || r.error === "locked") return lock();
        return setVerdict({ kind: "none", message: r.message });
      }
      setVerdict(
        r.redeemedAt
          ? { kind: "used", label: r.label, redeemedAt: r.redeemedAt }
          : r.wins
            ? { kind: "ok", data: r }
            : { kind: "dud", data: r },
      );
    } catch {
      setVerdict({ kind: "none", message: "Could not reach the server." });
    }
  }

  async function onRedeem(c: string) {
    setRedeeming(true);
    try {
      const r = await redeemFn({ data: { pin, code: c } });
      if (r.ok) {
        setVerdict({ kind: "ok", data: r });
        setCode("");
        loadStats();
      } else if (r.error === "used") setVerdict({ kind: "used", label: r.label, redeemedAt: r.redeemedAt });
      else setVerdict({ kind: "none", message: r.message });
    } catch {
      setVerdict({ kind: "none", message: "Could not reach the server." });
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <main className="forge">
      <header className="mast">
        <img className="brand-logo" src={logo.url} alt="Osiris Forge Studio" />
        <div className="tag">
          Stall desk
          <br />
          staff only
        </div>
      </header>

      {!open ? (
        <form
          className="desk"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            setPinMsg("");
            tryOpen(pinInput.trim());
          }}
        >
          <div className="field">
            <label htmlFor="pin">Staff PIN</label>
            <input id="pin" type="password" inputMode="numeric" autoComplete="off" required value={pinInput} onChange={(e) => setPinInput(e.target.value)} />
          </div>
          <button className="btn" type="submit">
            Open desk
          </button>
          <p className="msg bad" role="status">
            {pinMsg}
          </p>
        </form>
      ) : (
        <section className="desk">
          <form className="desk" autoComplete="off" onSubmit={onCheck}>
            <div className="field">
              <label htmlFor="code">Visitor's code</label>
              <input
                id="code"
                ref={codeRef}
                className="big"
                type="text"
                maxLength={5}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
              />
            </div>
            <button className="btn" type="submit">
              Check code
            </button>
          </form>

          {verdict && (
            <div className={"verdict " + verdict.kind} aria-live="polite">
              {verdict.kind === "none" && (
                <>
                  <div className="state">Not valid</div>
                  <div className="what">{verdict.message}</div>
                </>
              )}
              {verdict.kind === "used" && (
                <>
                  <div className="state">Already claimed</div>
                  <div className="what">{verdict.label}</div>
                  <p className="meta">
                    {verdict.redeemedAt ? `Handed over ${fmt(verdict.redeemedAt)}. ` : ""}Do not give another prize.
                  </p>
                </>
              )}
              {verdict.kind === "ok" && (
                <>
                  <div className="state">{verdict.data.redeemedAt ? "Claimed just now" : "Valid and unused"}</div>
                  <div className="what">{verdict.data.label}</div>
                  <p className="meta">
                    {verdict.data.desc} · code {verdict.data.code}
                  </p>
                  {!verdict.data.redeemedAt && (
                    <button className="btn btn-md" type="button" disabled={redeeming} onClick={() => onRedeem(verdict.data.code)}>
                      Hand over, mark claimed
                    </button>
                  )}
                </>
              )}
              {verdict.kind === "dud" && (
                <>
                  <div className="state">No prize</div>
                  <div className="what">{verdict.data.label}</div>
                  <p className="meta">
                    {verdict.data.desc} · code {verdict.data.code}
                    <br />
                    Do not hand anything over for this code.
                  </p>
                </>
              )}
            </div>
          )}

          {stats && (
            <div className="stats">
              <h2>Campaign</h2>
              <div className="tiles">
                {(
                  [
                    ["Codes issued", `${stats.issued} / ${stats.max}`],
                    ["Claimed at stall", stats.redeemed],
                    ["Spins left", stats.remaining],
                  ] as const
                ).map(([k, v]) => (
                  <div className="tile" key={k}>
                    <b>{String(v)}</b>
                    <small>{k}</small>
                  </div>
                ))}
              </div>
              <div className="tbl">
                <table>
                  <thead>
                    <tr>
                      <th>Prize</th>
                      <th className="n">Issued</th>
                      <th className="n">Claimed</th>
                      <th className="n">Cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.prizes.map((p, i) => (
                      <tr key={i}>
                        <td>{p.label}</td>
                        <td className="n">{p.issued}</td>
                        <td className="n">{p.redeemed}</td>
                        <td className="n">{p.stock == null ? "none" : p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="row">
            <button className="btn quiet" type="button" onClick={lock}>
              Lock desk
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
