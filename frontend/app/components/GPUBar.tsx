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
    <div className="flex flex-col gap-3 rounded-xl bg-background/50 border border-border/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">GPU {gpu.index}</span>
          <span className="text-xs text-muted">{gpu.name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{gpu.temperature}°C</span>
          <span>{gpu.power_draw.toFixed(0)}W</span>
        </div>
      </div>

      {/* Compute utilization */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Compute</span>
          <span className="font-mono font-medium">{gpu.utilization_gpu}%</span>
        </div>
        <div className="h-2 rounded-full bg-border/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${utilColor(gpu.utilization_gpu)}`}
            style={{ width: `${gpu.utilization_gpu}%` }}
          />
        </div>
      </div>

      {/* Memory utilization */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Memory</span>
          <span className="font-mono font-medium">{memUsedGB} / {memTotalGB} GB</span>
        </div>
        <div className="h-2 rounded-full bg-border/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${memColor(gpu.memory_used_mb, gpu.memory_total_mb)}`}
            style={{ width: `${memPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
