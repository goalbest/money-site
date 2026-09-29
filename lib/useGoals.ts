"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "home_goals_v1";

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  startAmount: number;      // 起始金额（创建时自动记录）
  startDate: string;
  targetDate: string | null; // 期望完成日期
  createdAt: number;
};

function read(): Goal[] {
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

function write(list: Goal[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function useGoals(currentAmount: number) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setGoals(read());
    setHydrated(true);
  }, []);

  function add(input: {
    name: string;
    targetAmount: number;
    targetDate?: string | null;
  }) {
    const list = read();
    const g: Goal = {
      id: uid(),
      name: input.name.trim() || "我的目标",
      targetAmount: input.targetAmount,
      startAmount: currentAmount,
      startDate: new Date().toISOString().split("T")[0],
      targetDate: input.targetDate || null,
      createdAt: Date.now(),
    };
    const next = [...list, g];
    write(next);
    setGoals(next);
  }

  function update(id: string, patch: Partial<Goal>) {
    const list = read();
    const next = list.map(g => (g.id === id ? { ...g, ...patch } : g));
    write(next);
    setGoals(next);
  }

  function remove(id: string) {
    const list = read();
    const next = list.filter(g => g.id !== id);
    write(next);
    setGoals(next);
  }

  /** 计算某个目标的进度 */
  function calcProgress(g: Goal) {
    const needed = g.targetAmount - g.startAmount;
    const gained = currentAmount - g.startAmount;
    const percent = needed > 0 ? Math.max(0, Math.min(100, (gained / needed) * 100)) : 0;
    const remaining = Math.max(0, g.targetAmount - currentAmount);
    const reached = currentAmount >= g.targetAmount;

    // 期望完成日期 → 剩余天数
    let daysLeft: number | null = null;
    if (g.targetDate) {
      daysLeft = Math.max(0, Math.floor(
        (new Date(g.targetDate).getTime() - Date.now()) / 86400000
      ));
    }

    // 建议日均（剩余金额 / 剩余天数）
    let dailyNeeded: number | null = null;
    if (daysLeft != null && daysLeft > 0 && !reached) {
      dailyNeeded = remaining / daysLeft;
    }

    return { percent, remaining, reached, daysLeft, dailyNeeded };
  }

  return { goals, hydrated, add, update, remove, calcProgress };
}

export type GoalsData = ReturnType<typeof useGoals>;