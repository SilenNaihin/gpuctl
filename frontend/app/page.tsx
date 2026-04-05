"use client";

import { useFleetStatus, useFleetHistory } from "./hooks";
import FleetOverview from "./components/FleetOverview";
import HostCard from "./components/HostCard";
import UtilChart from "./components/UtilChart";

function ConnectionError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red/10">
          <svg className="h-8 w-8 text-red" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold">Unable to connect</p>
          <p className="mt-1 text-sm text-muted">{message}</p>
          <p className="mt-2 text-xs text-muted/60">Retrying automatically...</p>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-sm text-muted">Connecting to fleet...</p>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: fleet, error } = useFleetStatus(5000);
  const history = useFleetHistory(10000);

  if (error && !fleet) return <ConnectionError message={error} />;
  if (!fleet) return <Loading />;

  const onlineHosts = fleet.hosts.filter((h) => h.online);
  const offlineHosts = fleet.hosts.filter((h) => !h.online);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <svg className="h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">gpuctl</h1>
            <p className="text-xs text-muted">GPU Fleet Monitor</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="rounded-full bg-yellow/10 px-3 py-1 text-xs text-yellow">
              Reconnecting...
            </span>
          )}
          <span className="rounded-full bg-card border border-border px-3 py-1 text-xs text-muted">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Fleet Overview Stats */}
      <FleetOverview fleet={fleet} />

      {/* Charts */}
      {history && Object.keys(history).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted">
            Utilization Trends
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {Object.entries(history).map(([name, points]) => (
              <UtilChart key={name} hostName={name} history={points} />
            ))}
          </div>
        </div>
      )}

      {/* Host Cards */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted">
          Hosts ({onlineHosts.length} online)
        </h2>
        <div className="grid gap-4">
          {onlineHosts.map((host) => (
            <HostCard key={host.name} host={host} />
          ))}
          {offlineHosts.map((host) => (
            <HostCard key={host.name} host={host} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 border-t border-border/50 pt-6 text-center text-xs text-muted/40">
        gpuctl — {fleet.total_gpus} GPUs across {fleet.hosts.length} hosts
      </div>
    </div>
  );
}
