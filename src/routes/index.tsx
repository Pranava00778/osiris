import { createFileRoute } from "@tanstack/react-router";
import logo from "@/assets/osiris-forge-logo.png.asset.json";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ForgeWheel, type WheelHandle } from "@/components/ForgeWheel";
import { CLAIM_TEXT, WEDGES } from "@/lib/prizes";
import { getMe, spin, type SpinResult } from "@/lib/wheel.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Spin the Forge Wheel | Osiris Forge Studio" },
      { name: "description", content: "One spin per goodie bag at the Osiris Forge Studio stall. Five ways to win, one wedge that says nah uh." },
      { property: "og:title", content: "Spin the Forge Wheel | Osiris Forge Studio" },
      { property: "og:description", content: "One spin per goodie bag at the Osiris Forge Studio stall. Five ways to win, one wedge that says nah uh." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function ResultCard({ r }: { r: SpinResult }) {
  const [copyText, setCopyText] = useState("Copy code");
  return (
    <section className="result" aria-live="polite">
      <div className="eyebrow">{r.fresh ? "The forge says" : "Your result"}</div>
      <div className="prize">{r.label}</div>
      <p className="desc">{r.desc}</p>
      {r.wins && (
        <div className="code" aria-label={"Your code: " + r.code.split("").join(" ")}>
          {r.code.split("").map((ch, i) => (
            <span key={i} aria-hidden="true" style={{ ["--i" as string]: i }}>
              {ch}
            </span>
          ))}
        </div>
      )}
      {!r.wins ? (
        <>
          <span className="stamp">No prize</span>
          <p className="note">The wheel said nah uh. Nothing to hand over at the stall.</p>
        </>
      ) : r.redeemed ? (
        <span className="stamp">Already claimed</span>
      ) : (
        <>
          <p className="claim">{CLAIM_TEXT}</p>
          <button
            className="btn quiet"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(r.code);
                setCopyText("Copied");
              } catch {
                setCopyText("Press and hold the code to copy");
              }
              setTimeout(() => setCopyText("Copy code"), 2200);
            }}
          >
            {copyText}
          </button>
          <p className="note">Take a screenshot too. The code only appears for the phone that spun.</p>
        </>
      )}
    </section>
  );
}

function Index() {
  const wheel = useRef<WheelHandle>(null);
  const getMeFn = useServerFn(getMe);
  const spinFn = useServerFn(spin);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: "Heating the forge…" });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);

  useEffect(() => {
    getMeFn()
      .then((me) => {
        if (me.played) {
          if (me.result.prizeIndex >= 0) wheel.current?.restAt(me.result.prizeIndex);
          setMsg({ text: me.result.wins ? "You have already spun. Here is your prize." : "You have already spun. Here is what the forge said." });
          setResult(me.result);
        } else if (me.closed) {
          setClosed(true);
          setMsg({ text: "Every bag has been claimed. The wheel is closed.", bad: true });
        } else {
          setMsg({ text: "" });
          setReady(true);
        }
      })
      .catch((err) => {
        console.error("getMe failed:", err);
        setMsg({ text: "Could not reach the forge. Check your signal and reload.", bad: true });
      });
  }, [getMeFn]);

  async function onSpin() {
    if (busy) return;
    setBusy(true);
    setMsg({ text: "" });
    try {
      const r = await spinFn();
      if (!r.ok) {
        setMsg({ text: r.message, bad: true });
        if (r.error === "soldout") setClosed(true);
        setBusy(false);
        return;
      }
      setMsg({ text: "Spinning…" });
      await wheel.current?.spinTo(r.prizeIndex);
      setMsg({ text: "" });
      setResult(r);
    } catch {
      setMsg({ text: "Something went wrong. Try again.", bad: true });
      setBusy(false);
    }
  }

  return (
    <main className="forge">
      <header className="mast">
        <img className="brand-logo" src={logo.url} alt="Osiris Forge Studio" />
        <div className="tag">
          Goodie bag
          <br />
          edition
        </div>
      </header>

      <h1>THE&nbsp;{"\n"}FORGE&nbsp;DROP</h1>
      <p className="lede">Your bag came with a mini figurine and this wheel. One spin per bag — most spins win, one says nah uh.</p>

      <ForgeWheel ref={wheel} wedges={WEDGES} />

      {!result && (
        <button className="btn" type="button" disabled={!ready || busy || closed} onClick={onSpin}>
          Spin
        </button>
      )}
      <p className={"msg" + (msg.bad ? " bad" : "")} role="status" aria-live="polite">
        {msg.text}
      </p>

      {result && <ResultCard r={result} />}

      <p className="fine">One spin per bag. Winning codes work once, at the Osiris Forge Studio stall, and are checked against our records.</p>
    </main>
  );
}
