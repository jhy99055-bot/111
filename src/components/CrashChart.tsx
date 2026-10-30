import { useEffect, useRef, type ReactNode } from 'react';
import { multiplierAt, secondsAtMultiplier } from '@/lib/crashMath';

export type ChartScene =
  | { kind: 'idle' }
  | { kind: 'live'; startedAtMs: number }
  | { kind: 'crashed'; crashPoint: number };

export interface SellMarker {
  multiplier: number;
}

interface CrashChartProps {
  scene: ChartScene;
  sell: SellMarker | null;
  children?: ReactNode;
}

const PAD = { top: 24, right: 24, bottom: 36, left: 56 };
const LIVE_COLOR = { line: '#0d9488', fill: 'rgba(13, 148, 136, 0.14)' };
const CRASH_COLOR = { line: '#e11d48', fill: 'rgba(225, 29, 72, 0.12)' };
const GRID = 'rgba(15, 23, 42, 0.06)';
const AXIS_TEXT = 'rgba(71, 85, 105, 0.9)';
const BASELINE = 'rgba(15, 23, 42, 0.16)';
const CURVE_SAMPLES = 160;

export default function CrashChart({ scene, sell, children }: CrashChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef({ scene, sell });

  useEffect(() => {
    dataRef.current = { scene, sell };
  }, [scene, sell]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let size = { width: 0, height: 0 };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let frame = 0;
    const render = () => {
      const { scene: currentScene, sell: currentSell } = dataRef.current;
      drawChart(ctx, size.width, size.height, currentScene, currentSell, Date.now());
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative h-[340px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:h-[440px]">
      <canvas ref={canvasRef} className="h-full w-full" aria-label="배율 그래프" />
      {children}
    </div>
  );
}

function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: ChartScene,
  sell: SellMarker | null,
  nowMs: number,
) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  if (width === 0 || height === 0) return;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  let endSeconds = 0;
  let headMultiplier = 1;
  let palette = LIVE_COLOR;

  if (scene.kind === 'live') {
    endSeconds = Math.max(0, (nowMs - scene.startedAtMs) / 1000);
    headMultiplier = multiplierAt(endSeconds);
  } else if (scene.kind === 'crashed') {
    endSeconds = secondsAtMultiplier(scene.crashPoint);
    headMultiplier = scene.crashPoint;
    palette = CRASH_COLOR;
  }

  const xMax = Math.max(8, endSeconds * 1.15);
  const yMax = Math.max(2, headMultiplier * 1.15);
  const xToPx = (seconds: number) => PAD.left + (seconds / xMax) * plotW;
  const yToPx = (multiplier: number) => PAD.top + plotH - ((multiplier - 1) / (yMax - 1)) * plotH;
  const baseline = yToPx(1);

  ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
  ctx.lineWidth = 1;

  const yStep = niceStep(yMax - 1, 4);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let m = 1 + yStep; m <= yMax; m += yStep) {
    const y = yToPx(m);
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(width - PAD.right, y);
    ctx.stroke();
    ctx.fillStyle = AXIS_TEXT;
    ctx.fillText(`${m.toFixed(m % 1 === 0 ? 0 : 1)}x`, PAD.left - 10, y);
  }

  const xStep = niceStep(xMax, 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let s = xStep; s <= xMax; s += xStep) {
    const x = xToPx(s);
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, baseline);
    ctx.stroke();
    ctx.fillStyle = AXIS_TEXT;
    ctx.fillText(`${s}초`, x, baseline + 10);
  }

  ctx.strokeStyle = BASELINE;
  ctx.beginPath();
  ctx.moveTo(PAD.left, baseline);
  ctx.lineTo(width - PAD.right, baseline);
  ctx.stroke();

  if (scene.kind === 'idle' || endSeconds <= 0) return;

  const samples = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const seconds = (endSeconds * i) / CURVE_SAMPLES;
    return { x: xToPx(seconds), y: yToPx(multiplierAt(seconds)) };
  });

  ctx.beginPath();
  ctx.moveTo(samples[0].x, baseline);
  samples.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(samples[samples.length - 1].x, baseline);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, PAD.top, 0, baseline);
  gradient.addColorStop(0, palette.fill);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  samples.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const head = samples[samples.length - 1];
  const pulse = scene.kind === 'live' ? 1 + 0.2 * Math.sin(nowMs / 160) : 1;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 9 * pulse, 0, Math.PI * 2);
  ctx.fillStyle = palette.line;
  ctx.globalAlpha = 0.2;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = palette.line;
  ctx.fill();

  if (sell) drawSellMarker(ctx, sell, xToPx, yToPx, baseline, width, PAD.top);
}

function drawSellMarker(
  ctx: CanvasRenderingContext2D,
  sell: SellMarker,
  xToPx: (seconds: number) => number,
  yToPx: (multiplier: number) => number,
  baseline: number,
  width: number,
  top: number,
) {
  const seconds = secondsAtMultiplier(sell.multiplier);
  const x = xToPx(seconds);
  const y = yToPx(sell.multiplier);

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, baseline);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  const label = `SELL ${sell.multiplier.toFixed(2)}x`;
  ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
  const textWidth = ctx.measureText(label).width;
  const boxW = textWidth + 20;
  const boxH = 26;
  const boxX = Math.min(Math.max(x - boxW / 2, PAD.left), width - PAD.right - boxW);
  const boxY = Math.max(y - boxH - 14, top);

  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 13);
  ctx.fillStyle = '#fef3c7';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#f59e0b';
  ctx.stroke();
  ctx.fillStyle = '#92400e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, boxX + boxW / 2, boxY + boxH / 2);
}
