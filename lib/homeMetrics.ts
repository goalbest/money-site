// lib/homeMetrics.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

/* ============================================================
   类型定义
   ============================================================ */

export type Holding = {
  id: number;
  product_id: number;
  holding_amount: number;
  in_transit_amount: number;
  shares: number;
  hold_date: string | null;
  products: {
    id: number;
    name: string;
    bank: string;
    category?: string | null;
    unit_nav: number | null;
    annualized_1m: number | null;
    daily_return: number | null;
    nav_date: string | null;
  } | null;
};

export type TxRow = {
  id: number;
  product_id: number;
  type: string;
  amount: number;
  shares: number;
  price: number | null;
  trade_date: string;
};

export type NavPoint = { date: string; nav: number };

export type BankSlice = { bank: string; amount: number; percent: number };

export type AlertItem = {
  holdingId: number;
  productId: number;
  name: string;
  bank: string;
  value: number;   // 用于显示的主要数值
  unit: string;    // 后缀 "%"、"天"、"元" 等
  reason?: string;
};

export type HomeMetrics = {
  // 基础汇总
  totalAssets: number;
  totalHolding: number;
  totalInTransit: number;
  todayProfit: number;
  count: number;

  // 列表
  topHoldings: Holding[];
  topToday: (Holding & { todayProfit: number; rate: number })[];

  // 提醒类
  pendingCount: number;
  abnormalDrops: AlertItem[];
  newHighs: AlertItem[];
  idleLongs: AlertItem[];
  streakWins: AlertItem[];
  takeProfits: AlertItem[];
  stopLosses: AlertItem[];
  navStaleCount: number;

  // 分析类
  monthBuyAmount: number;
  monthSellAmount: number;
  monthProfit: number;
  assetDistribution: BankSlice[];
  topBank: BankSlice | null;
  bestProduct: { name: string; profit: number; rate: number } | null;
  worstProduct: { name: string; profit: number; rate: number } | null;
  holdDaysDist: { short: number; mid: number; long: number };
  maxDrawdown: number;

  // 对比
  myAnnual: number;
  beatDeposit: { diff: number; positive: boolean };
  beatInflation: { diff: number; positive: boolean };
};

/* ============================================================
   常量
   ============================================================ */

const DEPOSIT_RATE = 1.45;   // 3 年定存年化（%）
const INFLATION_RATE = 0.3;  // 年化 CPI（%）
const ABNORMAL_DROP_THRESHOLD = -0.5;   // 单日跌超 0.5%
const TAKE_PROFIT_THRESHOLD = 5;         // 收益 >5%
const STOP_LOSS_THRESHOLD = -3;          // 亏损 <-3%
const IDLE_DAYS = 60;                     // 持有超 60 天
const STALE_DAYS = 3;                     // 净值超 3 天未更新
const NEW_HIGH_WINDOW = 90;               // 近 90 天
const STREAK_DAYS = 7;                    // 连续 7 天

/* ============================================================
   工具函数
   ============================================================ */

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.floor((d2 - d1) / 86400000);
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

/* ============================================================
   派生计算（纯函数）
   ============================================================ */

function computeBase(holdings: Holding[]) {
  let totalHolding = 0;
  let totalInTransit = 0;
  let todayProfit = 0;

  for (const h of holdings) {
    const hold = Number(h.holding_amount || 0);
    const transit = Number(h.in_transit_amount || 0);
    const daily = Number(h.products?.daily_return || 0);
    totalHolding += hold;
    totalInTransit += transit;
    todayProfit += (hold * daily) / 10000;
  }

  return {
    totalAssets: totalHolding + totalInTransit,
    totalHolding,
    totalInTransit,
    todayProfit,
    count: holdings.length,
  };
}

function computeTopHoldings(holdings: Holding[]): Holding[] {
  return [...holdings].sort(
    (a, b) => Number(b.holding_amount || 0) - Number(a.holding_amount || 0)
  );
}

function computeTopToday(holdings: Holding[]) {
  const arr: (Holding & { todayProfit: number; rate: number })[] = [];
  for (const h of holdings) {
    const profit = (Number(h.holding_amount || 0) * Number(h.products?.daily_return || 0)) / 10000;
    arr.push({ ...h, todayProfit: profit, rate: Number(h.products?.daily_return || 0) });
  }
  arr.sort((a, b) => b.todayProfit - a.todayProfit);
  return arr;
}

function computeAbnormalDrops(holdings: Holding[]): AlertItem[] {
  const out: AlertItem[] = [];
  for (const h of holdings) {
    const r = Number(h.products?.daily_return || 0);
    if (r < ABNORMAL_DROP_THRESHOLD) {
      out.push({
        holdingId: h.id,
        productId: h.product_id,
        name: h.products?.name || "",
        bank: h.products?.bank || "",
        value: r,
        unit: "%",
        reason: "单日下跌",
      });
    }
  }
  return out.sort((a, b) => a.value - b.value);
}

function computeTakeProfits(holdings: Holding[]): AlertItem[] {
  const out: AlertItem[] = [];
  for (const h of holdings) {
    const purchase = Number((h as any).purchase_amount || 0);
    const hold = Number(h.holding_amount || 0);
    if (purchase <= 0) continue;
    const rate = ((hold - purchase) / purchase) * 100;
    if (rate > TAKE_PROFIT_THRESHOLD) {
      out.push({
        holdingId: h.id,
        productId: h.product_id,
        name: h.products?.name || "",
        bank: h.products?.bank || "",
        value: rate,
        unit: "%",
        reason: "考虑止盈",
      });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

function computeStopLosses(holdings: Holding[]): AlertItem[] {
  const out: AlertItem[] = [];
  for (const h of holdings) {
    const purchase = Number((h as any).purchase_amount || 0);
    const hold = Number(h.holding_amount || 0);
    if (purchase <= 0) continue;
    const rate = ((hold - purchase) / purchase) * 100;
    if (rate < STOP_LOSS_THRESHOLD) {
      out.push({
        holdingId: h.id,
        productId: h.product_id,
        name: h.products?.name || "",
        bank: h.products?.bank || "",
        value: rate,
        unit: "%",
        reason: "建议止损",
      });
    }
  }
  return out.sort((a, b) => a.value - b.value);
}

function computeIdleLongs(
  holdings: Holding[],
  txByProduct: Map<number, TxRow[]>
): AlertItem[] {
  const today = todayStr();
  const out: AlertItem[] = [];
  for (const h of holdings) {
    if (!h.hold_date) continue;
    const days = daysBetween(h.hold_date, today);
    if (days < IDLE_DAYS) continue;
    const txs = txByProduct.get(h.product_id) || [];
    const buyCount = txs.filter(t => t.type === "buy").length;
    if (buyCount > 1) continue;
    out.push({
      holdingId: h.id,
      productId: h.product_id,
      name: h.products?.name || "",
      bank: h.products?.bank || "",
      value: days,
      unit: "天",
      reason: "从未加仓",
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

function computeNavStale(holdings: Holding[]): number {
  const today = todayStr();
  let count = 0;
  for (const h of holdings) {
    const navDate = h.products?.nav_date;
    if (!navDate) {
      count++;
      continue;
    }
    if (daysBetween(navDate, today) > STALE_DAYS) count++;
  }
  return count;
}

function computeNewHighs(
  holdings: Holding[],
  navByProduct: Map<number, NavPoint[]>
): AlertItem[] {
  const out: AlertItem[] = [];
  const cutoff = daysAgo(NEW_HIGH_WINDOW);
  for (const h of holdings) {
    const navs = navByProduct.get(h.product_id);
    if (!navs || navs.length < 5) continue;
    const recent = navs.filter(n => n.date >= cutoff);
    if (recent.length < 5) continue;
    const latest = recent[recent.length - 1].nav;
    const max = Math.max(...recent.map(n => n.nav));
    if (latest >= max - 0.00005) {
      out.push({
        holdingId: h.id,
        productId: h.product_id,
        name: h.products?.name || "",
        bank: h.products?.bank || "",
        value: latest,
        unit: "",
        reason: "创新高",
      });
    }
  }
  return out;
}

function computeStreakWins(
  holdings: Holding[],
  navByProduct: Map<number, NavPoint[]>
): AlertItem[] {
  const out: AlertItem[] = [];
  for (const h of holdings) {
    const navs = navByProduct.get(h.product_id);
    if (!navs || navs.length < STREAK_DAYS + 1) continue;
    let streak = 0;
    for (let i = navs.length - 1; i > 0 && streak < STREAK_DAYS; i--) {
      if (navs[i].nav > navs[i - 1].nav) streak++;
      else break;
    }
    if (streak >= STREAK_DAYS) {
      out.push({
        holdingId: h.id,
        productId: h.product_id,
        name: h.products?.name || "",
        bank: h.products?.bank || "",
        value: streak,
        unit: "天",
        reason: "连续上涨",
      });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

function computeAssetDistribution(holdings: Holding[], totalHolding: number): BankSlice[] {
  if (totalHolding <= 0) return [];
  const map = new Map<string, number>();
  for (const h of holdings) {
    const bank = h.products?.bank || "其他";
    map.set(bank, (map.get(bank) || 0) + Number(h.holding_amount || 0));
  }
  return Array.from(map.entries())
    .map(([bank, amount]) => ({
      bank,
      amount,
      percent: (amount / totalHolding) * 100,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function computeBestWorst(holdings: Holding[]) {
  let best: any = null;
  let worst: any = null;
  for (const h of holdings) {
    const purchase = Number((h as any).purchase_amount || 0);
    const hold = Number(h.holding_amount || 0);
    if (purchase <= 0) continue;
    const profit = hold - purchase;
    const rate = (profit / purchase) * 100;
    const item = { name: h.products?.name || "", profit, rate };
    if (!best || item.rate > best.rate) best = item;
    if (!worst || item.rate < worst.rate) worst = item;
  }
  return { best, worst };
}

function computeHoldDaysDist(holdings: Holding[]) {
  const today = todayStr();
  let short = 0, mid = 0, long = 0;
  for (const h of holdings) {
    if (!h.hold_date) continue;
    const days = daysBetween(h.hold_date, today);
    if (days < 30) short++;
    else if (days < 180) mid++;
    else long++;
  }
  return { short, mid, long };
}

function computeMaxDrawdown(navByProduct: Map<number, NavPoint[]>): number {
  let globalMax = 0;
  for (const navs of navByProduct.values()) {
    if (navs.length < 2) continue;
    let peak = navs[0].nav;
    let maxDD = 0;
    for (let i = 1; i < navs.length; i++) {
      if (navs[i].nav > peak) peak = navs[i].nav;
      const dd = ((peak - navs[i].nav) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
    if (maxDD > globalMax) globalMax = maxDD;
  }
  return globalMax;
}

function computeMonthStats(
  txs: TxRow[],
  navByProduct: Map<number, NavPoint[]>,
  holdings: Holding[],
  monthProfitFromNav: number
) {
  const { start, end } = getMonthRange();
  let buyAmount = 0;
  let sellAmount = 0;
  for (const tx of txs) {
    if (tx.trade_date < start || tx.trade_date > end) continue;
    if (tx.type === "buy") buyAmount += Number(tx.amount || 0);
    else if (tx.type === "sell" || tx.type === "close") sellAmount += Number(tx.amount || 0);
  }
  return { buyAmount, sellAmount, monthProfit: monthProfitFromNav };
}

function computeMyAnnual(holdings: Holding[], totalHolding: number): number {
  if (totalHolding <= 0) return 0;
  let weightedSum = 0;
  for (const h of holdings) {
    const hold = Number(h.holding_amount || 0);
    const annual = Number(h.products?.annualized_1m || 0);
    weightedSum += (hold / totalHolding) * annual;
  }
  return weightedSum;
}

/* ============================================================
   Hook
   ============================================================ */

export function useHomeMetrics(enabled = true) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [navByProduct, setNavByProduct] = useState<Map<number, NavPoint[]>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<"core" | "extended" | "done">("core");
  const userIdRef = useRef<string | null>(null);

  /* ---------- Stage 1：核心数据（holdings）立即加载 ---------- */
  useEffect(() => {
    if (!enabled) return;
    const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
    if (!userId) {
      setLoading(false);
      setStage("done");
      return;
    }
    userIdRef.current = userId;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_holdings")
        .select(
          "id, product_id, holding_amount, in_transit_amount, shares, hold_date, purchase_amount, products(id, name, bank, category, unit_nav, annualized_1m, daily_return, nav_date)"
        )
        .eq("user_id", userId)
        .eq("status", "active");

      if (cancelled) return;
      setHoldings((data as any) || []);
      setLoading(false);
      setStage("extended");
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  /* ---------- Stage 2：扩展数据延迟加载（不阻塞首屏） ---------- */
  useEffect(() => {
    if (stage !== "extended") return;
    const userId = userIdRef.current;
    if (!userId) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;

      const [txRes, rulesRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, product_id, type, amount, shares, price, trade_date")
          .eq("user_id", userId)
          .gte("trade_date", daysAgo(90))
          .order("trade_date", { ascending: false }),
        supabase
          .from("watch_rules")
          .select("id, enabled")
          .eq("user_id", userId)
          .eq("enabled", true),
      ]);

      if (cancelled) return;
      setTransactions((txRes.data as any) || []);
      setPendingCount(rulesRes.data?.length || 0);

      // nav 历史也延迟拉
      const productIds = holdings.map(h => h.product_id).filter(Boolean);
      if (productIds.length > 0) {
        const { data: navs } = await supabase
          .from("nav_history")
          .select("product_id, nav_date, unit_nav")
          .in("product_id", productIds)
          .gte("nav_date", daysAgo(90))
          .order("nav_date", { ascending: true });

        if (cancelled) return;
        const map = new Map<number, NavPoint[]>();
        (navs || []).forEach((n: any) => {
          if (!map.has(n.product_id)) map.set(n.product_id, []);
          map.get(n.product_id)!.push({ date: n.nav_date, nav: Number(n.unit_nav) });
        });
        setNavByProduct(map);
      }

      setStage("done");
    }, 260); // 延迟 260ms，让首屏渲染完成

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stage, holdings]);

  /* ---------- 派生指标：单一 useMemo 缓存 ---------- */
  const metrics: HomeMetrics = useMemo(() => {
    const base = computeBase(holdings);
    const topHoldings = computeTopHoldings(holdings);
    const topToday = computeTopToday(holdings);
    const abnormalDrops = computeAbnormalDrops(holdings);
    const takeProfits = computeTakeProfits(holdings);
    const stopLosses = computeStopLosses(holdings);
    const navStaleCount = computeNavStale(holdings);

    const txByProduct = new Map<number, TxRow[]>();
    for (const tx of transactions) {
      if (!txByProduct.has(tx.product_id)) txByProduct.set(tx.product_id, []);
      txByProduct.get(tx.product_id)!.push(tx);
    }

    const idleLongs = computeIdleLongs(holdings, txByProduct);
    const newHighs = computeNewHighs(holdings, navByProduct);
    const streakWins = computeStreakWins(holdings, navByProduct);

    const assetDistribution = computeAssetDistribution(holdings, base.totalHolding);
    const topBank = assetDistribution[0] || null;
    const { best, worst } = computeBestWorst(holdings);
    const holdDaysDist = computeHoldDaysDist(holdings);
    const maxDrawdown = computeMaxDrawdown(navByProduct);

    // 本月收益（用 nav 差算）
    let monthProfit = 0;
    const mStart = getMonthRange().start;
    for (const h of holdings) {
      const navs = navByProduct.get(h.product_id);
      if (!navs || navs.length < 2) continue;
      const recent = navs.filter(n => n.date >= mStart);
      if (recent.length < 2) continue;
      const shares = Number(h.shares || 0);
      const amount = Number(h.holding_amount || 0);
      const first = recent[0].nav;
      const last = recent[recent.length - 1].nav;
      if (shares > 0) monthProfit += shares * (last - first);
      else if (amount > 0 && first > 0) monthProfit += amount * ((last - first) / first);
    }

    const { buyAmount, sellAmount } = computeMonthStats(
      transactions, navByProduct, holdings, monthProfit
    );

    const myAnnual = computeMyAnnual(holdings, base.totalHolding);

    return {
      ...base,
      topHoldings,
      topToday,
      pendingCount,
      abnormalDrops,
      newHighs,
      idleLongs,
      streakWins,
      takeProfits,
      stopLosses,
      navStaleCount,
      monthBuyAmount: buyAmount,
      monthSellAmount: sellAmount,
      monthProfit,
      assetDistribution,
      topBank,
      bestProduct: best,
      worstProduct: worst,
      holdDaysDist,
      maxDrawdown,
      myAnnual,
      beatDeposit: { diff: myAnnual - DEPOSIT_RATE, positive: myAnnual > DEPOSIT_RATE },
      beatInflation: { diff: myAnnual - INFLATION_RATE, positive: myAnnual > INFLATION_RATE },
    };
  }, [holdings, transactions, navByProduct, pendingCount]);

  return { metrics, loading, stage };
}