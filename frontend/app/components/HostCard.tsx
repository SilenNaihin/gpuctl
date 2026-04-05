"use client";

import { useState } from "react";
import type { HostStatus } from "../types";
import GPUBar from "./GPUBar";

function statusDot(online: boolean) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {online && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-75" />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
          online ? "bg-green" : "bg-red"
        }`}
      />
    </span>
  );
}

function regionFlag(region: string) {
  if (region.includes("india")) return "IN";
  if (region.includes("west")) return "US-W";
  if (region.includes("east")) return "US-E";
  if (region.includes("central") && !region.includes("india")) return "US-C";
  return region.slice(0, 4).toUpperCase();
}

export default function HostCard({ host }: { host: HostStatus }) {
  const [expanded, setExpanded] = useState(true);

  const totalMem = host.gpus.reduce((s, g) => s + g.memory_total_mb, 0);
  const usedMem = host.gpus.reduce((s, g) => s + g.memory_used_mb, 0);
  const avgUtil = host.gpus.length > 0
    ? Math.round(host.gpus.reduce((s, g) => s + g.utilization_gpu, 0) / host.gpus.length)
    : 0;
  const memPct = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

  const updated = host.last_updated
    ? new Date(host.last_updated).toLocaleTimeString()
    : "—";

  return (
    <div className="group rounded-2xl bg-card border border-border hover:border-border/80 transition-all duration-200">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-3">
          {statusDot(host.online)}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight">{host.name}</span>
              <span className="rounded-md bg-border/50 px-2 py-0.5 text-[10px] font-medium text-muted uppercase tracking-wider">
                {regionFlag(host.region)}
              </span>
            </div>
            <span className="text-xs text-muted font-mono">{host.ip}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {host.online && (
            <>
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs text-muted">Compute</span>
                <span className="text-sm font-semibold font-mono">{avgUtil}%</span>
              </div>
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs text-muted">Memory</span>
                <span className="text-sm font-semibold font-mono">{memPct}%</span>
              </div>
              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs text-muted">{host.gpu_type}</span>
                <span className="text-sm font-semibold font-mono">{host.gpus.length} GPU{host.gpus.length !== 1 ? "s" : ""}</span>
              </div>
            </>
          )}
          <svg
            className={`h-4 w-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && host.online && (
        <div className="border-t border-border/50 px-5 pb-5">
          {/* GPU bars */}
          <div className="mt-4 grid gap-3">
            {host.gpus.map((gpu) => (
              <GPUBar key={gpu.index} gpu={gpu} />
            ))}
          </div>

          {/* Processes */}
          {host.processes.length > 0 && (
            <div className="mt-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Processes
              </span>
              <div className="mt-2 space-y-1">
                {host.processes.map((p, i) => (
                  <div
                    key={`${p.pid}-${i}`}
                    className="flex items-center justify-between rounded-lg bg-background/30 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-muted">{p.pid}</span>
                      <span className="truncate font-medium">{p.name}</span>
                    </div>
                    <span className="font-mono text-muted shrink-0">
                      {(p.gpu_memory_mb / 1024).toFixed(1)} GB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-3 text-right text-[10px] text-muted/60">
            Updated {updated}
          </div>
        </div>
      )}

      {/* Offline message */}
      {expanded && !host.online && (
        <div className="border-t border-border/50 px-5 py-8 text-center text-sm text-muted">
          Host unreachable
        </div>
      )}
    </div>
  );
}
