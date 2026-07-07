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

function ItemRow({ item }: { item: UsageItem }) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted" title={item.label}>
          {item.label}
        </span>
        <span className="shrink-0 text-xs font-medium">{item.value}</span>
      </div>
      {item.percent != null && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full ${barColor(item.percent)}`}
            style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
          />
        </div>
      )}
      {item.sub && <p className="mt-0.5 text-[11px] text-subtle">{item.sub}</p>}
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
        className="flex w-full flex-col gap-1 px-5 py-4 text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${STATUS_DOT[provider.status] ?? "bg-subtle"}`} />
            <span className="text-sm font-medium">{provider.name}</span>
            {provider.sub && (
              <span className="hidden text-xs text-subtle sm:inline">{provider.sub}</span>
            )}
          </div>
          {hasDetail && (
            <svg
              className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight">{provider.headline}</span>
          <span className="text-xs text-muted">{provider.headline_label}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/60 px-5 py-2.5">
          {provider.items.map((item, i) => (
            <ItemRow key={i} item={item} />
          ))}
          {provider.error && (
            <p className="py-1.5 text-[11px] text-red/80">{provider.error}</p>
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
      <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {providers.map((p) => (
          <UsageCard key={p.id} provider={p} />
        ))}
      </div>
    </div>
  );
}
