"use client";

import { useState, useEffect, useCallback } from "react";
import type { FleetStatus, HostHistory } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function useFleetStatus(intervalMs = 5000) {
  const [data, setData] = useState<FleetStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => clearInterval(id);
  }, [fetch_, intervalMs]);

  return { data, error };
}

export function useFleetHistory(intervalMs = 15000) {
  const [data, setData] = useState<HostHistory | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/history`);
      if (!res.ok) return;
      setData(await res.json());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => clearInterval(id);
  }, [fetch_, intervalMs]);

  return data;
}
