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

/** ★ 清空指定日期之后的快照（删交易时调用） */
export function clearSnapshotsAfter(date: string) {
  if (typeof window === "undefined") return;
  try {
    const list = readAll();
    const filtered = list.filter(s => s.date < date);
    writeAll(filtered);
  } catch {}
}

/** ★ 清空所有快照 */
export function clearAllSnapshots() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** ★ 手动补录某天的快照 */
export function setSnapshotForDate(date: string, amount: number) {
  if (typeof window === "undefined") return;
  try {
    const list = readAll();
    const idx = list.findIndex(s => s.date === date);
    const entry: Snapshot = {
      date,
      amount,
      holding: amount,
      inTransit: 0,
    };
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.push(entry);
      list.sort((a, b) => a.date.localeCompare(b.date));
    }
    writeAll(list);
  } catch {}
}


/** ★ 从指定日期起，所有快照资产统一加 delta（用于交易增删改自动修正） */
export function adjustSnapshotsFrom(date: string, delta: number) {
  if (typeof window === "undefined") return;
  if (!delta) return;
  try {
    const list = readAll();
    const adjusted = list.map(s =>
      s.date >= date
        ? { ...s, amount: s.amount + delta, holding: s.holding + delta }
        : s
    );
    writeAll(adjusted);
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

  /** ★ 找指定日期或之前最近一天的快照 */
  function getSnapshotNear(date: string): Snapshot | null {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].date <= date) return snapshots[i];
    }
    return null;
  }

  return {
    snapshots,
    getSnapshotNear,
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