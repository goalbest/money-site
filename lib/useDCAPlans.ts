"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "home_dca_plans_v1";

export type DCAPlan = {
  id: string;
  productId: number;
  productName: string;
  bank: string;
  amount: number;       // 每次金额
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  weekday?: number;     // 0-6，weekly/biweekly 用
  dayOfMonth?: number;  // 1-31，monthly 用
  startDate: string;
  nextDate: string;     // 下次执行日
  enabled: boolean;
  note?: string;
  createdAt: number;
};

function read(): DCAPlan[] {
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

function write(list: DCAPlan[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

/** 计算下一个执行日 */
function calcNextDate(
  plan: Omit<DCAPlan, "id" | "createdAt" | "nextDate">,
  fromDate: string = todayStr()
): string {
  const today = new Date(fromDate);

  if (plan.frequency === "daily") {
    const next = new Date(today);
    next.setDate(next.getDate() + 1);
    return next.toISOString().split("T")[0];
  }

  if (plan.frequency === "weekly" || plan.frequency === "biweekly") {
    const step = plan.frequency === "weekly" ? 7 : 14;
    const targetWeekday = plan.weekday ?? 1;
    const next = new Date(today);
    let diff = (targetWeekday - next.getDay() + 7) % 7;
    if (diff === 0) diff = step;
    next.setDate(next.getDate() + diff);
    return next.toISOString().split("T")[0];
  }

  // monthly
  const targetDay = plan.dayOfMonth ?? 1;
  const next = new Date(today);
  next.setMonth(next.getMonth() + 1);
  next.setDate(Math.min(targetDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next.toISOString().split("T")[0];
}

export function useDCAPlans() {
  const [plans, setPlans] = useState<DCAPlan[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPlans(read());
    setHydrated(true);
  }, []);

  function add(input: {
    productId: number;
    productName: string;
    bank: string;
    amount: number;
    frequency: DCAPlan["frequency"];
    weekday?: number;
    dayOfMonth?: number;
    note?: string;
  }) {
    const base = {
      ...input,
      startDate: todayStr(),
      enabled: true,
    };
    const plan: DCAPlan = {
      id: uid(),
      ...base,
      nextDate: calcNextDate(base),
      createdAt: Date.now(),
    };
    const next = [...read(), plan];
    write(next);
    setPlans(next);
  }

  function update(id: string, patch: Partial<DCAPlan>) {
    const list = read();
    const next = list.map((p) => {
      if (p.id !== id) return p;
      const merged = { ...p, ...patch };
      // 如果改了频率相关字段，重算 nextDate
      if (
        patch.frequency !== undefined ||
        patch.weekday !== undefined ||
        patch.dayOfMonth !== undefined
      ) {
        merged.nextDate = calcNextDate({
          productId: merged.productId,
          productName: merged.productName,
          bank: merged.bank,
          amount: merged.amount,
          frequency: merged.frequency,
          weekday: merged.weekday,
          dayOfMonth: merged.dayOfMonth,
          startDate: merged.startDate,
          enabled: merged.enabled,
          note: merged.note,
        });
      }
      return merged;
    });
    write(next);
    setPlans(next);
  }

  function remove(id: string) {
    const next = read().filter((p) => p.id !== id);
    write(next);
    setPlans(next);
  }

  function toggle(id: string) {
    const list = read();
    const next = list.map((p) =>
      p.id === id ? { ...p, enabled: !p.enabled } : p
    );
    write(next);
    setPlans(next);
  }

  /** 把已过期的计划推进到下一个周期（打开页面时调用） */
  function rollForward() {
    const today = todayStr();
    const list = read();
    let changed = false;
    const next = list.map((p) => {
      if (p.nextDate >= today) return p;
      // 一直推到 >= today
      let nextDate = p.nextDate;
      let safety = 0;
      while (nextDate < today && safety < 100) {
        nextDate = calcNextDate(
          {
            productId: p.productId,
            productName: p.productName,
            bank: p.bank,
            amount: p.amount,
            frequency: p.frequency,
            weekday: p.weekday,
            dayOfMonth: p.dayOfMonth,
            startDate: p.startDate,
            enabled: p.enabled,
            note: p.note,
          },
          nextDate
        );
        safety++;
      }
      changed = true;
      return { ...p, nextDate };
    });
    if (changed) {
      write(next);
      setPlans(next);
    }
  }

  /** 计算下次执行还有几天 */
  function daysUntil(date: string): number {
    return Math.max(0, Math.floor(
      (new Date(date).getTime() - new Date(todayStr()).getTime()) / 86400000
    ));
  }

  /** 每月总投入 */
  function monthlyTotal(): number {
    let total = 0;
    for (const p of plans) {
      if (!p.enabled) continue;
      if (p.frequency === "daily") total += p.amount * 30;
      else if (p.frequency === "weekly") total += p.amount * 4.33;
      else if (p.frequency === "biweekly") total += p.amount * 2.17;
      else if (p.frequency === "monthly") total += p.amount;
    }
    return total;
  }

  return {
    plans,
    hydrated,
    add,
    update,
    remove,
    toggle,
    rollForward,
    daysUntil,
    monthlyTotal,
  };
}

export type DCAData = ReturnType<typeof useDCAPlans>;

export const FREQUENCY_LABELS: Record<DCAPlan["frequency"], string> = {
  daily: "每天",
  weekly: "每周",
  biweekly: "每两周",
  monthly: "每月",
};

export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];