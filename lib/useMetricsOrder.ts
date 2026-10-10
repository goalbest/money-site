"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "metrics_order_v2";

export const DEFAULT_METRICS_ORDER = [
  "nav",
  "change",
  "annualized",
  "wanfen",
  "zero",
  "drawdown",
] as const;

export type MetricKey = typeof DEFAULT_METRICS_ORDER[number];

function read(): MetricKey[] {
  if (typeof window === "undefined") return [...DEFAULT_METRICS_ORDER];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_METRICS_ORDER];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_METRICS_ORDER];
    const valid = new Set<string>(DEFAULT_METRICS_ORDER);
    const cleaned = parsed.filter((k: any) => valid.has(k));
    for (const k of DEFAULT_METRICS_ORDER) {
      if (!cleaned.includes(k)) cleaned.push(k);
    }
    return cleaned as MetricKey[];
  } catch {
    return [...DEFAULT_METRICS_ORDER];
  }
}

function write(order: MetricKey[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {}
}

export function useMetricsOrder() {
  const [order, setOrder] = useState<MetricKey[]>([...DEFAULT_METRICS_ORDER]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOrder(read());
    setHydrated(true);
  }, []);

  const move = useCallback((from: number, to: number) => {
    if (from === to) return;
    setOrder(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      write(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setOrder([...DEFAULT_METRICS_ORDER]);
    write([...DEFAULT_METRICS_ORDER]);
  }, []);

  return { order, hydrated, move, reset };
}