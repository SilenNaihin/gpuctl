"use client";

import { useState, forwardRef } from "react";
import type { HostStatus } from "../types";
import GPUBar from "./GPUBar";

function statusDot(online: boolean) {
  return (
    <span className="relative flex h-3 w-3">
      {online && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-75" />
      )}
      <span
        className={`relative inline-flex h-3 w-3 rounded-full ${
          online ? "bg-green" : "bg-red"
        }`}
      />
    </span>
  );
}

function regionLabel(region: string) {
  if (region.includes("india")) return "IN";
  if (region.includes("westus2")) return "US West 2";
  if (region.includes("westus3")) return "US West 3";
  if (region.includes("east")) return "US East";
  if (region.includes("central") && !region.includes("india")) return "US Central";
  return region;
}

const HostCard = forwardRef<HTMLDivElement, { host: HostStatus }>(
  function HostCard({ host }, ref) {
    const [expanded, setExpanded] = useState(true);

    const totalMem = host.gpus.reduce((s, g) => s + g.memory_total_mb, 0);
    const usedMem = host.gpus.reduce((s, g) => s + g.memory_used_mb, 0);
    const avgUtil = host.gpus.length > 0
      ? Math.round(host.gpus.reduce((s, g) => s + g.utilization_gpu, 0) / host.gpus.length)
      : 0;
    const memPct = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

    const updated = host.last_updated
      ? new Date(host.last_updated).toLocaleTimeString()
      : "--";

    return (
      <div ref={ref} className="group rounded-2xl bg-card border border-border transition-all duration-200 hover:border-muted/30">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between p-6 text-left"
        >
          <div className="flex items-center gap-3.5">
            {statusDot(host.online)}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2.5">
                <span className="text-base font-semibold tracking-tight">{host.name}</span>
                <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-medium text-muted">
                  {regionLabel(host.region)}
                </span>
              </div>
              <span className="text-sm text-muted font-mono">{host.ip}</span>
            </div>
          </div>

          <div className="flex items-center gap-8">
            {host.online && (
              <>
                <div className="hidden sm:flex flex-col items-end gap-0.5">
                  <span className="text-sm text-muted">Compute</span>
                  <span className="text-lg font-semibold font-mono">{avgUtil}%</span>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-0.5">
                  <span className="text-sm text-muted">Memory</span>
                  <span className="text-lg font-semibold font-mono">{memPct}%</span>
                </div>
                <div className="hidden md:flex flex-col items-end gap-0.5">
                  <span className="text-sm text-muted">{host.gpu_type}</span>
                  <span className="text-lg font-semibold font-mono">{host.gpus.length} GPU{host.gpus.length !== 1 ? "s" : ""}</span>
                </div>
              </>
            )}
            <svg
              className={`h-5 w-5 text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
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
          <div className="border-t border-border/50 px-6 pb-6">
            {/* GPU bars */}
            <div className="mt-5 grid gap-4">
              {host.gpus.map((gpu) => (
                <GPUBar key={gpu.index} gpu={gpu} />
              ))}
            </div>

            {/* Processes */}
            {host.processes.length > 0 && (
              <div className="mt-5">
                <span className="text-sm font-medium text-muted">
                  Active Processes ({host.processes.length})
                </span>
                <div className="mt-3 space-y-1.5">
                  {host.processes.map((p, i) => (
                    <div
                      key={`${p.pid}-${i}`}
                      className="flex items-center justify-between rounded-lg bg-surface px-4 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-muted text-sm">{p.pid}</span>
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
            <div className="mt-4 text-right text-sm text-subtle">
              Updated {updated}
            </div>
          </div>
        )}

        {/* Offline message */}
        {expanded && !host.online && (
          <div className="border-t border-border/50 px-6 py-10 text-center text-base text-muted">
            Host unreachable
          </div>
        )}
      </div>
    );
  }
);

export default HostCard;
