"use client";

import type { GPUInfo } from "../types";

function utilColor(pct: number): string {
  if (pct < 25) return "bg-green";
  if (pct < 50) return "bg-yellow";
  if (pct < 80) return "bg-orange";
  return "bg-red";
}

function memColor(used: number, total: number): string {
  const pct = total > 0 ? (used / total) * 100 : 0;
  if (pct < 25) return "bg-green";
  if (pct < 50) return "bg-yellow/80";
  if (pct < 80) return "bg-orange/80";
  return "bg-red/80";
}

export default function GPUBar({ gpu }: { gpu: GPUInfo }) {
  const memPct = gpu.memory_total_mb > 0
    ? (gpu.memory_used_mb / gpu.memory_total_mb) * 100
    : 0;
  const memUsedGB = (gpu.memory_used_mb / 1024).toFixed(1);
  const memTotalGB = (gpu.memory_total_mb / 1024).toFixed(0);

  return (
    <div className="flex flex-col gap-3.5 rounded-xl bg-surface border border-border/50 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-base font-medium text-foreground">GPU {gpu.index}</span>
          <span className="text-sm text-muted">{gpu.name}</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted">
          <span>{gpu.temperature}°C</span>
          <span>{gpu.power_draw.toFixed(0)}W</span>
        </div>
      </div>

      {/* Compute utilization */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Compute</span>
          <span className="font-mono font-medium">{gpu.utilization_gpu}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-border/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${utilColor(gpu.utilization_gpu)}`}
            style={{ width: `${gpu.utilization_gpu}%` }}
          />
        </div>
      </div>

      {/* Memory utilization */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Memory</span>
          <span className="font-mono font-medium">{memUsedGB} / {memTotalGB} GB</span>
        </div>
        <div className="h-2.5 rounded-full bg-border/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${memColor(gpu.memory_used_mb, gpu.memory_total_mb)}`}
            style={{ width: `${memPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
