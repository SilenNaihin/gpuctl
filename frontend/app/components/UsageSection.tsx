"use client";

import { useState } from "react";
import type { ProviderUsage, UsageItem } from "../types";

const STATUS_DOT: Record<string, string> = {
  ok: "bg-green",
  auth_needed: "bg-yellow",
  error: "bg-red",
};

function barColor(percent: number) {
  if (percent >= 90) return "bg-red";
  if (percent >= 70) return "bg-yellow";
  return "bg-accent";
}

function Bar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-border ${className}`}>
      <div
        className={`h-full rounded-full ${barColor(percent)}`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function ItemRow({ item }: { item: UsageItem }) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-muted" title={item.label}>
          {item.label}
        </span>
        <span className="shrink-0 text-sm font-medium tabular-nums">{item.value}</span>
      </div>
      {item.percent != null && <Bar percent={item.percent} className="mt-1.5" />}
      {item.sub && <p className="mt-1 text-xs text-subtle">{item.sub}</p>}
    </div>
  );
}

function UsageCard({ provider }: { provider: ProviderUsage }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = provider.items.length > 0 || !!provider.error;

  return (
    <div className="rounded-2xl border border-border bg-card transition-colors hover:bg-card-hover">
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className="w-full px-6 py-5 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[provider.status] ?? "bg-subtle"}`} />
            <span className="truncate text-sm font-medium">{provider.name}</span>
          </div>
          {hasDetail && (
            <svg
              className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {provider.headline}
          </span>
          <span className="truncate text-sm text-muted">{provider.headline_label}</span>
        </div>

        {provider.percent != null && <Bar percent={provider.percent} className="mt-3" />}

        {(provider.sub || provider.percent != null) && (
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="truncate text-sm text-muted">{provider.sub}</span>
            {provider.percent != null && (
              <span className="shrink-0 text-xs text-subtle tabular-nums">
                {provider.percent.toFixed(0)}%
              </span>
            )}
          </div>
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-border/50 border-t border-border/60 px-6 py-1.5">
          {provider.items.map((item, i) => (
            <ItemRow key={i} item={item} />
          ))}
          {provider.error && (
            <p className="py-2.5 text-xs text-red/80">{provider.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function UsageSection({ providers }: { providers: ProviderUsage[] }) {
  if (providers.length === 0) return null;
  return (
    <div className="mt-10">
      <h2 className="mb-5 text-sm font-medium uppercase tracking-wider text-muted">
        Model Accounts
      </h2>
      <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => (
          <UsageCard key={p.id} provider={p} />
        ))}
      </div>
    </div>
  );
}
