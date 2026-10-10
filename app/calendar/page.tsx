"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useCountUp } from "../../lib/useCountUp";
import { getBankInfo } from "../../lib/banks";

function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  const end = new Date(y, m, 0);
  return `${month}-${String(end.getDate()).padStart(2, "0")}`;
}
function prevMonthLastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function firstWeekday(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).getDay();
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtMonthCN(month: string) {
  const [y, m] = month.split("-");
  return `${y} 年 ${Number(m)} 月`;
}
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(2)}万`;
  return `${sign}${abs.toFixed(0)}`;
}

type ViewMode = "calendar" | "byProduct";

export default function CalendarPage() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = todayStr();

  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(false);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [navRows, setNavRows] = useState<any[]>([]);
  const [bankFilter, setBankFilter] = useState("全部");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);

  const [monthBuyTotal, setMonthBuyTotal] = useState<number | null>(null);
  const [monthSellTotal, setMonthSellTotal] = useState<number | null>(null);

  const [holdingsLoaded, setHoldingsLoaded] = useState(false);
  const [navCache, setNavCache] = useState<Record<string, any[]>>({});
  const [navLoading, setNavLoading] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const isCurrentMonth = month === currentMonth;

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setLoading(false);
      setHoldingsLoaded(true);
      return;
    }
    (async () => {
      const { data: hd } = await supabase
        .from("user_holdings")
        .select("id, product_id, shares, holding_amount, hold_date, products(id, name, bank, daily_return)")
        .eq("user_id", userId)
        .eq("status", "active");
      const rows = hd || [];
      setHoldings(rows);
      setHoldingsLoaded(true);
      if (rows.length === 0) setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!holdingsLoaded) return;
    if (holdings.length === 0) {
      setLoading(false);
      return;
    }

    if (navCache[month]) {
      setNavRows(navCache[month]);
      setLoading(false);
      setNavLoading(false);
      return;
    }

    if (!hasLoadedOnceRef.current) setLoading(true);
    setNavRows([]);
    setNavLoading(true);

    (async () => {
      const productIds = holdings.map((h: any) => h.product_id);
      const start = prevMonthLastDay(month);
      const end = monthEnd(month);
      const { data: navs } = await supabase
        .from("nav_history")
        .select("product_id, nav_date, unit_nav")
        .in("product_id", productIds)
        .gte("nav_date", start)
        .lte("nav_date", end)
        .order("nav_date", { ascending: true });
      const rows = navs || [];
      setNavRows(rows);
      setNavCache(prev => ({ ...prev, [month]: rows }));
      setLoading(false);
      setNavLoading(false);
      hasLoadedOnceRef.current = true;
    })();
  }, [month, holdingsLoaded, holdings.length]);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setMonthBuyTotal(0);
      setMonthSellTotal(0);
      return;
    }
    setMonthBuyTotal(null);
    setMonthSellTotal(null);
    (async () => {
      const start = `${month}-01`;
      const end = monthEnd(month);
      const { data } = await supabase
        .from("transactions")
        .select("type, amount, trade_date")
        .eq("user_id", userId)
        .gte("trade_date", start)
        .lte("trade_date", end);
      let buy = 0, sell = 0;
      for (const t of (data || []) as any[]) {
        if (t.type === "buy") buy += Number(t.amount || 0);
        else if (t.type === "sell" || t.type === "close") sell += Number(t.amount || 0);
      }
      setMonthBuyTotal(buy);
      setMonthSellTotal(sell);
    })();
  }, [month]);

  const {
    dayMap,
    productDayMap,
    productMonthlyMap,
    productZeroDaysMap,
    totalProfit,
    tradedDays,
  } = useMemo(() => {
    const sharesMap: Record<number, number> = {};
    const amountMap: Record<number, number> = {};
    const holdDateMap: Record<number, string | null> = {};
    holdings.forEach((h: any) => {
      sharesMap[h.product_id] = Number(h.shares) || 0;
      amountMap[h.product_id] = Number(h.holding_amount) || 0;
      holdDateMap[h.product_id] = h.hold_date || null;
    });

    const navByProduct: Record<number, { date: string; nav: number }[]> = {};
    navRows.forEach((r: any) => {
      if (!navByProduct[r.product_id]) navByProduct[r.product_id] = [];
      navByProduct[r.product_id].push({ date: r.nav_date, nav: Number(r.unit_nav) });
    });

    const dayMap: Record<string, number> = {};
    const productDayMap: Record<string, Record<number, number>> = {};
    const productMonthlyMap: Record<number, number> = {};
    const productZeroDaysMap: Record<number, number> = {};
    const mStart = `${month}-01`;
    const mEnd = monthEnd(month);

    Object.entries(navByProduct).forEach(([pidStr, list]) => {
      const pid = Number(pidStr);
      const shares = sharesMap[pid] || 0;
      const amount = amountMap[pid] || 0;
      const holdDate = holdDateMap[pid];
      if (shares <= 0 && amount <= 0) return;

      for (let i = 1; i < list.length; i++) {
        const t = list[i];
        const p = list[i - 1];
        if (t.date < mStart || t.date > mEnd) continue;
        if (holdDate && t.date < holdDate) continue;

        let profit = 0;
        if (shares > 0) {
          profit = shares * (t.nav - p.nav);
        } else if (amount > 0 && p.nav > 0) {
          profit = amount * ((t.nav - p.nav) / p.nav);
        }

        dayMap[t.date] = (dayMap[t.date] || 0) + profit;
        if (!productDayMap[t.date]) productDayMap[t.date] = {};
        productDayMap[t.date][pid] = profit;
        productMonthlyMap[pid] = (productMonthlyMap[pid] || 0) + profit;
        if (profit <= 0) {
          productZeroDaysMap[pid] = (productZeroDaysMap[pid] || 0) + 1;
        }
      }
    });

    const values = Object.values(dayMap);
    return {
      dayMap,
      productDayMap,
      productMonthlyMap,
      productZeroDaysMap,
      totalProfit: values.reduce((a, b) => a + b, 0),
      tradedDays: values.length,
    };
  }, [holdings, navRows, month, today]);

  const availableBanks = useMemo(() => {
    const set = new Set<string>();
    holdings.forEach((h: any) => {
      if (h.products?.bank) set.add(h.products.bank);
    });
    return ["全部", ...Array.from(set)];
  }, [holdings]);

  function getTotalDayProfit(date: string): number | null {
    if (!productDayMap[date]) return null;
    if (bankFilter === "全部") return dayMap[date] ?? null;
    let sum = 0;
    let has = false;
    Object.entries(productDayMap[date]).forEach(([pidStr, profit]) => {
      const pid = Number(pidStr);
      const meta = holdings.find((h: any) => h.product_id === pid)?.products;
      if (meta?.bank === bankFilter) {
        sum += profit;
        has = true;
      }
    });
    return has ? sum : null;
  }

  function getDisplayDayProfit(date: string): number | null {
    if (viewMode === "byProduct" && selectedProduct != null) {
      const p = productDayMap[date]?.[selectedProduct];
      return p ?? null;
    }
    return getTotalDayProfit(date);
  }

  function getDayProducts(date: string) {
    const dayProducts = productDayMap[date] || {};
    const rows: any[] = [];
    Object.entries(dayProducts).forEach(([pidStr, profit]) => {
      const pid = Number(pidStr);
      const meta = holdings.find((h: any) => h.product_id === pid)?.products;
      if (!meta) return;
      if (bankFilter !== "全部" && meta.bank !== bankFilter) return;
      rows.push({ productId: pid, name: meta.name, bank: meta.bank, profit });
    });
    return rows.sort((a, b) => b.profit - a.profit);
  }

  const selectedProductHolding = selectedProduct != null
    ? holdings.find((h: any) => h.product_id === selectedProduct)
    : null;
  const selectedProductMeta = selectedProductHolding?.products;

  const selectedProductMonthly = selectedProduct != null
    ? productMonthlyMap[selectedProduct] || 0
    : 0;

  const productMonthlyList = useMemo(() => {
    const rows: any[] = [];
    Object.entries(productMonthlyMap).forEach(([pidStr, profit]) => {
      const pid = Number(pidStr);
      const holding = holdings.find((h: any) => h.product_id === pid);
      const meta = holding?.products;
      if (!meta) return;
      if (bankFilter !== "全部" && meta.bank !== bankFilter) return;

      let days = 0;
      Object.keys(productDayMap).forEach(date => {
        if (productDayMap[date][pid] != null) days++;
      });

      rows.push({
        productId: pid,
        name: meta.name,
        bank: meta.bank,
        profit,
        days,
        zeroDays: productZeroDaysMap[pid] || 0,
        holdingId: holding?.id,
      });
    });
    return rows.sort((a, b) => b.profit - a.profit);
  }, [productMonthlyMap, productDayMap, productZeroDaysMap, holdings, bankFilter]);

  const dailyList = useMemo(() => {
    if (viewMode === "byProduct" && selectedProduct != null) {
      const rows: { date: string; profit: number; count: number }[] = [];
      Object.entries(productDayMap).forEach(([date, map]) => {
        const p = map[selectedProduct];
        if (p == null) return;
        rows.push({ date, profit: p, count: 1 });
      });
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    }

    // ★ 按 bankFilter 过滤 + 只统计符合筛选的产品
    const rows: { date: string; profit: number; count: number }[] = [];
    Object.entries(productDayMap).forEach(([date, map]) => {
      let sum = 0;
      let count = 0;
      Object.entries(map).forEach(([pidStr, profit]) => {
        const pid = Number(pidStr);
        const meta = holdings.find((h: any) => h.product_id === pid)?.products;
        if (!meta) return;
        if (bankFilter !== "全部" && meta.bank !== bankFilter) return;
        sum += profit;
        count++;
      });
      if (count > 0) {
        rows.push({ date, profit: sum, count });
      }
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [viewMode, selectedProduct, productDayMap, bankFilter, holdings]);

  const selectedProductDayProfit = selectedDate != null && selectedProduct != null
    ? productDayMap[selectedDate]?.[selectedProduct] ?? 0
    : 0;

  const displayTotalProfit = useMemo(() => {
    if (viewMode === "byProduct" && selectedProduct != null) {
      return selectedProductMonthly;
    }
    if (bankFilter === "全部") return totalProfit;
    let sum = 0;
    Object.entries(productMonthlyMap).forEach(([pidStr, profit]) => {
      const pid = Number(pidStr);
      const meta = holdings.find((h: any) => h.product_id === pid)?.products;
      if (meta?.bank === bankFilter) sum += profit;
    });
    return sum;
  }, [viewMode, selectedProduct, selectedProductMonthly, bankFilter, productMonthlyMap, totalProfit, holdings]);

  const endHolding = useMemo(
    () => holdings.reduce((s: number, h: any) => s + Number(h.holding_amount || 0), 0),
    [holdings]
  );

  const beginHolding = useMemo(() => {
    if (monthBuyTotal == null || monthSellTotal == null) return null;
    return endHolding - monthBuyTotal + monthSellTotal;
  }, [endHolding, monthBuyTotal, monthSellTotal]);

  const monthAnnual = useMemo(() => {
    if (beginHolding == null) return null;
    const totalDays = daysInMonth(month);
    const isCur = month === currentMonth;
    const daysPassed = isCur ? Math.min(now.getDate(), totalDays) : totalDays;
    if (daysPassed <= 0) return null;
    const avg = (beginHolding + endHolding) / 2;
    if (avg <= 0) return null;
    const rate = displayTotalProfit / avg;
    return rate * (365 / daysPassed) * 100;
  }, [beginHolding, endHolding, month, currentMonth, displayTotalProfit]);

  const animatedTotal = useCountUp(displayTotalProfit, 1200);

  const displayTradedDays = useMemo(() => {
    if (viewMode === "byProduct" && selectedProduct != null) {
      let count = 0;
      Object.keys(productDayMap).forEach(date => {
        if (productDayMap[date][selectedProduct] != null) count++;
      });
      return count;
    }
    return tradedDays;
  }, [viewMode, selectedProduct, productDayMap, tradedDays]);

  const maxAbs = useMemo(() => {
    let max = 1;
    if (viewMode === "byProduct" && selectedProduct != null) {
      Object.values(productDayMap).forEach(map => {
        const v = map[selectedProduct];
        if (v != null) max = Math.max(max, Math.abs(v));
      });
    } else {
      Object.values(dayMap).forEach(v => {
        max = Math.max(max, Math.abs(v));
      });
    }
    return max;
  }, [dayMap, productDayMap, viewMode, selectedProduct]);

  function goPrevMonth() {
    const [y, m] = month.split("-").map(Number);
    const prev = new Date(y, m - 2, 1);
    setMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDate(null);
  }
  function goNextMonth() {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(y, m, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDate(null);
  }
  function goToToday() {
    setMonth(currentMonth);
    setSelectedDate(null);
  }

  function fmtProfit(n: number) {
    if (privacy) return "••";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
  }
  function fmtCell(n: number) {
    if (privacy) return "••";
    if (n === 0) return "0";
    const sign = n > 0 ? "+" : "";
    const abs = Math.abs(n);
    if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}万`;
    return `${sign}${abs.toFixed(0)}`;
  }
  function fmtCellSmall(n: number) {
    if (privacy) return "••";
    if (n === 0) return "0";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}`;
  }

  const calendarCells = useMemo(() => {
    const firstDay = firstWeekday(month);
    const total = daysInMonth(month);
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      cells.push(`${month}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  if (loading) {
    return (
      <div className="min-h-screen pb-24">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="h-7 w-32 bg-slate-200/60 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-48 bg-slate-200/60 rounded animate-pulse mb-6" />
          <div className="h-40 rounded-3xl animate-pulse mb-5"
               style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 55%, #ec4899 100%)", opacity: 0.3 }} />
          <div className="card p-5 h-80 animate-pulse" />
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="min-h-screen pb-24">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="text-[22px] font-bold tracking-tight text-slate-900 mb-5">
            收益日历
          </div>
        </div>
        <div className="flex items-center justify-center px-5 mt-16">
          <div className="max-w-sm w-full text-center animate-fade-in-up">
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl
                            bg-gradient-to-br from-violet-500 to-purple-600
                            flex items-center justify-center
                            shadow-xl shadow-purple-500/25">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <rect x="3" y="5" width="18" height="16" rx="2.5" />
                <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
              </svg>
            </div>
            <div className="text-[20px] font-bold text-slate-900 mb-2">还没有持仓</div>
            <div className="text-[13px] text-slate-400 mb-8 leading-relaxed">
              添加第一笔理财，开始记录每日收益
            </div>
            <Link href="/add" className="btn-primary inline-block text-sm px-8 py-3">
              添加持仓
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isProductDetailMode = viewMode === "byProduct" && selectedProductMeta;

  /* 有效持仓区间展示：月初=月末只显示一个数 */
  const holdingRangeText = (() => {
    if (beginHolding == null) return "—";
    const lo = Math.min(beginHolding, endHolding);
    const hi = Math.max(beginHolding, endHolding);
    if (Math.abs(hi - lo) < 1) return `¥${fmtCompact(hi)}`;
    return `¥${fmtCompact(lo)} ~ ¥${fmtCompact(hi)}`;
  })();

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">

        {/* 顶部标题 */}
        <div className="flex items-center gap-3 mb-4 animate-fade-in-up">
          <div className="flex-1 min-w-0">
            <div className="text-[22px] font-bold tracking-tight text-slate-900 truncate">
              {isProductDetailMode ? "产品收益" : "收益日历"}
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5 truncate">
              {isProductDetailMode
                ? selectedProductMeta.name
                : "按天记录每笔持仓的净值变化"}
            </div>
          </div>
          <button
            onClick={() => setPrivacy(p => !p)}
            className="w-9 h-9 rounded-full bg-white border border-slate-200
                       hover:border-slate-300 hover:bg-slate-50
                       flex items-center justify-center flex-shrink-0
                       transition-all duration-300 active:scale-90"
          >
            {privacy ? (
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

        {/* Hero 卡 */}
        <div className="card-hero p-6 mb-5 animate-fade-in-up delay-1">
          <div className="dot-pattern" />
          <div className="relative z-10">
            <div className="text-[11px] text-white/70 tracking-wider mb-2">
              {isProductDetailMode ? "本月累计收益" : "当月总收益"}
            </div>
            <div className="text-[38px] leading-none font-bold tracking-tight mb-6 tabular">
              {privacy
                ? "••••••"
                : `${displayTotalProfit >= 0 ? "+" : ""}${animatedTotal.toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
            </div>

            {isProductDetailMode && (
              <div className="grid grid-cols-3 gap-2">
                <div className="chip px-3 py-2.5">
                  <div className="text-[10px] text-white/65 mb-1">交易日</div>
                  <div className="font-semibold text-[13px] text-white tabular">{displayTradedDays} 天</div>
                </div>
                <div className="chip px-3 py-2.5">
                  <div className="text-[10px] text-white/65 mb-1">挂 0</div>
                  <div className="font-semibold text-[13px] text-white tabular">
                    {productZeroDaysMap[selectedProduct!] || 0} 天
                  </div>
                </div>
                <div className="chip px-3 py-2.5">
                  <div className="text-[10px] text-white/65 mb-1">日均收益</div>
                  <div className="font-semibold text-[13px] text-white tabular">
                    {displayTradedDays > 0
                      ? `${displayTotalProfit >= 0 ? "+" : ""}${(displayTotalProfit / displayTradedDays).toFixed(2)}`
                      : "—"}
                  </div>
                </div>
              </div>
            )}

            {!isProductDetailMode && (
              <div className="grid grid-cols-2 gap-2">
                <div className="chip px-3 py-2.5">
                  <div className="text-[10px] text-white/65 mb-1">交易日</div>
                  <div className="font-semibold text-[13px] text-white tabular">
                    {displayTradedDays} 天
                  </div>
                </div>

                <div className="chip px-3 py-2.5">
                  <div className="text-[10px] text-white/65 mb-1">日均收益</div>
                  <div className="font-semibold text-[13px] text-white tabular">
                    {displayTradedDays > 0
                      ? `${displayTotalProfit >= 0 ? "+" : ""}${(displayTotalProfit / displayTradedDays).toFixed(2)}`
                      : "—"}
                  </div>
                </div>

                <div className="chip px-3 py-2.5">
                  <div className="text-[10px] text-white/65 mb-1">当月年化</div>
                  <div className="font-semibold text-[13px] text-white tabular">
                    {monthAnnual != null
                      ? `${monthAnnual >= 0 ? "+" : ""}${monthAnnual.toFixed(2)}%`
                      : "—"}
                  </div>
                </div>

                <div className="chip px-3 py-2.5">
                  <div className="text-[10px] text-white/65 mb-1">有效持仓</div>
                  <div className="font-semibold text-[12px] text-white tabular">
                    {holdingRangeText}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 银行筛选 */}
        {!isProductDetailMode && (
          <div className="mb-4 animate-fade-in-up delay-2">
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
              {availableBanks.map(b => {
                const isActive = bankFilter === b;
                const info = b === "全部" ? null : getBankInfo(b);
                return (
                  <button
                    key={b}
                    onClick={() => setBankFilter(b)}
                    className={`bank-pill ${isActive ? "bank-pill-active" : ""}`}
                    style={!isActive && info ? { borderColor: info.bg } : undefined}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 日历卡 */}
        <div className="card p-4 mb-4 animate-fade-in-up delay-2">
          <div className="flex items-center justify-between px-1 mb-3">
            <button
              onClick={goPrevMonth}
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100
                         flex items-center justify-center transition-all active:scale-90"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <div className="text-[15px] font-semibold text-slate-900 tabular">
                {fmtMonthCN(month)}
              </div>
              {navLoading && (
                <svg className="w-3.5 h-3.5 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {!isCurrentMonth && !navLoading && (
                <button
                  onClick={goToToday}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full
                             bg-purple-50 text-purple-600 text-[11px] font-semibold
                             hover:bg-purple-100 active:scale-95
                             transition-all duration-200 animate-fade-in"
                  style={{ animationDuration: "0.25s" }}
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  今日
                </button>
              )}
            </div>

            <button
              onClick={goNextMonth}
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100
                         flex items-center justify-center transition-all active:scale-90"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {["日", "一", "二", "三", "四", "五", "六"].map(w => (
              <div key={w} className="text-center text-[10px] text-slate-400 font-medium py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((date, i) => {
              if (!date) {
                return <div key={`empty-${i}`} className="cal-cell cal-cell-empty" />;
              }
              const profit = getDisplayDayProfit(date);
              const dayNum = Number(date.slice(-2));
              const isToday = date === today;
              const isSelected = date === selectedDate;

              let cls = "cal-cell";
              if (isSelected) cls += " cal-cell-selected";
              else if (isToday) cls += " cal-cell-today";

              let bgStyle: React.CSSProperties = {};
              if (!isSelected && profit !== null && profit !== 0) {
                const intensity = Math.min(Math.abs(profit) / maxAbs, 1);
                const alpha = 0.06 + intensity * 0.18;
                if (profit > 0) {
                  bgStyle.background = `rgba(244, 63, 94, ${alpha})`;
                } else {
                  bgStyle.background = `rgba(16, 185, 129, ${alpha})`;
                }
              }

              const valColor = profit === null ? ""
                : profit > 0 ? "text-rose-600"
                : profit < 0 ? "text-emerald-600"
                : "text-slate-400";

              const cellText = profit === null ? "" :
                (isProductDetailMode)
                  ? fmtCellSmall(profit)
                  : fmtCell(profit);

              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={cls}
                  style={bgStyle}
                >
                  <span className="cal-cell-num">{dayNum}</span>
                  {profit !== null && (
                    <span className={`cal-cell-val ${valColor}`}>
                      {cellText}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 日历 / 产品 切换 */}
        <div className="mb-4 animate-fade-in-up delay-3">
          <div className="segment-group flex">
            <button
              onClick={() => {
                setViewMode("calendar");
                setSelectedProduct(null);
                setSelectedDate(null);
              }}
              className={`flex-1 py-2.5 text-[13px] segment-item
                          flex items-center justify-center gap-1.5
                          ${viewMode === "calendar" ? "segment-item-active" : "hover:text-slate-700"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <rect x="3" y="5" width="18" height="16" rx="2.5" />
                <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
              </svg>
              日历
            </button>
            <button
              onClick={() => {
                setViewMode("byProduct");
                setSelectedDate(null);
              }}
              className={`flex-1 py-2.5 text-[13px] segment-item
                          flex items-center justify-center gap-1.5
                          ${viewMode === "byProduct" ? "segment-item-active" : "hover:text-slate-700"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              产品
            </button>
          </div>
        </div>

        {/* 下方列表 */}
        <div className="animate-fade-in-up delay-3">
          {viewMode === "byProduct" && !selectedProduct ? (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b divider flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-semibold text-slate-900">
                    {fmtMonthCN(month)} · 产品收益
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    点击产品查看其每日收益
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 tabular">
                  {productMonthlyList.length} 个
                </div>
              </div>

              {productMonthlyList.length === 0 ? (
                <div className="py-12 text-center text-slate-300 text-xs">
                  {bankFilter === "全部" ? "本月暂无产品收益数据" : "该银行本月无数据"}
                </div>
              ) : (
                <div>
                  {productMonthlyList.map((row, i) => {
                    const info = getBankInfo(row.bank);
                    const zeroRatio = row.days > 0 ? row.zeroDays / row.days : 0;
                    const zeroColor = zeroRatio >= 0.5 ? "text-amber-500" : "text-slate-400";
                    return (
                      <button
                        key={row.productId}
                        onClick={() => {
                          setSelectedProduct(row.productId);
                          setSelectedDate(null);
                        }}
                        className="w-full flex items-center gap-3 px-5 py-3.5
                                   hover:bg-slate-50
                                   border-b divider last:border-b-0
                                   transition-colors duration-200 text-left"
                      >
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center
                                          text-[10px] font-bold flex-shrink-0 ${
                          i === 0 ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white"
                          : i === 1 ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
                          : i === 2 ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white"
                          : "bg-slate-100 text-slate-500"
                        }`}>
                          {i + 1}
                        </span>
                        <span className="bank-avatar flex-shrink-0"
                              style={{ background: info.bg, color: info.color }}>
                          {info.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] text-slate-900 font-medium truncate">
                            {row.name}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
                            <span>{row.bank}</span>
                            <span className="text-slate-300">·</span>
                            <span>{row.days} 天</span>
                            {row.zeroDays > 0 && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className={zeroColor}>
                                  挂 0 {row.zeroDays} 天
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`font-mono font-bold text-[14px] tabular ${
                            row.profit > 0 ? "text-rose-500"
                            : row.profit < 0 ? "text-emerald-500"
                            : "text-slate-400"
                          }`}>
                            {fmtProfit(row.profit)}
                          </div>
                        </div>
                        <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : selectedDate ? (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 bg-slate-50/60 border-b divider flex items-center gap-3">
                <button
                  onClick={() => setSelectedDate(null)}
                  className="w-9 h-9 rounded-full bg-white border border-slate-200
                             hover:border-slate-300 hover:bg-slate-50
                             flex items-center justify-center flex-shrink-0
                             transition-all active:scale-90"
                  aria-label="返回"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600
                                flex items-center justify-center
                                text-white font-bold text-[15px] tabular
                                shadow-md shadow-purple-500/20 flex-shrink-0">
                  {Number(selectedDate.slice(-2))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-slate-900">
                    {selectedDate.slice(5).replace("-", " 月 ")} 日
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {isProductDetailMode
                      ? selectedProductMeta.name
                      : `${getDayProducts(selectedDate).length} 个产品`}
                  </div>
                </div>
                <div className={`font-mono font-bold text-[18px] tabular flex-shrink-0 ${
                  (isProductDetailMode ? selectedProductDayProfit : (getTotalDayProfit(selectedDate) || 0)) > 0 ? "text-rose-500"
                  : (isProductDetailMode ? selectedProductDayProfit : (getTotalDayProfit(selectedDate) || 0)) < 0 ? "text-emerald-500"
                  : "text-slate-400"
                }`}>
                  {fmtProfit(
                    isProductDetailMode ? selectedProductDayProfit : (getTotalDayProfit(selectedDate) || 0)
                  )}
                </div>
              </div>

              {isProductDetailMode ? (
                <div className="px-5 py-4">
                  <div className="text-[12px] text-slate-500 text-center py-3">
                    该产品当日收益 {fmtProfit(selectedProductDayProfit)}
                  </div>
                  <Link
                    href={`/product/${selectedProduct}`}
                    className="block text-center py-3 text-[12px] text-purple-600 font-medium
                               hover:bg-purple-50 rounded-xl transition-colors"
                  >
                    查看产品详情 →
                  </Link>
                </div>
              ) : getDayProducts(selectedDate).length === 0 ? (
                <div className="py-12 text-center text-slate-300 text-xs">
                  {bankFilter === "全部"
                    ? "当天无收益数据（可能未到购买日或没有净值更新）"
                    : "该银行当天无数据"}
                </div>
              ) : (
                <div>
                  {getDayProducts(selectedDate).map((row) => {
                    const info = getBankInfo(row.bank);
                    return (
                      <Link
                        key={row.productId}
                        href={`/product/${row.productId}`}
                        className="flex items-center gap-3 px-5 py-3.5
                                   hover:bg-slate-50
                                   border-b divider last:border-b-0
                                   transition-colors duration-200"
                      >
                        <span className="bank-avatar" style={{ background: info.bg, color: info.color }}>
                          {info.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-slate-900 font-medium truncate">
                            {row.name}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {row.bank}
                          </div>
                        </div>
                        <div className={`font-mono font-bold text-[14px] tabular ${
                          row.profit > 0 ? "text-rose-500"
                          : row.profit < 0 ? "text-emerald-500"
                          : "text-slate-400"
                        }`}>
                          {fmtProfit(row.profit)}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="card overflow-hidden">
              {isProductDetailMode ? (
                <div className="px-5 py-4 bg-slate-50/60 border-b divider flex items-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedProduct(null);
                      setSelectedDate(null);
                    }}
                    className="w-9 h-9 rounded-full bg-white border border-slate-200
                               hover:border-slate-300 hover:bg-slate-50
                               flex items-center justify-center flex-shrink-0
                               transition-all active:scale-90"
                    aria-label="返回产品列表"
                  >
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600
                                  flex items-center justify-center
                                  text-white font-bold text-[14px]
                                  shadow-md shadow-purple-500/20 flex-shrink-0">
                    {getBankInfo(selectedProductMeta.bank).label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 truncate">
                      {selectedProductMeta.name}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {selectedProductMeta.bank} · 本月 {dailyList.length} 天
                    </div>
                  </div>
                  <div className={`font-mono font-bold text-[16px] tabular flex-shrink-0 ${
                    displayTotalProfit > 0 ? "text-rose-500"
                    : displayTotalProfit < 0 ? "text-emerald-500"
                    : "text-slate-400"
                  }`}>
                    {fmtProfit(displayTotalProfit)}
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4 border-b divider flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-slate-900">
                      本月每日明细
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      点击上方日历格子查看单日明细
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 tabular flex-shrink-0">
                    {dailyList.length} 天
                  </div>
                </div>
              )}

              <div>
                {dailyList.length === 0 ? (
                  <div className="py-12 text-center text-slate-300 text-xs">
                    本月暂无收益数据
                  </div>
                ) : (
                  dailyList.map((row) => {
                    const profit = row.profit;
                    return (
                      <button
                        key={row.date}
                        onClick={() => setSelectedDate(row.date)}
                        className="w-full flex items-center justify-between px-5 py-3
                                   hover:bg-slate-50
                                   border-b divider last:border-b-0
                                   transition-colors duration-200 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg
                                          flex items-center justify-center
                                          text-[12px] font-semibold tabular ${
                            profit > 0 ? "bg-rose-50 text-rose-600"
                            : profit < 0 ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-50 text-slate-500"
                          }`}>
                            {Number(row.date.slice(-2))}
                          </div>
                          <div>
                            <div className="text-[12px] text-slate-700 font-medium">
                              {row.date.slice(5).replace("-", " 月 ")} 日
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {isProductDetailMode
                                ? selectedProductMeta.bank
                                : `${row.count} 个产品`}
                            </div>
                          </div>
                        </div>
                        <div className={`font-mono font-bold text-[14px] tabular ${
                          profit > 0 ? "text-rose-500"
                          : profit < 0 ? "text-emerald-500"
                          : "text-slate-400"
                        }`}>
                          {fmtProfit(profit)}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}