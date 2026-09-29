"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "asset_snapshots_v1";
const MAX_DAYS = 90;

export type Snapshot = {
  date: string;      // YYYY-MM-DD
  amount: number;    // 总资产
  holding: number;
  inTransit: number;
};

function readAll(): Snapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: Snapshot[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_DAYS)));
  } catch {}
}

export function useAssetSnapshots(input: {
  amount: number;
  holding: number;
  inTransit: number;
  ready: boolean;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // 写入今天的快照
  useEffect(() => {
    if (!input.ready) return;
    if (input.amount <= 0) return;

    const today = new Date().toISOString().split("T")[0];
    const list = readAll();
    const idx = list.findIndex(s => s.date === today);
    const entry: Snapshot = {
      date: today,
      amount: input.amount,
      holding: input.holding,
      inTransit: input.inTransit,
    };
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.push(entry);
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    writeAll(list);
    setSnapshots(list);
  }, [input.amount, input.holding, input.inTransit, input.ready]);

  // 计算趋势
  const trend = (() => {
    if (snapshots.length < 2) {
      return { d7: 0, d30: 0, p7: 0, p30: 0, has7d: false, has30d: false };
    }
    const today = snapshots[snapshots.length - 1];

    const cutoffDate = (days: number) => {
      const d = new Date(today.date);
      d.setDate(d.getDate() - days);
      return d.toISOString().split("T")[0];
    };

    const findRef = (cutStr: string) => {
      for (let i = snapshots.length - 1; i >= 0; i--) {
        if (snapshots[i].date <= cutStr) return snapshots[i];
      }
      return snapshots[0];
    };

    const ref7 = findRef(cutoffDate(7));
    const ref30 = findRef(cutoffDate(30));

    const d7 = today.amount - ref7.amount;
    const d30 = today.amount - ref30.amount;
    const p7 = ref7.amount > 0 ? (d7 / ref7.amount) * 100 : 0;
    const p30 = ref30.amount > 0 ? (d30 / ref30.amount) * 100 : 0;

    // 只有和参考点间隔 >= 5 天才算"有 7 天数据"
    const daysSince = (d: string) =>
      Math.floor((new Date(today.date).getTime() - new Date(d).getTime()) / 86400000);

    return {
      d7, d30, p7, p30,
      has7d: daysSince(ref7.date) >= 5,
      has30d: daysSince(ref30.date) >= 25,
    };
  })();

  return {
    snapshots,
    trend7d: trend.d7,
    trend30d: trend.d30,
    trend7dPercent: trend.p7,
    trend30dPercent: trend.p30,
    has7d: trend.has7d,
    has30d: trend.has30d,
    hasEnoughData: snapshots.length >= 2,
  };
}

export type SnapData = ReturnType<typeof useAssetSnapshots>;