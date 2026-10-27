import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { Wedge } from "@/lib/prizes";

// Canvas drawing colours are part of the forge palette (canvas cannot read CSS classes).
const TAU = Math.PI * 2;
const TIER_FILL: Record<number, [string, string]> = {
  0: ["#1B1440", "#241A52"],
  1: ["#293E98", "#24358a"],
  2: ["#2493B4", "#1f82a0"],
  3: ["#CC9B2B", "#B7872D"],
};
const TIER_TEXT: Record<number, string> = { 0: "#F6E5B4", 1: "#F6E5B4", 2: "#F6E5B4", 3: "#2C2064" };

export type WheelHandle = { spinTo: (index: number) => Promise<void>; restAt: (index: number) => void };

export const ForgeWheel = forwardRef<WheelHandle, { wedges: Wedge[] }>(function ForgeWheel({ wedges }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rot = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wedges.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const size = canvas.clientWidth;
    if (!size) return;
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = size / 2, cy = size / 2;
    const rim = size * 0.05;
    const R = size / 2 - rim - size * 0.012;
    const seg = TAU / wedges.length;
    ctx.clearRect(0, 0, size, size);

    const rimGrad = ctx.createLinearGradient(0, 0, size, size);
    rimGrad.addColorStop(0, "#CC9B2B");
    rimGrad.addColorStop(0.5, "#755321");
    rimGrad.addColorStop(1, "#CC9B2B");
    ctx.beginPath();
    ctx.arc(cx, cy, R + rim, 0, TAU);
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#CC9B2B";
    ctx.stroke();

    for (let i = 0; i < wedges.length; i++) {
      const a0 = rot.current + i * seg - Math.PI / 2;
      const w = wedges[i];
      if (!w) continue;
      const fills = TIER_FILL[w.tier] ?? ["#293E98", "#24358a"];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = fills[i % 2] ?? fills[0] ?? "#293E98";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2C2064";
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = TIER_TEXT[w.tier] ?? "#F6E5B4";
      let px = size * 0.075;
      ctx.font = `900 ${px}px "Raleway", "Arial Narrow", sans-serif`;
      while (ctx.measureText(w.label).width > R * 0.62 && px > 10) {
        px -= 1;
        ctx.font = `900 ${px}px "Raleway", "Arial Narrow", sans-serif`;
      }
      ctx.fillText(w.label, R * 0.9, 0);
      ctx.restore();
    }

    for (let i = 0; i < wedges.length; i++) {
      const a = rot.current + i * seg - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (R + rim / 2), cy + Math.sin(a) * (R + rim / 2), rim * 0.26, 0, TAU);
      ctx.fillStyle = "#F6E5B4";
      ctx.fill();
    }

    const hubR = R * 0.17;
    const hub = ctx.createRadialGradient(cx - hubR * 0.3, cy - hubR * 0.3, 2, cx, cy, hubR);
    hub.addColorStop(0, "#3a2c8a");
    hub.addColorStop(1, "#755321");
    ctx.beginPath();
    ctx.arc(cx, cy, hubR, 0, TAU);
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#CC9B2B";
    ctx.stroke();
    ctx.fillStyle = "#F6E5B4";
    ctx.font = `900 ${hubR * 0.8}px "Raleway", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("OF", cx, cy + hubR * 0.06);
  }, [wedges]);

  const restRotation = useCallback(
    (index: number) => {
      const seg = TAU / wedges.length;
      return (TAU - (index + 0.5) * seg) % TAU;
    },
    [wedges],
  );

  useImperativeHandle(ref, () => ({
    restAt(index) {
      rot.current = restRotation(index);
      draw();
    },
    spinTo(index) {
      const seg = TAU / wedges.length;
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      const from = rot.current;
      const curMod = ((from % TAU) + TAU) % TAU;
      const targetMod = (((restRotation(index) + jitter) % TAU) + TAU) % TAU;
      const delta = ((targetMod - curMod + TAU) % TAU) + TAU * 6;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dur = reduce ? 500 : 5600;
      const t0 = performance.now();
      return new Promise<void>((resolve) => {
        const frame = (now: number) => {
          const t = Math.min(1, (now - t0) / dur);
          rot.current = from + delta * (1 - Math.pow(1 - t, 4));
          draw();
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
    },
  }));

  useEffect(() => {
    draw();
    document.fonts?.ready.then(draw).catch(() => {});
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(draw, 80);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  return (
    <div className="wheel-wrap">
      <svg className="pointer" viewBox="0 0 34 44" aria-hidden="true">
        <path d="M17 44 L2 12 Q0 4 8 2 L26 2 Q34 4 32 12 Z" fill="#CC9B2B" stroke="#2C2064" strokeWidth="2" />
        <circle cx="17" cy="12" r="4" fill="#2C2064" />
      </svg>
      <canvas ref={canvasRef} role="img" aria-label="Prize wheel" />
    </div>
  );
});
