// lib/homeMetrics.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  purchase_amount?: number | null;
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
  value: number;
  unit: string;
  reason?: string;
};

export type HomeMetrics = {
  totalAssets: number;
  totalHolding: number;
  totalInTransit: number;
  todayProfit: number;
  count: number;

  topHoldings: Holding[];
  topToday: (Holding & { todayProfit: number; rate: number })[];

  pendingCount: number;
  abnormalDrops: AlertItem[];
  newHighs: AlertItem[];
  idleLongs: AlertItem[];
  streakWins: AlertItem[];
  takeProfits: AlertItem[];
  stopLosses: AlertItem[];
  navStaleCount: number;

  monthBuyAmount: number;
  monthSellAmount: number;
  monthProfit: number;
  assetDistribution: BankSlice[];
  topBank: BankSlice | null;
  bestProduct: { name: string; profit: number; rate: number } | null;
  worstProduct: { name: string; profit: number; rate: number } | null;
  holdDaysDist: { short: number; mid: number; long: number };
  maxDrawdown: number;

  myAnnual: number;
  beatDeposit: { diff: number; positive: boolean };
  beatInflation: { diff: number; positive: boolean };
};

/* ============================================================
   常量
   ============================================================ */

const DEPOSIT_RATE = 1.45;
const INFLATION_RATE = 0.3;
const ABNORMAL_DROP_THRESHOLD = -0.5;
const TAKE_PROFIT_THRESHOLD = 5;
const STOP_LOSS_THRESHOLD = -3;
const IDLE_DAYS = 60;
const STALE_DAYS = 3;
const NEW_HIGH_WINDOW = 90;
const STREAK_DAYS = 7;

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

function getMonthStart(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
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
   ★ 单次遍历：holdings 所有派生
   ============================================================ */

function computeHoldingsDerived(
  holdings: Holding[],
  txByProduct: Map<number, TxRow[]>
) {
  let totalHolding = 0;
  let totalInTransit = 0;
  let todayProfit = 0;
  let navStaleCount = 0;
  let short = 0, mid = 0, long = 0;
  let weightedAnnual = 0;

  const today = todayStr();

  const abnormalDrops: AlertItem[] = [];
  const takeProfits: AlertItem[] = [];
  const stopLosses: AlertItem[] = [];
  const idleLongs: AlertItem[] = [];
  const bankMap = new Map<string, number>();

  let best: { name: string; profit: number; rate: number } | null = null;
  let worst: { name: string; profit: number; rate: number } | null = null;

  const topToday: (Holding & { todayProfit: number; rate: number })[] = [];

  for (const h of holdings) {
    const hold = Number(h.holding_amount || 0);
    const transit = Number(h.in_transit_amount || 0);
    const daily = Number(h.products?.daily_return || 0);
    const annual = Number(h.products?.annualized_1m || 0);
    const purchase = Number(h.purchase_amount || 0);

    totalHolding += hold;
    totalInTransit += transit;

    const todayP = (hold * daily) / 10000;
    todayProfit += todayP;
    topToday.push({ ...h, todayProfit: todayP, rate: daily });

    /* --- 异常波动 --- */
    if (daily < ABNORMAL_DROP_THRESHOLD) {
      abnormalDrops.push({
        holdingId: h.id, productId: h.product_id,
        name: h.products?.name || "", bank: h.products?.bank || "",
        value: daily, unit: "%", reason: "单日下跌",
      });
    }

    /* --- 止盈 / 止损 / 最佳最差 --- */
    if (purchase > 0 && hold > 0) {
      const rate = ((hold - purchase) / purchase) * 100;
      if (rate > TAKE_PROFIT_THRESHOLD) {
        takeProfits.push({
          holdingId: h.id, productId: h.product_id,
          name: h.products?.name || "", bank: h.products?.bank || "",
          value: rate, unit: "%", reason: "考虑止盈",
        });
      }
      if (rate < STOP_LOSS_THRESHOLD) {
        stopLosses.push({
          holdingId: h.id, productId: h.product_id,
          name: h.products?.name || "", bank: h.products?.bank || "",
          value: rate, unit: "%", reason: "建议止损",
        });
      }
      const item = { name: h.products?.name || "", profit: hold - purchase, rate };
      if (!best || item.rate > best.rate) best = item;
      if (!worst || item.rate < worst.rate) worst = item;
    }

    /* --- 净值更新 --- */
    const navDate = h.products?.nav_date;
    if (!navDate || daysBetween(navDate, today) > STALE_DAYS) {
      navStaleCount++;
    }

    /* --- 持有天数 + 长期未动 --- */
    if (h.hold_date) {
      const days = daysBetween(h.hold_date, today);
      if (days < 30) short++;
      else if (days < 180) mid++;
      else long++;

      if (days >= IDLE_DAYS) {
        const txs = txByProduct.get(h.product_id) || [];
        let buyCount = 0;
        for (const t of txs) if (t.type === "buy") buyCount++;
        if (buyCount <= 1) {
          idleLongs.push({
            holdingId: h.id, productId: h.product_id,
            name: h.products?.name || "", bank: h.products?.bank || "",
            value: days, unit: "天", reason: "从未加仓",
          });
        }
      }
    }

    /* --- 资产分布 --- */
    const bank = h.products?.bank || "其他";
    bankMap.set(bank, (bankMap.get(bank) || 0) + hold);

    /* --- 加权年化 --- */
    weightedAnnual += hold * annual;
  }

  /* --- 排序 --- */
  const topHoldings = [...holdings].sort(
    (a, b) => Number(b.holding_amount || 0) - Number(a.holding_amount || 0)
  );
  topToday.sort((a, b) => b.todayProfit - a.todayProfit);
  abnormalDrops.sort((a, b) => a.value - b.value);
  takeProfits.sort((a, b) => b.value - a.value);
  stopLosses.sort((a, b) => a.value - b.value);
  idleLongs.sort((a, b) => b.value - a.value);

  /* --- 资产分布 --- */
  const assetDistribution: BankSlice[] = Array.from(bankMap.entries())
    .map(([bank, amount]) => ({
      bank, amount,
      percent: totalHolding > 0 ? (amount / totalHolding) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalAssets: totalHolding + totalInTransit,
    totalHolding,
    totalInTransit,
    todayProfit,
    count: holdings.length,
    topHoldings,
    topToday,
    abnormalDrops,
    takeProfits,
    stopLosses,
    navStaleCount,
    idleLongs,
    assetDistribution,
    topBank: assetDistribution[0] || null,
    bestProduct: best,
    worstProduct: worst,
    holdDaysDist: { short, mid, long },
    myAnnual: totalHolding > 0 ? weightedAnnual / totalHolding : 0,
  };
}

/* ============================================================
   ★ 单次遍历：nav 相关派生
   ============================================================ */

function computeNavDerived(
  holdings: Holding[],
  navByProduct: Map<number, NavPoint[]>
) {
  const newHighs: AlertItem[] = [];
  const streakWins: AlertItem[] = [];
  const cutoff = daysAgo(NEW_HIGH_WINDOW);
  const mStart = getMonthStart();

  let maxDrawdown = 0;

  /* 先遍历 navByProduct 算全局 maxDrawdown（无需 holdings） */
  for (const navs of navByProduct.values()) {
    if (navs.length < 2) continue;
    let peak = navs[0].nav;
    for (let i = 1; i < navs.length; i++) {
      const v = navs[i].nav;
      if (v > peak) peak = v;
      else if (peak > 0) {
        const dd = ((peak - v) / peak) * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
    }
  }

  let monthProfit = 0;

  /* 再遍历 holdings：newHighs / streakWins / monthProfit */
  for (const h of holdings) {
    const navs = navByProduct.get(h.product_id);
    if (!navs || navs.length < 2) continue;

    /* --- 创新高 --- */
    if (navs.length >= 5) {
      let recentStartIdx = -1;
      for (let i = navs.length - 1; i >= 0; i--) {
        if (navs[i].date >= cutoff) recentStartIdx = i;
        else break;
      }
      if (recentStartIdx >= 0 && navs.length - recentStartIdx >= 5) {
        let mx = 0;
        for (let i = recentStartIdx; i < navs.length; i++) {
          if (navs[i].nav > mx) mx = navs[i].nav;
        }
        const latest = navs[navs.length - 1].nav;
        if (latest >= mx - 0.00005) {
          newHighs.push({
            holdingId: h.id, productId: h.product_id,
            name: h.products?.name || "", bank: h.products?.bank || "",
            value: latest, unit: "", reason: "创新高",
          });
        }
      }
    }

    /* --- 连续上涨 --- */
    if (navs.length >= STREAK_DAYS + 1) {
      let streak = 0;
      for (let i = navs.length - 1; i > 0 && streak < STREAK_DAYS; i--) {
        if (navs[i].nav > navs[i - 1].nav) streak++;
        else break;
      }
      if (streak >= STREAK_DAYS) {
        streakWins.push({
          holdingId: h.id, productId: h.product_id,
          name: h.products?.name || "", bank: h.products?.bank || "",
          value: streak, unit: "天", reason: "连续上涨",
        });
      }
    }

    /* --- 本月收益 --- */
    let firstThisMonth: number | null = null;
    let lastThisMonth: number | null = null;
    for (const n of navs) {
      if (n.date >= mStart) {
        if (firstThisMonth == null) firstThisMonth = n.nav;
        lastThisMonth = n.nav;
      }
    }
    if (firstThisMonth != null && lastThisMonth != null && firstThisMonth !== lastThisMonth) {
      const shares = Number(h.shares || 0);
      const amount = Number(h.holding_amount || 0);
      if (shares > 0) monthProfit += shares * (lastThisMonth - firstThisMonth);
      else if (amount > 0 && firstThisMonth > 0) {
        monthProfit += amount * ((lastThisMonth - firstThisMonth) / firstThisMonth);
      }
    }
  }

  newHighs.sort((a, b) => b.value - a.value);
  streakWins.sort((a, b) => b.value - a.value);

  return { newHighs, streakWins, maxDrawdown, monthProfit };
}

/* ============================================================
   单次遍历：transactions 月度统计
   ============================================================ */

function computeMonthTxStats(txs: TxRow[]) {
  const { start, end } = getMonthRange();
  let buyAmount = 0;
  let sellAmount = 0;
  for (const tx of txs) {
    if (tx.trade_date < start || tx.trade_date > end) continue;
    if (tx.type === "buy") buyAmount += Number(tx.amount || 0);
    else if (tx.type === "sell" || tx.type === "close") sellAmount += Number(tx.amount || 0);
  }
  return { buyAmount, sellAmount };
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

  /* ---------- Stage 2：扩展数据延迟加载 ---------- */
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
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stage, holdings]);

  /* ---------- 派生指标：单次遍历合并 ---------- */
  const metrics: HomeMetrics = useMemo(() => {
    /* 1. 构建 txByProduct */
    const txByProduct = new Map<number, TxRow[]>();
    for (const tx of transactions) {
      let arr = txByProduct.get(tx.product_id);
      if (!arr) { arr = []; txByProduct.set(tx.product_id, arr); }
      arr.push(tx);
    }

    /* 2. 一次遍历 holdings */
    const hd = computeHoldingsDerived(holdings, txByProduct);

    /* 3. 一次遍历 nav */
    const nd = computeNavDerived(holdings, navByProduct);

    /* 4. 月度交易统计 */
    const { buyAmount, sellAmount } = computeMonthTxStats(transactions);

    return {
      ...hd,
      pendingCount,
      newHighs: nd.newHighs,
      streakWins: nd.streakWins,
      maxDrawdown: nd.maxDrawdown,
      monthProfit: nd.monthProfit,
      monthBuyAmount: buyAmount,
      monthSellAmount: sellAmount,
      beatDeposit: { diff: hd.myAnnual - DEPOSIT_RATE, positive: hd.myAnnual > DEPOSIT_RATE },
      beatInflation: { diff: hd.myAnnual - INFLATION_RATE, positive: hd.myAnnual > INFLATION_RATE },
    };
  }, [holdings, transactions, navByProduct, pendingCount]);

    /* ★ 计算从 refDate 到今天的累计收益 */
  const getPeriodProfit = useCallback((refDate: string): number => {
    if (!refDate) return 0;
    let total = 0;
    for (const h of holdings) {
      const navs = navByProduct.get(h.product_id);
      if (!navs || navs.length < 2) continue;
      const shares = Number(h.shares || 0);
      if (shares <= 0) continue;
      for (let i = 1; i < navs.length; i++) {
        if (navs[i].date < refDate) continue;
        total += shares * (navs[i].nav - navs[i - 1].nav);
      }
    }
    return total;
  }, [holdings, navByProduct]);

  return { metrics, loading, stage, getPeriodProfit };
}