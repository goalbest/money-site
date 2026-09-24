"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useCountUp } from "../../lib/useCountUp";
import { getBankInfo } from "../../lib/banks";

const TABS = [
  { key: "profit", label: "收益榜" },
  { key: "hot", label: "热度榜" },
  { key: "new", label: "新品榜" },
];

/* ============ 日历工具函数 ============ */
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

function DiscoverContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "profit";
  const q = searchParams.get("q") || "";
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);

  /* ============ 日历数据 ============ */
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = todayStr();

  const [calMonth, setCalMonth] = useState(currentMonth);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [navRows, setNavRows] = useState<any[]>([]);
  const [calLoading, setCalLoading] = useState(true);
  const [bankFilter, setBankFilter] = useState("全部");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  /* ============ 拉日历数据 ============ */
  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setCalLoading(false);
      return;
    }
    async function load() {
      setCalLoading(true);
      const { data: hd } = await supabase
        .from("user_holdings")
        .select("product_id, shares, holding_amount, products(id, name, bank)")
        .eq("user_id", userId)
        .eq("status", "active");
      if (!hd || hd.length === 0) {
        setHoldings([]);
        setNavRows([]);
        setCalLoading(false);
        return;
      }
      setHoldings(hd);
      const productIds = hd.map((h: any) => h.product_id);
      const start = prevMonthLastDay(calMonth);
      const end = monthEnd(calMonth);
      const { data: navs } = await supabase
        .from("nav_history")
        .select("product_id, nav_date, unit_nav")
        .in("product_id", productIds)
        .gte("nav_date", start)
        .lte("nav_date", end)
        .order("nav_date", { ascending: true });
      setNavRows(navs || []);
      setCalLoading(false);
    }
    load();
  }, [calMonth]);

  /* ============ 计算每日收益 ============ */
  const { dayMap, productDayMap, totalProfit, tradedDays } = useMemo(() => {
    const sharesMap: Record<number, number> = {};
    const amountMap: Record<number, number> = {};
    holdings.forEach((h: any) => {
      sharesMap[h.product_id] = Number(h.shares) || 0;
      amountMap[h.product_id] = Number(h.holding_amount) || 0;
    });

    const navByProduct: Record<number, { date: string; nav: number }[]> = {};
    navRows.forEach((r: any) => {
      if (!navByProduct[r.product_id]) navByProduct[r.product_id] = [];
      navByProduct[r.product_id].push({ date: r.nav_date, nav: Number(r.unit_nav) });
    });

    const dayMap: Record<string, number> = {};
    const productDayMap: Record<string, Record<number, number>> = {};
    const mStart = `${calMonth}-01`;
    const mEnd = monthEnd(calMonth);

    Object.entries(navByProduct).forEach(([pidStr, list]) => {
      const pid = Number(pidStr);
      const shares = sharesMap[pid] || 0;
      const amount = amountMap[pid] || 0;
      if (shares <= 0 && amount <= 0) return;

      for (let i = 1; i < list.length; i++) {
        const t = list[i];
        const p = list[i - 1];
        if (t.date < mStart || t.date > mEnd) continue;
        let profit = 0;
        if (shares > 0) {
          profit = shares * (t.nav - p.nav);
        } else if (amount > 0 && p.nav > 0) {
          profit = amount * ((t.nav - p.nav) / p.nav);
        }
        dayMap[t.date] = (dayMap[t.date] || 0) + profit;
        if (!productDayMap[t.date]) productDayMap[t.date] = {};
        productDayMap[t.date][pid] = profit;
      }
    });

    const values = Object.values(dayMap);
    return {
      dayMap,
      productDayMap,
      totalProfit: values.reduce((a, b) => a + b, 0),
      tradedDays: values.length,
    };
  }, [holdings, navRows, calMonth]);

  const animatedTotal = useCountUp(totalProfit, 1200);

  const availableBanks = useMemo(() => {
    const set = new Set<string>();
    holdings.forEach((h: any) => {
      if (h.products?.bank) set.add(h.products.bank);
    });
    return ["全部", ...Array.from(set)];
  }, [holdings]);

  function getDayProfit(date: string): number | null {
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

  const maxAbs = useMemo(() => {
    const vals = Object.values(dayMap).map(Math.abs);
    return vals.length ? Math.max(...vals) : 1;
  }, [dayMap]);

  const selectedDaily = useMemo(() => {
    if (!selectedDate) return [];
    const dayProducts = productDayMap[selectedDate] || {};
    const rows: any[] = [];
    Object.entries(dayProducts).forEach(([pidStr, profit]) => {
      const pid = Number(pidStr);
      const meta = holdings.find((h: any) => h.product_id === pid)?.products;
      if (!meta) return;
      if (bankFilter !== "全部" && meta.bank !== bankFilter) return;
      rows.push({ productId: pid, name: meta.name, bank: meta.bank, profit });
    });
    return rows.sort((a, b) => b.profit - a.profit);
  }, [selectedDate, productDayMap, holdings, bankFilter]);

  function fmtCalProfit(n: number) {
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
  }
  function fmtCalCell(n: number) {
    const sign = n >= 0 ? "+" : "";
    if (Math.abs(n) >= 1000) return `${sign}${(n / 1000).toFixed(1)}k`;
    return `${sign}${n.toFixed(0)}`;
  }

  const calendarCells = useMemo(() => {
    const firstDay = firstWeekday(calMonth);
    const total = daysInMonth(calMonth);
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      cells.push(`${calMonth}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calMonth]);

  /* ============ 榜单数据 ============ */
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      if (q) {
        const { data } = await supabase
          .from("products")
          .select("id, name, bank, unit_nav, annualized_1m, nav_date, code")
          .or(`name.ilike.%${q}%,bank.ilike.%${q}%,code.ilike.%${q}%`)
          .limit(50);
        if (data) setItems(data);
      } else if (tab === "profit") {
        const { data } = await supabase
          .from("products")
          .select("id, name, bank, unit_nav, annualized_1m, nav_date, code")
          .not("annualized_1m", "is", null)
          .gt("annualized_1m", 0)
          .order("annualized_1m", { ascending: false })
          .limit(50);
        if (data) setItems(data);
      } else if (tab === "new") {
        const { data } = await supabase
          .from("products")
          .select("id, name, bank, unit_nav, annualized_1m, nav_date, code")
          .not("nav_date", "is", null)
          .order("nav_date", { ascending: false })
          .limit(50);
        if (data) setItems(data);
      } else if (tab === "hot") {
        const { data } = await supabase
          .from("search_logs")
          .select("keyword")
          .order("created_at", { ascending: false })
          .limit(500);
        if (data) {
          const counts: Record<string, number> = {};
          data.forEach((l) => {
            counts[l.keyword] = (counts[l.keyword] || 0) + 1;
          });
          setItems(
            Object.entries(counts)
              .map(([keyword, count]) => ({ keyword, count }))
              .sort((a, b) => b.count - a.count)
          );
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [tab, q]);

  function handleSearch() {
    const term = searchInput.trim();
    if (!term) {
      router.push("/discover");
      return;
    }
    const userId = localStorage.getItem("user_id");
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/search_logs`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keyword: term,
        user_id: userId ? Number(userId) : null,
      }),
    }).catch(() => {});
    router.push(`/discover?q=${encodeURIComponent(term)}`);
  }

  function switchTab(key: string) {
    router.push(`/discover?tab=${key}`);
  }

  const isSearch = !!q;
  const isCurrentMonth = calMonth === currentMonth;

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-6 max-w-3xl">

        {/* ============ 顶部标题 ============ */}
        <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">
              发现
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              浏览热门产品 · 搜索理财
            </div>
          </div>
        </div>

        {/* ============ 搜索框 ============ */}
        <div className="relative mb-5 animate-fade-in-up delay-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="搜索产品、银行、代码"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="input-field w-full pl-11 pr-24 py-3.5 text-sm"
          />
          {searchInput ? (
            <button
              onClick={() => {
                setSearchInput("");
                if (isSearch) router.push("/discover");
              }}
              className="absolute inset-y-0 right-16 pr-2 flex items-center"
            >
              <svg className="w-4 h-4 text-slate-400 hover:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
          <button
            onClick={handleSearch}
            className="absolute inset-y-1.5 right-1.5 px-4 rounded-xl
                       bg-gradient-to-r from-violet-500 to-purple-600
                       text-white text-[12px] font-semibold
                       shadow-md shadow-purple-500/25
                       hover:shadow-lg active:scale-95
                       transition-all duration-200"
          >
            搜索
          </button>
        </div>

        {/* ====================================================== */}
        {/* ============ 搜索模式 ============ */}
        {/* ====================================================== */}
        {isSearch ? (
          <div className="animate-fade-in-up delay-2">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="text-[14px] font-semibold text-slate-900">
                搜索「{q}」
              </div>
              <div className="text-[11px] text-slate-400">
                {loading ? "搜索中..." : `${items.length} 个结果`}
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card p-4 h-24 animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="text-slate-300 text-sm mb-2">没有找到匹配的产品</div>
                <div className="text-[11px] text-slate-400">
                  试试搜索银行名或产品代码
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((p, i) => {
                  const info = getBankInfo(p.bank);
                  return (
                    <Link
                      key={p.id}
                      href={`/product/${p.id}`}
                      className="card card-hover p-4 block group animate-fade-in-up"
                      style={{ animationDelay: `${0.04 * Math.min(i, 8)}s` }}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <span
                          className="bank-avatar flex-shrink-0"
                          style={{ background: info.bg, color: info.color }}
                        >
                          {info.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-slate-900 leading-snug">
                            {p.name}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-slate-400 truncate">
                              {p.bank}
                            </span>
                            {p.code && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {p.code}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-end justify-between pt-3 border-t divider">
                        <div>
                          <div className="text-[10px] text-slate-400 mb-1">净值</div>
                          <div className="font-mono font-semibold text-[13px] text-slate-700 tabular">
                            {p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 mb-1">近 1 月年化</div>
                          <div className={`font-mono font-bold text-[15px] tabular ${
                            Number(p.annualized_1m) > 0 ? "text-rose-500" : "text-slate-400"
                          }`}>
                            {p.annualized_1m != null
                              ? `+${Number(p.annualized_1m).toFixed(2)}%`
                              : "—"}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ====================================================== */}
            {/* ============ 日历（一级内容） ============ */}
            {/* ====================================================== */}
            {calLoading ? (
              <div className="animate-fade-in-up delay-2 mb-5">
                <div className="h-32 rounded-3xl animate-pulse mb-4"
                     style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 55%, #ec4899 100%)", opacity: 0.3 }} />
                <div className="card p-5 h-72 animate-pulse" />
              </div>
            ) : holdings.length === 0 ? null : (
              <div className="mb-6 animate-fade-in-up delay-2">
                {/* Hero 卡 */}
                <div className="card-hero p-6 mb-4">
                  <div className="dot-pattern" />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] text-white/70 tracking-wider">
                        当月总收益
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-[12px] text-white/85 font-medium tabular">
                          {fmtMonthCN(calMonth)}
                        </div>
                        {!isCurrentMonth && (
                          <button
                            onClick={() => {
                              setCalMonth(currentMonth);
                              setSelectedDate(null);
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full
                                       bg-white/20 hover:bg-white/30
                                       text-white text-[10px] font-semibold
                                       active:scale-95 transition-all"
                          >
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <circle cx="12" cy="12" r="9" />
                              <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            今日
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-[38px] leading-none font-bold tracking-tight mb-6 tabular">
                      {`${totalProfit >= 0 ? "+" : ""}${animatedTotal.toLocaleString("zh-CN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="chip px-3 py-2.5">
                        <div className="text-[10px] text-white/65 mb-1">交易日</div>
                        <div className="font-semibold text-[13px] text-white tabular">{tradedDays} 天</div>
                      </div>
                      <div className="chip px-3 py-2.5">
                        <div className="text-[10px] text-white/65 mb-1">日均收益</div>
                        <div className="font-semibold text-[13px] text-white tabular">
                          {tradedDays > 0
                            ? `${totalProfit >= 0 ? "+" : ""}${(totalProfit / tradedDays).toFixed(2)}`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 日历格 */}
                <div className="card p-4 mb-4">
                  {/* 月份切换 */}
                  <div className="flex items-center justify-between px-1 mb-3">
                    <button
                      onClick={() => {
                        const [y, m] = calMonth.split("-").map(Number);
                        const prev = new Date(y, m - 2, 1);
                        setCalMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
                        setSelectedDate(null);
                      }}
                      className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100
                                 flex items-center justify-center
                                 transition-all active:scale-90"
                    >
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div className="text-[14px] font-semibold text-slate-900 tabular">
                      {fmtMonthCN(calMonth)}
                    </div>
                    <button
                      onClick={() => {
                        const [y, m] = calMonth.split("-").map(Number);
                        const next = new Date(y, m, 1);
                        setCalMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
                        setSelectedDate(null);
                      }}
                      className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100
                                 flex items-center justify-center
                                 transition-all active:scale-90"
                    >
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  {/* 周头 */}
                  <div className="grid grid-cols-7 mb-2">
                    {["日", "一", "二", "三", "四", "五", "六"].map(w => (
                      <div key={w} className="text-center text-[10px] text-slate-400 font-medium py-1">
                        {w}
                      </div>
                    ))}
                  </div>

                  {/* 日期格 */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {calendarCells.map((date, i) => {
                      if (!date) {
                        return <div key={`empty-${i}`} className="cal-cell cal-cell-empty" />;
                      }
                      const profit = getDayProfit(date);
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
                              {fmtCalCell(profit)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 银行筛选 */}
                {availableBanks.length > 1 && (
                  <div className="mb-4">
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

                {/* 选中日期 → 当天明细 */}
                {selectedDate && (
                  <div className="card overflow-hidden mb-4 animate-fade-in"
                       style={{ animationDuration: "0.25s" }}>
                    <div className="px-5 py-3 bg-slate-50/60 border-b divider flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600
                                        flex items-center justify-center
                                        text-white font-bold text-[14px] tabular shadow-md shadow-purple-500/20">
                          {Number(selectedDate.slice(-2))}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-slate-900">
                            {selectedDate.slice(5).replace("-", " 月 ")} 日
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {selectedDaily.length} 个产品
                          </div>
                        </div>
                      </div>
                      <div className={`font-mono font-bold text-[17px] tabular ${
                        (dayMap[selectedDate] || 0) > 0 ? "text-rose-500"
                        : (dayMap[selectedDate] || 0) < 0 ? "text-emerald-500"
                        : "text-slate-400"
                      }`}>
                        {fmtCalProfit(dayMap[selectedDate] || 0)}
                      </div>
                    </div>

                    {selectedDaily.length === 0 ? (
                      <div className="py-8 text-center text-slate-300 text-xs">
                        {bankFilter === "全部" ? "当天无收益数据" : "该银行当天无数据"}
                      </div>
                    ) : (
                      <div>
                        {selectedDaily.slice(0, 5).map((row) => {
                          const info = getBankInfo(row.bank);
                          return (
                            <Link
                              key={row.productId}
                              href={`/product/${row.productId}`}
                              className="flex items-center gap-3 px-5 py-3
                                         hover:bg-slate-50
                                         border-b divider last:border-b-0
                                         transition-colors duration-200"
                            >
                              <span className="bank-avatar" style={{ background: info.bg, color: info.color }}>
                                {info.label}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] text-slate-900 font-medium truncate">
                                  {row.name}
                                </div>
                              </div>
                              <div className={`font-mono font-bold text-[13px] tabular ${
                                row.profit > 0 ? "text-rose-500"
                                : row.profit < 0 ? "text-emerald-500"
                                : "text-slate-400"
                              }`}>
                                {fmtCalProfit(row.profit)}
                              </div>
                            </Link>
                          );
                        })}
                        {selectedDaily.length > 5 && (
                          <Link
                            href="/calendar"
                            className="block text-center py-3 text-[12px] text-purple-600
                                       font-medium hover:bg-purple-50 transition-colors"
                          >
                            还有 {selectedDaily.length - 5} 个 · 查看完整日历 →
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 完整日历入口 */}
                <Link
                  href="/calendar"
                  className="block text-center py-3 rounded-2xl
                             bg-slate-50 hover:bg-slate-100
                             text-[12px] text-slate-600 font-medium
                             transition-colors duration-200
                             flex items-center justify-center gap-1.5"
                >
                  查看完整收益日历
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            )}

            {/* ====================================================== */}
            {/* ============ 榜单 ============ */}
            {/* ====================================================== */}
            <div className="mb-4 animate-fade-in-up delay-3">
              <div className="segment-group flex">
                {TABS.map((t) => {
                  const isActive = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => switchTab(t.key)}
                      className={`flex-1 py-2.5 text-[13px] segment-item ${
                        isActive ? "segment-item-active" : "hover:text-slate-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="card p-4 h-24 animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="text-slate-300 text-sm">暂无数据</div>
              </div>
            ) : tab === "hot" ? (
              <div className="card overflow-hidden animate-fade-in-up delay-4">
                <div className="px-5 py-4 border-b divider flex items-center justify-between">
                  <div className="text-[15px] font-bold text-slate-900">热门搜索</div>
                  <div className="text-[11px] text-slate-400">近 500 次搜索聚合</div>
                </div>
                <div>
                  {items.map((h, i) => (
                    <Link
                      key={`${i}-${h.keyword}`}
                      href={`/discover?q=${encodeURIComponent(h.keyword)}`}
                      className="flex items-center gap-3 px-5 py-3.5 group
                                 hover:bg-slate-50
                                 border-b divider last:border-b-0
                                 transition-colors duration-200"
                    >
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center
                                        text-[11px] font-bold flex-shrink-0 ${
                        i === 0
                          ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white rank-glow-1"
                          : i === 1
                          ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white rank-glow-2"
                          : i === 2
                          ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white rank-glow-3"
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        {i + 1}
                      </span>
                      <span className="flex-1 text-[13px] text-slate-900 font-medium truncate">
                        {h.keyword}
                      </span>
                      <span className="text-[11px] text-slate-400 tabular">
                        {h.count} 次
                      </span>
                      <svg className="w-3.5 h-3.5 text-slate-300 row-arrow"
                           fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((p, i) => {
                  const info = getBankInfo(p.bank);
                  const isProfit = tab === "profit";
                  const mainValue = isProfit
                    ? Number(p.annualized_1m) > 0
                      ? `+${Number(p.annualized_1m).toFixed(2)}%`
                      : "—"
                    : p.unit_nav != null
                    ? Number(p.unit_nav).toFixed(4)
                    : "—";
                  const mainLabel = isProfit ? "近 1 月年化" : "最新净值";
                  const mainColor = isProfit ? "text-rose-500" : "text-slate-700";

                  return (
                    <Link
                      key={p.id}
                      href={`/product/${p.id}`}
                      className="card card-hover p-4 block group animate-fade-in-up"
                      style={{ animationDelay: `${0.04 * Math.min(i, 8)}s` }}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        {i < 3 && (
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center
                                            text-[11px] font-bold flex-shrink-0 ${
                            i === 0
                              ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white rank-glow-1"
                              : i === 1
                              ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white rank-glow-2"
                              : "bg-gradient-to-br from-yellow-400 to-amber-400 text-white rank-glow-3"
                          }`}>
                            {i + 1}
                          </span>
                        )}
                        {i >= 3 && (
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center
                                           text-[11px] font-bold flex-shrink-0
                                           bg-slate-100 text-slate-500">
                            {i + 1}
                          </span>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-slate-900 leading-snug">
                            {p.name}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="bank-avatar flex-shrink-0"
                                  style={{ background: info.bg, color: info.color }}>
                              {info.label}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate">
                              {p.bank}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-end justify-between pt-3 border-t divider">
                        <div>
                          <div className="text-[10px] text-slate-400 mb-1">
                            {p.nav_date || "净值日期"}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular">
                            {p.code || ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 mb-1">
                            {mainLabel}
                          </div>
                          <div className={`font-mono font-bold text-[16px] tabular ${mainColor}`}>
                            {mainValue}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
          加载中...
        </div>
      }
    >
      <DiscoverContent />
    </Suspense>
  );
}