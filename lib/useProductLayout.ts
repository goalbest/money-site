"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "product_layout_v1";

export const DEFAULT_PRODUCT_ORDER = [
  "holdings",
  "metrics",
  "trend",
  "navlist",
  "rules",
  "transactions",
] as const;

export type ProductModuleKey = typeof DEFAULT_PRODUCT_ORDER[number];

export const PRODUCT_MODULE_LABELS: Record<ProductModuleKey, string> = {
  holdings: "我的持仓",
  metrics: "关键指标",
  trend: "净值走势",
  navlist: "净值明细",
  rules: "监控规则",
  transactions: "交易记录",
};

function read(): ProductModuleKey[] {
  if (typeof window === "undefined") return [...DEFAULT_PRODUCT_ORDER];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_PRODUCT_ORDER];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_PRODUCT_ORDER];
    const valid = new Set<string>(DEFAULT_PRODUCT_ORDER);
    const cleaned = parsed.filter((k: any) => valid.has(k));
    for (const k of DEFAULT_PRODUCT_ORDER) {
      if (!cleaned.includes(k)) cleaned.push(k);
    }
    return cleaned as ProductModuleKey[];
  } catch {
    return [...DEFAULT_PRODUCT_ORDER];
  }
}

function write(order: ProductModuleKey[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {}
}

export function useProductLayout() {
  const [order, setOrder] = useState<ProductModuleKey[]>([...DEFAULT_PRODUCT_ORDER]);
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
    setOrder([...DEFAULT_PRODUCT_ORDER]);
    write([...DEFAULT_PRODUCT_ORDER]);
  }, []);

  return { order, hydrated, move, reset };
}

export type ProductLayout = ReturnType<typeof useProductLayout>;