"use client";

import type { SlurmStatus } from "../types";

function stateColor(state: string): string {
  const s = state.toLowerCase().replace("*", "");
  if (s === "idle") return "text-green";
  if (s === "mixed") return "text-yellow";
  if (s === "allocated" || s === "alloc") return "text-orange";
  if (s.includes("drain")) return "text-muted";
  if (s === "down") return "text-red";
  return "text-foreground";
}

function stateBg(state: string): string {
  const s = state.toLowerCase().replace("*", "");
  if (s === "idle") return "bg-green/10";
  if (s === "mixed") return "bg-yellow/10";
  if (s === "allocated" || s === "alloc") return "bg-orange/10";
  if (s.includes("drain")) return "bg-muted/10";
  if (s === "down") return "bg-red/10";
  return "bg-surface";
}

function jobStateBadge(state: string) {
  const s = state.toLowerCase();
  let color = "bg-surface text-muted";
  if (s === "running") color = "bg-green/10 text-green";
  else if (s === "pending") color = "bg-yellow/10 text-yellow";
  else if (s === "completing") color = "bg-accent/10 text-accent";
  else if (s === "failed" || s === "cancelled") color = "bg-red/10 text-red";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${color}`}>
      {state}
    </span>
  );
}

function userColor(idx: number): string {
  const colors = ["text-accent", "text-purple", "text-green", "text-orange", "text-yellow"];
  return colors[idx % colors.length];
}

export default function SlurmOverview({ slurm }: { slurm: SlurmStatus }) {
  if (!slurm.available) {
    return (
      <div className="rounded-2xl bg-card border border-border p-6">
        <div className="flex items-center gap-2 text-muted">
          <svg className="h-5 w-5 text-red" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-sm">Slurm unavailable: {slurm.error || "connection failed"}</span>
        </div>
      </div>
    );
  }

  const runningJobs = slurm.jobs.filter(j => j.state === "RUNNING");
  const pendingJobs = slurm.jobs.filter(j => j.state === "PENDING");
  const freePct = slurm.total_gpus > 0
    ? Math.round(((slurm.total_gpus - slurm.allocated_gpus) / slurm.total_gpus) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* GPU allocation bar */}
      <div className="rounded-2xl bg-card border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple/10">
              <svg className="h-4 w-4 text-purple" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.011.672-1.866 1.595-2.144" />
              </svg>
            </div>
            <span className="text-sm font-medium">Slurm GPU Allocation</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">
              <span className="font-mono font-medium text-foreground">{slurm.allocated_gpus}</span>/{slurm.total_gpus} allocated
            </span>
            <span className="font-mono text-green">{freePct}% free</span>
          </div>
        </div>

        <div className="h-3 rounded-full bg-border/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-purple transition-all duration-500"
            style={{ width: `${slurm.total_gpus > 0 ? (slurm.allocated_gpus / slurm.total_gpus) * 100 : 0}%` }}
          />
        </div>

        {/* Node states */}
        <div className="mt-4 flex flex-wrap gap-2">
          {slurm.nodes.map(node => (
            <div
              key={node.name}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${stateBg(node.state)}`}
            >
              <span className={`font-medium ${stateColor(node.state)}`}>{node.name}</span>
              <span className="text-xs text-muted">{node.state.replace("*", "")}</span>
              {node.gpus_total > 0 && (
                <span className="font-mono text-xs text-muted">
                  {node.gpus_alloc}/{node.gpus_total} GPU
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Users + Fairshare */}
      {slurm.users.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-6">
          <h3 className="text-sm font-medium text-muted mb-4">Users & Fairshare</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {slurm.users.map((u, i) => (
              <div key={u.user} className="flex items-center justify-between rounded-xl bg-surface border border-border/50 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className={`text-sm font-semibold ${userColor(i)}`}>{u.user}</span>
                  <span className="text-xs text-muted">{u.account}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-sm font-mono font-medium">{u.gpus_running} GPU{u.gpus_running !== 1 ? "s" : ""}</span>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>{u.jobs_running} running</span>
                    {u.jobs_pending > 0 && <span className="text-yellow">{u.jobs_pending} pending</span>}
                    <span className="text-subtle">share:{u.shares}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Job Queue */}
      <div className="rounded-2xl bg-card border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted">
            Job Queue ({runningJobs.length} running{pendingJobs.length > 0 ? `, ${pendingJobs.length} pending` : ""})
          </h3>
        </div>

        {slurm.jobs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">No jobs in queue</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted">
                  <th className="pb-3 pr-4 font-medium">Job ID</th>
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">User</th>
                  <th className="pb-3 pr-4 font-medium">State</th>
                  <th className="pb-3 pr-4 font-medium">Node</th>
                  <th className="pb-3 pr-4 font-medium text-right">GPUs</th>
                  <th className="pb-3 pr-4 font-medium text-right">Elapsed</th>
                  <th className="pb-3 font-medium text-right">Limit</th>
                </tr>
              </thead>
              <tbody>
                {slurm.jobs.map(job => (
                  <tr key={job.job_id} className="border-b border-border/30 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-muted">{job.job_id}</td>
                    <td className="py-2.5 pr-4 font-medium truncate max-w-[200px]">{job.name}</td>
                    <td className="py-2.5 pr-4">{job.user}</td>
                    <td className="py-2.5 pr-4">{jobStateBadge(job.state)}</td>
                    <td className="py-2.5 pr-4 font-mono text-sm">
                      {job.node === "(pending)" ? (
                        <span className="text-muted italic">pending</span>
                      ) : job.node}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono">{job.gpus}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-muted">{job.time_elapsed || "--"}</td>
                    <td className="py-2.5 text-right font-mono text-muted">{job.time_limit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
