"use client";

import type { HistoryPoint } from "../types";

interface Props {
  history: HistoryPoint[];
  hostName: string;
  processCount?: number;
  onHostClick?: () => void;
}

function miniSparkline(points: number[], height: number, width: number, color: string, id: string) {
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

  const areaPath = `${pathData} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${id})`} />
      <path d={pathData} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function UtilChart({ history, hostName, processCount, onHostClick }: Props) {
  if (!history || history.length < 2) return null;

  const recent = history.slice(-60);
  const gpuCount = recent[0]?.gpus?.length || 0;

  if (gpuCount === 0) return null;

  const utilPoints = recent.map((p) =>
    p.gpus.reduce((s, g) => s + g.utilization_gpu, 0) / p.gpus.length
  );
  const memPoints = recent.map((p) => {
    const used = p.gpus.reduce((s, g) => s + g.memory_used_mb, 0);
    const total = p.gpus.reduce((s, g) => s + g.memory_total_mb, 0);
    return total > 0 ? (used / total) * 100 : 0;
  });

  const chartId = hostName.replace(/[^a-zA-Z0-9]/g, "-");

  return (
    <div className="rounded-2xl bg-card border border-border p-6 transition-colors hover:border-muted/30">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-base font-medium">{hostName}</span>
          {processCount !== undefined && processCount > 0 && (
            <button
              onClick={onHostClick}
              className="rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              {processCount} process{processCount !== 1 ? "es" : ""} active
            </button>
          )}
          {processCount === 0 && (
            <span className="rounded-lg bg-surface px-2.5 py-1 text-xs text-muted">
              idle
            </span>
          )}
        </div>
        <span className="text-xs text-muted">Last 5 min</span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm text-muted">
            <span>Compute</span>
            <span className="font-mono font-medium text-foreground">{utilPoints[utilPoints.length - 1]?.toFixed(0)}%</span>
          </div>
          {miniSparkline(utilPoints, 52, 200, "#3b82f6", `${chartId}-util`)}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-sm text-muted">
            <span>Memory</span>
            <span className="font-mono font-medium text-foreground">{memPoints[memPoints.length - 1]?.toFixed(0)}%</span>
          </div>
          {miniSparkline(memPoints, 52, 200, "#a855f7", `${chartId}-mem`)}
        </div>
      </div>
    </div>
  );
}
