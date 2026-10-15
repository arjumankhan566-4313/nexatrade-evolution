import { useEffect, useRef } from "react";

/**
 * Lightweight ambient deep-space canvas.
 *
 * Performance contract: this only ever mounts on the marketing surface (never
 * on /chart or /dashboard), renders at half resolution, is capped at 30fps and
 * stops entirely while the tab is hidden — so it can never compete with the
 * trading canvas for frame budget.
 */

type Drift = {
  hue: string;
  radiusRatio: number;
  speed: number;
  phase: number;
  offsetRatio: [number, number];
};

const DRIFTS: readonly Drift[] = [
  { hue: "0, 242, 254", radiusRatio: 0.46, speed: 0.00013, phase: 0, offsetRatio: [0.2, 0.12] },
  { hue: "139, 92, 246", radiusRatio: 0.4, speed: 0.0001, phase: 2.1, offsetRatio: [0.82, 0.18] },
  { hue: "242, 184, 75", radiusRatio: 0.3, speed: 0.00016, phase: 4.2, offsetRatio: [0.55, 0.78] },
];

const HALF_RESOLUTION = 0.5;
const FRAME_INTERVAL_MS = 1000 / 30;
const WANDER = 0.06;

export default function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let lastPaint = 0;
    let startedAt = 0;

    function resize() {
      const width = Math.max(1, Math.round(window.innerWidth * HALF_RESOLUTION));
      const height = Math.max(1, Math.round(window.innerHeight * HALF_RESOLUTION));
      canvas!.width = width;
      canvas!.height = height;
    }

    function paint(now: number) {
      const ctx = context!;
      const { width, height } = canvas!;
      if (startedAt === 0) startedAt = now;
      const elapsed = now - startedAt;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      for (const drift of DRIFTS) {
        const [baseX, baseY] = drift.offsetRatio;
        const angle = drift.phase + elapsed * drift.speed;
        const cx = (baseX + Math.cos(angle) * WANDER) * width;
        const cy = (baseY + Math.sin(angle * 1.3) * WANDER) * height;
        const radius = drift.radiusRatio * Math.max(width, height);
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, `rgba(${drift.hue}, 0.3)`);
        gradient.addColorStop(1, `rgba(${drift.hue}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    }

    function loop(now: number) {
      frame = requestAnimationFrame(loop);
      if (now - lastPaint < FRAME_INTERVAL_MS) return;
      lastPaint = now;
      paint(now);
    }

    function start() {
      if (frame !== 0) return;
      frame = requestAnimationFrame(loop);
    }

    function stop() {
      if (frame === 0) return;
      cancelAnimationFrame(frame);
      frame = 0;
    }

    function handleVisibility() {
      if (document.hidden) stop();
      else start();
    }

    resize();
    paint(performance.now());
    if (!document.hidden) start();

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-70" />;
}
