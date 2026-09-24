"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useCountUp } from "../../lib/useCountUp";
import { getBankInfo } from "../../lib/banks";
import HoldingDistribution from "../components/HoldingDistribution";

function daysHeld(holdDate?: string | null, endDate?: string | null): number {
  if (!holdDate) return 0;
  const start = new Date(holdDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SortKey = "value" | "today" | "dailyReturn" | "annual" | "days";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "value", label: "市值" },
  { key: "today", label: "今日" },
  { key: "dailyReturn", label: "万收" },
  { key: "annual", label: "年化" },
  { key: "days", label: "天数" },
];

type StatusFilter = "all" | "confirmed" | "transit";
const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "confirmed", label: "持仓" },
  { key: "transit", label: "在途" },
];

function MiniChart({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="w-[60px] h-5" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const padding = 2;
  const stepX = (w - padding * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: h - padding - ((p - min) / range) * (h - padding * 2),
  }));
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${h} L ${coords[0].x.toFixed(1)} ${h} Z`;
  const positive = points[points.length - 1] >= points[0];
  const stroke = positive ? "#f43f5e" : "#10b981";
  const fill = positive ? "rgba(244, 63, 94, 0.12)" : "rgba(16, 185, 129, 0.12)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <path d={areaPath} fill={fill} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r="1.8"
        fill={stroke}
      />
    </svg>
  );
}

export default function HoldingsPage() {
  const [allHoldings, setAllHoldings] = useState<any[]>([]);
  const [navHistory, setNavHistory] = useState<Record<number, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [bankFilter, setBankFilter] = useState("全部");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDesc, setSortDesc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [view, setView] = useState<"active" | "closed">("active");

  const [menuItem, setMenuItem] = useState<any | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressed = useRef(false);

  /* ============ 拉数据：active + closed ============ */
  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setLoading(false);
      return;
    }
    const hh = String(new Date().getHours()).padStart(2, "0");
    const mm = String(new Date().getMinutes()).padStart(2, "0");
    setLastUpdated(`${hh}:${mm}`);

    async function fetchData() {
      const { data } = await supabase
        .from("user_holdings")
        .select(
          "id, holding_amount, in_transit_amount, purchase_amount, shares, hold_date, closed_at, closed_amount, status, products(id, name, bank, category, unit_nav, annualized_1m, daily_return, nav_date)"
        )
        .eq("user_id", userId)
        .in("status", ["active", "closed"]);
      if (!data) {
        setLoading(false);
        return;
      }
      setAllHoldings(data);

      /* 只给 active 拉近 7 天净值（做迷你图） */
      const activeIds = data
        .filter((h: any) => h.status === "active")
        .map((h: any) => h.products?.id)
        .filter(Boolean);
      if (activeIds.length > 0) {
        const { data: navData } = await supabase
          .from("nav_history")
          .select("product_id, nav_date, unit_nav")
          .in("product_id", activeIds)
          .gte("nav_date", daysAgoStr(7))
          .order("nav_date", { ascending: true });
        if (navData) {
          const grouped: Record<number, number[]> = {};
          navData.forEach((r: any) => {
            if (!grouped[r.product_id]) grouped[r.product_id] = [];
            grouped[r.product_id].push(Number(r.unit_nav));
          });
          setNavHistory(grouped);
        }
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 180);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const holdings = useMemo(
    () => allHoldings.filter(h => h.status === "active"),
    [allHoldings]
  );
  const closedHoldings = useMemo(
    () => allHoldings
      .filter(h => h.status === "closed")
      .sort((a, b) => {
        const ta = a.closed_at ? new Date(a.closed_at).getTime() : 0;
        const tb = b.closed_at ? new Date(b.closed_at).getTime() : 0;
        return tb - ta;
      }),
    [allHoldings]
  );

  /* ============ 汇总（active） ============ */
  const totalHolding = holdings.reduce((s, h) => s + Number(h.holding_amount || 0), 0);
  const totalInTransit = holdings.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
  const totalAssets = totalHolding + totalInTransit;
  const totalProfitToday = holdings.reduce((s, h) => {
    const daily = Number(h.products?.daily_return || 0);
    return s + (Number(h.holding_amount || 0) * daily) / 10000;
  }, 0);
  const totalProfitCumulative = holdings.reduce((s, h) => {
    const purchase = Number(h.purchase_amount || 0);
    const hold = Number(h.holding_amount || 0);
    return s + (purchase > 0 ? hold - purchase : 0);
  }, 0);
  const todayRate = totalHolding > 0 ? (totalProfitToday / totalHolding) * 100 : 0;

  const animatedAssets = useCountUp(totalAssets, 1200);
  const animatedHolding = useCountUp(totalHolding, 1200);
  const animatedInTransit = useCountUp(totalInTransit, 1200);
  const animatedToday = useCountUp(totalProfitToday, 1200);
  const animatedCum = useCountUp(totalProfitCumulative, 1200);

  /* ============ 已清仓汇总 ============ */
  const closedStats = useMemo(() => {
    let totalProfit = 0;
    let totalInvested = 0;
    let winCount = 0;
    let lossCount = 0;
    let flatCount = 0;

    closedHoldings.forEach(h => {
      const purchase = Number(h.purchase_amount || 0);
      const closed = Number(h.closed_amount || 0);
      const profit = purchase > 0 ? closed - purchase : 0;
      totalProfit += profit;
      totalInvested += purchase;
      if (profit > 0.01) winCount++;
      else if (profit < -0.01) lossCount++;
      else flatCount++;
    });

    return {
      totalProfit,
      totalInvested,
      winCount,
      lossCount,
      flatCount,
      total: closedHoldings.length,
      rate: totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0,
    };
  }, [closedHoldings]);

  const animatedClosedProfit = useCountUp(closedStats.totalProfit, 1200);

  /* ============ 活跃持仓的今日最佳/最差 ============ */
  const { bestToday, worstToday } = useMemo(() => {
    if (holdings.length === 0) return { bestToday: null, worstToday: null };
    const ranked = holdings
      .map(h => ({
        id: h.id,
        name: h.products?.name || "",
        bank: h.products?.bank || "",
        profit: (Number(h.holding_amount || 0) * Number(h.products?.daily_return || 0)) / 10000,
        rate: Number(h.products?.daily_return || 0),
      }))
      .filter(x => x.profit !== 0)
      .sort((a, b) => b.profit - a.profit);
    if (ranked.length === 0) return { bestToday: null, worstToday: null };
    return {
      bestToday: ranked[0],
      worstToday: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    };
  }, [holdings]);

  /* ============ 银行列表 ============ */
  const bankList = useMemo(() => {
    const counter: Record<string, { count: number; total: number }> = {};
    holdings.forEach(h => {
      const b = h.products?.bank || "其他";
      if (!counter[b]) counter[b] = { count: 0, total: 0 };
      counter[b].count += 1;
      counter[b].total += Number(h.holding_amount || 0);
    });
    const list = Object.entries(counter)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([bank, info]) => ({ bank, ...info }));
    return [{ bank: "全部", count: holdings.length, total: totalHolding }, ...list];
  }, [holdings, totalHolding]);

  /* ============ 分组 + 排序 ============ */
  const groupSummary = useMemo(() => {
    let filtered = holdings;

    if (statusFilter === "confirmed") {
      filtered = filtered.filter(h => Number(h.holding_amount || 0) > 0);
    } else if (statusFilter === "transit") {
      filtered = filtered.filter(h => Number(h.in_transit_amount || 0) > 0);
    }

    if (bankFilter !== "全部") {
      filtered = filtered.filter(h => (h.products?.bank || "其他") === bankFilter);
    }

    const grouped: Record<string, any[]> = {};
    filtered.forEach(h => {
      const key = h.products?.bank || "其他";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(h);
    });

    return Object.entries(grouped)
      .map(([bank, items]) => {
        const total = items.reduce((s, h) => s + Number(h.holding_amount || 0), 0);
        const inTransit = items.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
        const todayProfit = items.reduce((s, h) => {
          const daily = Number(h.products?.daily_return || 0);
          return s + (Number(h.holding_amount || 0) * daily) / 10000;
        }, 0);

        const sortedItems = [...items].sort((a, b) => {
          let diff = 0;
          if (sortKey === "value") {
            diff = Number(b.holding_amount || 0) - Number(a.holding_amount || 0);
                    } else if (sortKey === "today") {
            const aP = Number(a.holding_amount || 0) * Number(a.products?.daily_return || 0);
            const bP = Number(b.holding_amount || 0) * Number(b.products?.daily_return || 0);
            diff = bP - aP;
          } else if (sortKey === "dailyReturn") {
            diff = Number(b.products?.daily_return || 0) - Number(a.products?.daily_return || 0);
          } else if (sortKey === "annual") {
            diff = Number(b.products?.annualized_1m || 0) - Number(a.products?.annualized_1m || 0);
          } else {
            diff = daysHeld(b.hold_date) - daysHeld(a.hold_date);
          }
          return sortDesc ? diff : -diff;
        });

        return { bank, items: sortedItems, total, inTransit, todayProfit };
      })
      .sort((a, b) => b.total - a.total);
  }, [holdings, bankFilter, sortKey, sortDesc, statusFilter]);

  function fmtMoney(n: number) {
    if (privacy) return "••••••";
    return n.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  function fmtProfit(n: number) {
    if (privacy) return "••••";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
  }
  function fmtPct(n: number) {
    if (privacy) return "••";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  }

  /* ============ 长按菜单 ============ */
  const handlePressStart = (h: any) => {
    longPressed.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setMenuItem(h);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { (navigator as any).vibrate(10); } catch {}
      }
    }, 480);
  };

  const handlePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleItemClick = (e: React.MouseEvent, h: any) => {
    if (longPressed.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressed.current = false;
    }
  };

  /* ============ 删除已清仓记录 ============ */
  async function handleDeleteClosed(h: any, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`彻底删除这条清仓记录？\n${h.products?.name || ""}\n删除后无法恢复`)) return;
    await supabase.from("user_holdings").delete().eq("id", h.id);
    setAllHoldings(prev => prev.filter(x => x.id !== h.id));
  }

  /* ============ 加载中 ============ */
  if (loading) {
    return (
      <div className="min-h-screen pb-24">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="h-7 w-24 bg-slate-200/60 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-40 bg-slate-200/60 rounded animate-pulse mb-6" />
          <div className="card-summary p-6 mb-5 h-44 animate-pulse" />
          <div className="card p-5 mb-4 h-40 animate-pulse" />
        </div>
      </div>
    );
  }

  /* ============ 空状态（无任何持仓/清仓记录） ============ */
  if (holdings.length === 0 && closedHoldings.length === 0) {
    return (
      <div className="min-h-screen pb-24">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="text-[22px] font-bold tracking-tight text-slate-900 mb-5">
            我的理财
          </div>
          <div className="segment-group flex mb-5">
            <button className="flex-1 py-2.5 text-[13px] segment-item segment-item-active">
              持仓
            </button>
            <button className="flex-1 py-2.5 text-[13px] segment-item text-slate-400">
              已清仓
            </button>
            <Link
              href="/monitor"
              className="flex-1 py-2.5 text-[13px] segment-item text-center hover:text-slate-700"
            >
              监控
            </Link>
          </div>
        </div>
        <div className="flex items-center justify-center px-5 mt-8">
          <div className="max-w-sm w-full text-center animate-fade-in-up">
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl
                            bg-gradient-to-br from-violet-500 to-purple-600
                            flex items-center justify-center
                            shadow-xl shadow-purple-500/25">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="text-[20px] font-bold text-slate-900 mb-2">还没有理财记录</div>
            <div className="text-[13px] text-slate-400 mb-8 leading-relaxed">
              添加第一笔理财，开始记录你的净值变化
            </div>
            <Link href="/add" className="btn-primary inline-block text-sm px-8 py-3">
              添加持仓
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* 吸顶条 */}
      <div
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          scrolled ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        }`}
        style={{
          background: "rgba(245, 246, 250, 0.85)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
        }}
      >
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400">
              {view === "active" ? "总资产" : "已清仓累计"}
            </span>
            <span className="font-mono font-bold text-[15px] text-slate-900 tabular">
              ¥{privacy
                ? "••••"
                : (view === "active" ? totalAssets : closedStats.totalProfit).toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
            </span>
          </div>
          {view === "active" ? (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400">今日</span>
              <span className={`font-mono font-bold text-[14px] tabular ${
                totalProfitToday > 0 ? "text-rose-500"
                : totalProfitToday < 0 ? "text-emerald-500"
                : "text-slate-700"
              }`}>
                {fmtProfit(totalProfitToday)}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400">胜率</span>
              <span className="font-mono font-bold text-[14px] tabular text-slate-700">
                {closedStats.total > 0
                  ? `${Math.round((closedStats.winCount / closedStats.total) * 100)}%`
                  : "—"}
              </span>
            </div>
          )}
          <button
            onClick={() => setPrivacy(p => !p)}
            className="w-8 h-8 rounded-full bg-white border border-slate-200
                       flex items-center justify-center active:scale-90
                       transition-all duration-200"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              {privacy ? (
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      <div className="container mx-auto px-5 pt-8 max-w-3xl">

        {/* ============ 顶部标题 ============ */}
        <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">
              我的理财
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              {view === "active"
                ? `${holdings.length} 个产品 · ${bankList.length - 1} 家机构 · 更新于 ${lastUpdated}`
                : `${closedHoldings.length} 笔清仓记录`}
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

        {/* ============ 三个 Tab ============ */}
        <div className="segment-group flex mb-5 animate-fade-in-up delay-1">
          <button
            onClick={() => setView("active")}
            className={`flex-1 py-2.5 text-[13px] segment-item ${
              view === "active" ? "segment-item-active" : "hover:text-slate-700"
            }`}
          >
            持仓 {holdings.length > 0 ? `(${holdings.length})` : ""}
          </button>
          <button
            onClick={() => setView("closed")}
            className={`flex-1 py-2.5 text-[13px] segment-item ${
              view === "closed" ? "segment-item-active" : "hover:text-slate-700"
            }`}
          >
            已清仓 {closedHoldings.length > 0 ? `(${closedHoldings.length})` : ""}
          </button>
          <Link
            href="/monitor"
            className="flex-1 py-2.5 text-[13px] segment-item text-center hover:text-slate-700"
          >
            监控
          </Link>
        </div>

        {/* ============================================================ */}
        {/* ============ VIEW: 持仓 ============ */}
        {/* ============================================================ */}
        {view === "active" && (
          <>
            {holdings.length === 0 ? (
              <div className="card p-12 text-center animate-fade-in-up">
                <div className="text-slate-300 text-sm mb-3">暂无持仓</div>
                <Link href="/add" className="btn-primary inline-block text-xs px-6 py-2.5">
                  添加持仓
                </Link>
              </div>
            ) : (
              <>
                {/* 汇总卡 */}
                <div className="card-summary mb-5 animate-fade-in-up delay-1 overflow-hidden relative">
                  <div className="p-6">
                    <button
                      onClick={() => setSummaryCollapsed(c => !c)}
                      className="absolute top-4 right-4 w-7 h-7 rounded-full
                                 bg-slate-50 hover:bg-slate-100
                                 flex items-center justify-center
                                 transition-all duration-300 active:scale-90"
                    >
                      <svg
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${
                          summaryCollapsed ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    <div className="text-[11px] text-slate-500 tracking-wider mb-2">
                      总资产（元）
                    </div>
                    <div className={`leading-none font-bold tracking-tight text-gradient tabular transition-all duration-500 ${
                      summaryCollapsed ? "text-[28px]" : "text-[34px] mb-5"
                    }`}>
                      {privacy
                        ? "••••••"
                        : animatedAssets.toLocaleString("zh-CN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                    </div>

                    <div className={`overflow-hidden transition-all duration-500 ${
                      summaryCollapsed ? "max-h-0 opacity-0" : "max-h-[400px] opacity-100"
                    }`}>
                      {totalAssets > 0 && (
                        <div className="mb-5">
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-gradient-to-r from-violet-500 to-purple-600"
                              style={{ width: `${(totalHolding / totalAssets) * 100}%` }}
                            />
                            <div
                              className="h-full bg-amber-400"
                              style={{ width: `${(totalInTransit / totalAssets) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-2 text-[10px] text-slate-400">
                            <span>
                              <span className="inline-block w-1.5 h-1.5 bg-violet-500 rounded-full mr-1" />
                              持仓 {fmtMoney(animatedHolding)}
                            </span>
                            <span>
                              <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full mr-1" />
                              在途 {fmtMoney(animatedInTransit)}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t divider">
                        <div>
                          <div className="text-[11px] text-slate-400 mb-1">今日收益</div>
                          <div className={`font-mono font-bold text-[17px] tabular ${
                            totalProfitToday > 0 ? "text-rose-500"
                            : totalProfitToday < 0 ? "text-emerald-500"
                            : "text-slate-700"
                          }`}>
                            {fmtProfit(animatedToday)}
                          </div>
                          <div className={`text-[10px] mt-0.5 font-mono ${
                            todayRate > 0 ? "text-rose-500"
                            : todayRate < 0 ? "text-emerald-500"
                            : "text-slate-400"
                          }`}>
                            {fmtPct(todayRate)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-400 mb-1">累计收益</div>
                          <div className={`font-mono font-bold text-[17px] tabular ${
                            totalProfitCumulative > 0 ? "text-rose-500"
                            : totalProfitCumulative < 0 ? "text-emerald-500"
                            : "text-slate-700"
                          }`}>
                            {fmtProfit(animatedCum)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 持仓分布 */}
                <HoldingDistribution holdings={holdings} privacy={privacy} />

                {/* 今日最佳 / 最差 */}
                {!summaryCollapsed && (bestToday || worstToday) && (
                  <div className="grid grid-cols-2 gap-3 mb-5 animate-fade-in-up delay-2">
                    {bestToday && (
                      <Link href={`/holdings/${bestToday.id}`} className="card p-3.5 card-hover group">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-full font-medium">
                            今日最佳
                          </span>
                        </div>
                        <div className="text-[12px] text-slate-700 font-medium truncate mb-2">
                          {bestToday.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mb-1.5 truncate">
                          {bestToday.bank}
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className={`font-mono font-bold text-[15px] tabular ${
                            bestToday.profit > 0 ? "text-rose-500" : "text-emerald-500"
                          }`}>
                            {bestToday.profit >= 0 ? "+" : ""}{bestToday.profit.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {bestToday.rate >= 0 ? "+" : ""}{bestToday.rate.toFixed(2)}%
                          </span>
                        </div>
                      </Link>
                    )}
                    {worstToday ? (
                      <Link href={`/holdings/${worstToday.id}`} className="card p-3.5 card-hover group">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">
                            今日最差
                          </span>
                        </div>
                        <div className="text-[12px] text-slate-700 font-medium truncate mb-2">
                          {worstToday.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mb-1.5 truncate">
                          {worstToday.bank}
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className={`font-mono font-bold text-[15px] tabular ${
                            worstToday.profit > 0 ? "text-rose-500" : "text-emerald-500"
                          }`}>
                            {worstToday.profit >= 0 ? "+" : ""}{worstToday.profit.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {worstToday.rate >= 0 ? "+" : ""}{worstToday.rate.toFixed(2)}%
                          </span>
                        </div>
                      </Link>
                    ) : (
                      <div className="card p-3.5 flex items-center justify-center">
                        <span className="text-[11px] text-slate-300">只有一个持仓</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 状态筛选 */}
                <div className="mb-3 animate-fade-in-up delay-2">
                  <div className="segment-group flex">
                    {STATUS_TABS.map(t => {
                      const isActive = statusFilter === t.key;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setStatusFilter(t.key)}
                          className={`flex-1 py-2 text-[13px] segment-item ${
                            isActive ? "segment-item-active" : "hover:text-slate-700"
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 银行筛选 */}
                <div className="mb-4 animate-fade-in-up delay-2">
                  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
                    {bankList.map(b => {
                      const isActive = bankFilter === b.bank;
                      const info = b.bank === "全部" ? null : getBankInfo(b.bank);
                      return (
                        <button
                          key={b.bank}
                          onClick={() => setBankFilter(b.bank)}
                          className={`bank-pill ${isActive ? "bank-pill-active" : ""}`}
                          style={!isActive && info ? { borderColor: info.bg } : undefined}
                        >
                          {b.bank}
                          <span className={`ml-1.5 text-[10px] tabular ${
                            isActive ? "text-white/80" : "text-slate-400"
                          }`}>
                            {b.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 排序 */}
                <div className="mb-5 animate-fade-in-up delay-3">
                  <div className="segment-group flex">
                    {SORTS.map(s => {
                      const isActive = sortKey === s.key;
                      return (
                        <button
                          key={s.key}
                          onClick={() => {
                            if (isActive) setSortDesc(d => !d);
                            else {
                              setSortKey(s.key);
                              setSortDesc(true);
                            }
                          }}
                          className={`flex-1 py-2 text-[13px] segment-item flex items-center justify-center gap-1 ${
                            isActive ? "segment-item-active" : "hover:text-slate-700"
                          }`}
                        >
                          {s.label}
                          {isActive && (
                            <svg
                              className={`w-3 h-3 transition-transform duration-300 ${
                                sortDesc ? "" : "rotate-180"
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={3}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 分组持仓卡 */}
                <div className="space-y-4">
                  {groupSummary.length === 0 ? (
                    <div className="card p-12 text-center text-slate-300 text-xs">
                      该筛选条件下暂无持仓
                    </div>
                  ) : (
                    groupSummary.map((group, gi) => {
                      const info = getBankInfo(group.bank);
                      const percent = totalHolding > 0 ? (group.total / totalHolding) * 100 : 0;

                      return (
                        <div
                          key={group.bank}
                          className="card overflow-hidden animate-fade-in-up"
                          style={{ animationDelay: `${0.06 * (gi + 1)}s` }}
                        >
                          <div className="flex items-stretch">
                            <div className="w-1" style={{ background: info.bar }} />
                            <div className="flex-1 px-5 py-4 bg-slate-50/60 border-b divider">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className="bank-avatar"
                                    style={{ background: info.bg, color: info.color }}
                                  >
                                    {info.label}
                                  </span>
                                  <div>
                                    <div className="text-[13px] font-semibold text-slate-900 leading-tight">
                                      {group.bank}
                                    </div>
                                    <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                                      {group.items.length} 个产品 · 占比 {percent.toFixed(1)}%
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[13px] font-mono font-bold text-slate-900 tabular">
                                    {privacy ? "••••" : group.total.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                                  </div>
                                  <div className={`text-[11px] font-mono tabular ${
                                    group.todayProfit > 0 ? "text-rose-500"
                                    : group.todayProfit < 0 ? "text-emerald-500"
                                    : "text-slate-400"
                                  }`}>
                                    {fmtProfit(group.todayProfit)}
                                  </div>
                                </div>
                              </div>
                              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${percent}%`, background: info.bar }}
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            {group.items.map((h: any, hi: number) => {
                              const p = h.products;
                              if (!p) return null;
                              const hold = Number(h.holding_amount || 0);
                              const transit = Number(h.in_transit_amount || 0);
                              const daily = Number(p.daily_return || 0);
                              const today = (hold * daily) / 10000;
                              const annual = Number(p.annualized_1m || 0);
                              const days = daysHeld(h.hold_date);
                              const chartPoints = navHistory[p.id] || [];

                              return (
                                <Link
                                  key={h.id}
                                  href={`/holdings/${h.id}`}
                                  onClick={(e) => handleItemClick(e, h)}
                                  onMouseDown={() => handlePressStart(h)}
                                  onMouseUp={handlePressEnd}
                                  onMouseLeave={handlePressEnd}
                                  onTouchStart={() => handlePressStart(h)}
                                  onTouchEnd={handlePressEnd}
                                  onTouchMove={handlePressEnd}
                                  onContextMenu={(e) => e.preventDefault()}
                                  className="block px-5 py-4 group select-none
                                             hover:bg-slate-50 active:bg-slate-100
                                             border-b divider last:border-b-0
                                             transition-colors duration-150"
                                >
                                  <div className="flex items-start gap-3 mb-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[13px] text-slate-900 font-medium leading-snug">
                                        {p.name}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1.5">
                                        {p.category && (
                                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                            {p.category}
                                          </span>
                                        )}
                                        {days > 0 && (
                                          <span className="text-[10px] text-slate-400">持有 {days} 天</span>
                                        )}
                                        {transit > 0 && (
                                          <span className="text-[10px] text-amber-500">
                                            在途 {privacy ? "••" : transit.toLocaleString("zh-CN")}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {chartPoints.length >= 2 && (
                                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <MiniChart points={chartPoints} />
                                        <span className="text-[9px] text-slate-300">近 7 天</span>
                                      </div>
                                    )}
                                  </div>

                                                           <div className="grid grid-cols-4 gap-2 items-end mt-2">
                            <div>
                              <div className="text-[10px] text-slate-400 mb-1">市值</div>
                              <div className="font-mono font-bold text-[14px] text-slate-900 tabular">
                                {privacy ? "••••" : hold.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-end gap-1">
                                今日
                                {p.nav_date && p.nav_date !== todayStr() && (
                                  <span className="text-[9px] text-amber-500">
                                    {p.nav_date.slice(5)}
                                  </span>
                                )}
                              </div>
                              <div className={`font-mono font-semibold text-[14px] tabular ${
                                today > 0 ? "text-rose-500"
                                : today < 0 ? "text-emerald-500"
                                : "text-slate-400"
                              }`}>
                                {today >= 0 ? "+" : ""}{privacy ? "••" : today.toFixed(2)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400 mb-1">万收</div>
                              <div className={`font-mono font-semibold text-[14px] tabular ${
                                daily > 0 ? "text-rose-500"
                                : daily < 0 ? "text-emerald-500"
                                : "text-slate-400"
                              }`}>
                                {privacy ? "••" : daily.toFixed(2)}
                              </div>
                            </div>
                            <div className="text-right flex items-end justify-end gap-1">
                              <div>
                                <div className="text-[10px] text-slate-400 mb-1">年化</div>
                                <div className={`font-mono font-semibold text-[14px] tabular ${
                                  annual > 0 ? "text-rose-500"
                                  : annual < 0 ? "text-emerald-500"
                                  : "text-slate-400"
                                }`}>
                                  {annual > 0 ? "+" : ""}{annual.toFixed(2)}%
                                </div>
                              </div>
                              <svg
                                className="w-3.5 h-3.5 text-slate-300 row-arrow mb-0.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2.5}
                              >
                                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          </div>

                                  {p.nav_date && hi === group.items.length - 1 && (
                                    <div className="mt-3 pt-3 border-t divider flex items-center gap-1.5">
                                      <span className="w-1 h-1 bg-emerald-400 rounded-full" />
                                      <span className="text-[10px] text-slate-400">
                                        净值更新至 {p.nav_date}
                                      </span>
                                    </div>
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* ============ VIEW: 已清仓 ============ */}
        {/* ============================================================ */}
        {view === "closed" && (
          <>
            {closedHoldings.length === 0 ? (
              <div className="card p-12 text-center animate-fade-in-up">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl
                                bg-gradient-to-br from-slate-200 to-slate-300
                                flex items-center justify-center">
                  <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="text-[16px] font-bold text-slate-900 mb-2">还没有清仓记录</div>
                <div className="text-[12px] text-slate-400 mb-6 leading-relaxed">
                  当你在持仓详情里清仓后<br />会在这里留下历史记录
                </div>
              </div>
            ) : (
              <>
                {/* 已清仓汇总卡 */}
                <div className="card-summary p-6 mb-5 animate-fade-in-up delay-1">
                  <div className="text-[11px] text-slate-500 tracking-wider mb-2">
                    累计收益（元）
                  </div>
                  <div className={`text-[34px] leading-none font-bold tracking-tight tabular mb-5 ${
                    closedStats.totalProfit > 0 ? "text-rose-500"
                    : closedStats.totalProfit < 0 ? "text-emerald-500"
                    : "text-slate-400"
                  }`}>
                    {privacy
                      ? "••••••"
                      : `${closedStats.totalProfit >= 0 ? "+" : ""}${animatedClosedProfit.toLocaleString("zh-CN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`}
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-4 border-t divider">
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">已清仓</div>
                      <div className="font-mono font-bold text-[15px] text-slate-900 tabular">
                        {closedStats.total} 笔
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">盈 / 亏</div>
                      <div className="font-mono font-bold text-[15px] tabular">
                        <span className="text-rose-500">{closedStats.winCount}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-emerald-500">{closedStats.lossCount}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">综合收益率</div>
                      <div className={`font-mono font-bold text-[15px] tabular ${
                        closedStats.rate > 0 ? "text-rose-500"
                        : closedStats.rate < 0 ? "text-emerald-500"
                        : "text-slate-400"
                      }`}>
                        {privacy ? "••" : `${closedStats.rate >= 0 ? "+" : ""}${closedStats.rate.toFixed(2)}%`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 已清仓列表 */}
                <div className="space-y-3">
                  {closedHoldings.map((h, i) => {
                    const p = h.products;
                    if (!p) return null;
                    const info = getBankInfo(p.bank);
                    const purchase = Number(h.purchase_amount || 0);
                    const closed = Number(h.closed_amount || 0);
                    const profit = purchase > 0 ? closed - purchase : 0;
                    const rate = purchase > 0 ? (profit / purchase) * 100 : 0;
                    const hasPurchase = purchase > 0;
                    const days = daysHeld(h.hold_date, h.closed_at);
                    const closedDate = h.closed_at ? h.closed_at.slice(0, 10) : "—";

                    return (
                      <Link
                        key={h.id}
                        href={`/holdings/${h.id}`}
                        className="card p-4 block group
                                   hover:bg-slate-50/50
                                   transition-colors duration-200
                                   animate-fade-in-up"
                        style={{ animationDelay: `${0.04 * Math.min(i, 8)}s` }}
                      >
                        {/* 第一行：银行 + 产品名 + 已清仓标签 */}
                        <div className="flex items-start gap-3 mb-3">
                          <span
                            className="bank-avatar flex-shrink-0 mt-0.5"
                            style={{ background: info.bg, color: info.color }}
                          >
                            {info.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-slate-900 font-semibold leading-snug line-clamp-2">
                              {p.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-slate-400 truncate">
                                {p.bank}
                              </span>
                              {days > 0 && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="text-[10px] text-slate-400">
                                    持有 {days} 天
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold
                                             bg-slate-100 text-slate-500">
                              已清仓
                            </span>
                            <button
                              onClick={(e) => handleDeleteClosed(h, e)}
                              className="w-6 h-6 rounded-full
                                         flex items-center justify-center
                                         hover:bg-rose-50
                                         transition-colors"
                              aria-label="删除记录"
                            >
                              <svg className="w-3 h-3 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* 第二行：三列数据（买入 / 卖出 / 盈亏） */}
                        <div className="grid grid-cols-3 gap-3 py-3 border-t divider">
                          <div>
                            <div className="text-[10px] text-slate-400 mb-1">买入金额</div>
                            <div className="font-mono font-bold text-[13px] text-slate-900 tabular">
                              {hasPurchase
                                ? privacy
                                  ? "••••"
                                  : `¥${purchase.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                                : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400 mb-1">清仓金额</div>
                            <div className="font-mono font-bold text-[13px] text-slate-900 tabular">
                              {privacy ? "••••" : `¥${closed.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 mb-1">盈亏</div>
                            {hasPurchase ? (
                              <>
                                <div className={`font-mono font-bold text-[13px] tabular ${
                                  profit > 0 ? "text-rose-500"
                                  : profit < 0 ? "text-emerald-500"
                                  : "text-slate-400"
                                }`}>
                                  {privacy ? "••••" : `${profit >= 0 ? "+" : ""}${profit.toFixed(2)}`}
                                </div>
                                <div className={`text-[10px] font-mono tabular mt-0.5 ${
                                  rate > 0 ? "text-rose-500"
                                  : rate < 0 ? "text-emerald-500"
                                  : "text-slate-400"
                                }`}>
                                  {privacy ? "••" : `${rate >= 0 ? "+" : ""}${rate.toFixed(2)}%`}
                                </div>
                              </>
                            ) : (
                              <div className="text-[12px] text-slate-300">—</div>
                            )}
                          </div>
                        </div>

                        {/* 第三行：清仓日期 */}
                        <div className="pt-2.5 border-t divider flex items-center gap-1.5">
                          <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <rect x="3" y="5" width="18" height="16" rx="2.5" />
                            <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
                          </svg>
                          <span className="text-[10px] text-slate-400">
                            清仓于 {closedDate}
                          </span>
                          <span className="ml-auto text-[10px] text-purple-500 font-medium opacity-0 group-hover:opacity-100
                                           transition-opacity duration-200">
                            查看详情 →
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        <div className="h-8" />
      </div>

      {/* 长按快捷菜单（仅持仓） */}
      {menuItem && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-50 animate-fade-in"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => setMenuItem(null)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 animate-fade-in-up"
            style={{ animationDuration: "0.3s" }}
          >
            <div className="max-w-3xl mx-auto px-4 pb-4">
              <div className="bg-white rounded-3xl overflow-hidden shadow-2xl mb-2">
                <div className="px-5 py-4 border-b divider">
                  <div className="text-[13px] font-semibold text-slate-900 leading-snug mb-1">
                    {menuItem.products?.name || "产品"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {menuItem.products?.bank}
                  </div>
                </div>

                <div className="grid grid-cols-4">
                  <Link
                    href={`/holdings/${menuItem.id}?action=buy`}
                    className="flex flex-col items-center gap-2 py-5 hover:bg-slate-50 transition-colors"
                    onClick={() => setMenuItem(null)}
                  >
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-400 to-pink-500
                                    flex items-center justify-center shadow-lg shadow-rose-500/25">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <span className="text-[11px] text-slate-700 font-medium">加仓</span>
                  </Link>

                  <Link
                    href={`/holdings/${menuItem.id}?action=sell`}
                    className="flex flex-col items-center gap-2 py-5 hover:bg-slate-50 transition-colors border-x divider"
                    onClick={() => setMenuItem(null)}
                  >
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-orange-500
                                    flex items-center justify-center shadow-lg shadow-orange-500/25">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    </div>
                    <span className="text-[11px] text-slate-700 font-medium">赎回</span>
                  </Link>

                  <Link
                    href={`/holdings/${menuItem.id}?action=edit`}
                    className="flex flex-col items-center gap-2 py-5 hover:bg-slate-50 transition-colors border-r divider"
                    onClick={() => setMenuItem(null)}
                  >
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500
                                    flex items-center justify-center shadow-lg shadow-blue-500/25">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <span className="text-[11px] text-slate-700 font-medium">编辑</span>
                  </Link>

                  <Link
                    href={`/product/${menuItem.products?.id}`}
                    className="flex flex-col items-center gap-2 py-5 hover:bg-slate-50 transition-colors"
                    onClick={() => setMenuItem(null)}
                  >
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-purple-600
                                    flex items-center justify-center shadow-lg shadow-purple-500/25">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <span className="text-[11px] text-slate-700 font-medium">走势</span>
                  </Link>
                </div>
              </div>

              <button
                onClick={() => setMenuItem(null)}
                className="w-full bg-white rounded-2xl py-4 text-[15px] font-semibold
                           text-slate-700 shadow-2xl active:bg-slate-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}