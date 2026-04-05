"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FleetStatus, HostHistory } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function useFleetStatus(intervalMs = 5000) {
  const [data, setData] = useState<FleetStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchData = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      if (manual) setTimeout(() => setIsRefreshing(false), 400);
    }
  }, []);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => fetchData(), intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [fetchData, intervalMs]);

  return { data, error, lastRefreshed, isRefreshing, refresh };
}

export function useFleetHistory(intervalMs = 15000) {
  const [data, setData] = useState<HostHistory | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/history`);
      if (!res.ok) return;
      setData(await res.json());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, intervalMs);
    return () => clearInterval(id);
  }, [fetchData, intervalMs]);

  return data;
}

export function useRelativeTime(date: Date | null) {
  const [text, setText] = useState("--");

  useEffect(() => {
    if (!date) return;
    const update = () => {
      const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
      if (seconds < 5) setText("just now");
      else if (seconds < 60) setText(`${seconds}s ago`);
      else setText(`${Math.floor(seconds / 60)}m ago`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [date]);

  return text;
}
