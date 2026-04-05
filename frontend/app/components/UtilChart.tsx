"use client";

import type { HistoryPoint } from "../types";

interface Props {
  history: HistoryPoint[];
  hostName: string;
}

function miniSparkline(points: number[], height: number, width: number, color: string) {
  if (points.length < 2) return null;

  const max = Math.max(...points, 1);
  const step = width / (points.length - 1);

  const pathData = points
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // Area fill
  const areaPath = `${pathData} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color})`} />
      <path d={pathData} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function UtilChart({ history, hostName }: Props) {
  if (!history || history.length < 2) return null;

  // Get last 60 points (~5 minutes)
  const recent = history.slice(-60);
  const gpuCount = recent[0]?.gpus?.length || 0;

  if (gpuCount === 0) return null;

  // Compute average utilization across all GPUs per point
  const utilPoints = recent.map((p) =>
    p.gpus.reduce((s, g) => s + g.utilization_gpu, 0) / p.gpus.length
  );
  const memPoints = recent.map((p) => {
    const used = p.gpus.reduce((s, g) => s + g.memory_used_mb, 0);
    const total = p.gpus.reduce((s, g) => s + g.memory_total_mb, 0);
    return total > 0 ? (used / total) * 100 : 0;
  });

  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">{hostName}</span>
        <span className="text-[10px] text-muted">Last 5 min</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Compute</span>
            <span className="font-mono">{utilPoints[utilPoints.length - 1]?.toFixed(0)}%</span>
          </div>
          {miniSparkline(utilPoints, 48, 200, "#3b82f6")}
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Memory</span>
            <span className="font-mono">{memPoints[memPoints.length - 1]?.toFixed(0)}%</span>
          </div>
          {miniSparkline(memPoints, 48, 200, "#a855f7")}
        </div>
      </div>
    </div>
  );
}
