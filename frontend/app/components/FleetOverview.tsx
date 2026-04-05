"use client";

import type { FleetStatus } from "../types";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-card border border-border px-6 py-5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      <span className="text-3xl font-semibold tracking-tight">{value}</span>
      {sub && <span className="text-sm text-muted">{sub}</span>}
    </div>
  );
}

export default function FleetOverview({ fleet }: { fleet: FleetStatus }) {
  const onlineHosts = fleet.hosts.filter((h) => h.online).length;
  const utilizationPct =
    fleet.total_vram_gb > 0
      ? Math.round((fleet.used_vram_gb / fleet.total_vram_gb) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="GPUs Online"
        value={`${fleet.active_gpus}/${fleet.total_gpus}`}
        sub={`${onlineHosts} hosts`}
      />
      <StatCard
        label="VRAM Used"
        value={`${fleet.used_vram_gb.toFixed(1)} GB`}
        sub={`of ${fleet.total_vram_gb.toFixed(0)} GB total`}
      />
      <StatCard
        label="Utilization"
        value={`${utilizationPct}%`}
        sub="fleet average"
      />
      <StatCard
        label="Hosts"
        value={`${onlineHosts}/${fleet.hosts.length}`}
        sub={`${fleet.hosts.length - onlineHosts} offline`}
      />
    </div>
  );
}
