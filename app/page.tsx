"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { useCountUp } from "../lib/useCountUp";
import { getBankInfo } from "../lib/banks";
import HoldingDistribution from "./components/HoldingDistribution";
import MonitorPanel from "./components/MonitorPanel";
import { getHoldingMarketValue } from "../lib/holdings";

// --- 工具函数 ---
function daysHeld(holdDate?: string | null, endDate?: string | null): number {
  if (!holdDate) return 0;
  const start = new Date(holdDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SortKey = "value" | "today" | "dailyReturn" | "annual" | "days";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "value", label: "市值" },
  { key: "today", label: "今日" },
  { key: "dailyReturn", label: "日涨幅" },
  { key: "annual", label: "年化" },
  { key: "days", label: "天数" },
];

const ANNUAL_PERIODS = [
  { key: "7d", label: "7天" },
  { key: "14d", label: "14天" },
  { key: "1m", label: "1月" },
  { key: "3m", label: "3月" },
  { key: "6m", label: "6月" },
  { key: "1y", label: "1年" },
  { key: "all", label: "成立" },
];

type StatusFilter = "all" | "confirmed" | "transit";
const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "confirmed", label: "持仓" },
  { key: "transit", label: "在途" },
];

type View = "active" | "closed" | "monitor";

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
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="1.8" fill={stroke} />
    </svg>
  );
}

// ★ 完美复刻：严格按照你的 .txt 里的逻辑
function calcAnnualizedFromNav(navs: {nav: number, date: string}[], period: string) {
  if (!navs || navs.length < 2) return 0;
  const sorted = [...navs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latest = sorted[sorted.length - 1];
  const latestDate = new Date(latest.date);

  let targetDate = new Date(latestDate);

  if (period === "7d") targetDate.setDate(targetDate.getDate() - 7);
  else if (period === "14d") targetDate.setDate(targetDate.getDate() - 14);
  else if (period === "1m") targetDate.setMonth(targetDate.getMonth() - 1);
  else if (period === "3m") targetDate.setMonth(targetDate.getMonth() - 3);
  else if (period === "6m") targetDate.setMonth(targetDate.getMonth() - 6);
  else if (period === "1y") targetDate.setFullYear(targetDate.getFullYear() - 1);
  else if (period === "all") {
    const first = sorted[0];
    const days = Math.max(1, (latestDate.getTime() - new Date(first.date).getTime()) / 86400000);
    return ((latest.nav / first.nav - 1) / days) * 365 * 100;
  }

  // 寻找离 targetDate 最近的净值点
  let closestNav = sorted[0];
  let minDiff = Infinity;
  for (const item of sorted) {
    const diff = Math.abs(new Date(item.date).getTime() - targetDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closestNav = item;
    }
  }

  const actualDays = Math.max(1, (latestDate.getTime() - new Date(closestNav.date).getTime()) / 86400000);
  const returnRate = (latest.nav / closestNav.nav) - 1;

  return (returnRate / actualDays) * 365 * 100;
}

export default function HomePage() {
  const [allHoldings, setAllHoldings] = useState<any[]>([]);
  const [navHistory, setNavHistory] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(false);
  const [nowStr, setNowStr] = useState("");
  const [bankFilter, setBankFilter] = useState("全部");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDesc, setSortDesc] = useState(true);
  const [annualPeriod, setAnnualPeriod] = useState("1m");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [view, setView] = useState<View>("active");

  const PAGE_SIZE = 8;
  const [bankPages, setBankPages] = useState<Record<string, number>>({});
  const [menuItem, setMenuItem] = useState<any | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressed = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    setNowStr(`${y}年${m}月${day}日 ${hh}:${mm}`);
  }, []);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) { setLoading(false); return; }

    async function fetchData() {
      const { data } = await supabase
        .from("user_holdings")
        .select(
          "id, holding_amount, in_transit_amount, purchase_amount, shares, hold_date, closed_at, closed_amount, status, products(id, name, bank, category, unit_nav, nav_date)"
        )
        .eq("user_id", userId)
        .in("status", ["active", "closed"]);

      if (!data) { setLoading(false); return; }
      setAllHoldings(data);

      const activeIds = data.filter((h: any) => h.status === "active").map((h: any) => h.products?.id).filter(Boolean);
      
      if (activeIds.length > 0) {
        const allGrouped: Record<number, {nav: number, date: string}[]> = {};
        await Promise.all(
          activeIds.map(async (id: number) => {
            const { data: navData } = await supabase
              .from("nav_history")
              .select("nav_date, unit_nav")
              .eq("product_id", id)
              .gte("nav_date", daysAgoStr(400)) 
              .order("nav_date", { ascending: true });
              
            if (navData && navData.length > 0) {
              allGrouped[id] = navData.map((r: any) => ({
                nav: Number(r.unit_nav),
                date: r.nav_date
              }));
            }
          })
        );
        setNavHistory(allGrouped);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  useLayoutEffect(() => {
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("view");
      if (v === "monitor" || v === "closed" || v === "active") { 
        setView(v as View);
      }
    }
    window.scrollTo(0, 0);
    setScrolled(false);
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 180);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setBankPages({});
  }, [bankFilter, statusFilter, sortKey, sortDesc, annualPeriod]);

  function switchView(v: View) {
    setView(v);
    if (typeof window !== "undefined") {
      const url = v === "active" ? "/" : `/?view=${v}`;
      window.history.replaceState(null, "", url);
    }
  }

  const holdings = useMemo(() => allHoldings.filter(h => h.status === "active"), [allHoldings]);
  const closedHoldings = useMemo(
    () => allHoldings.filter(h => h.status === "closed").sort((a, b) => {
      const ta = a.closed_at ? new Date(a.closed_at).getTime() : 0;
      const tb = b.closed_at ? new Date(b.closed_at).getTime() : 0;
      return tb - ta;
    }),
    [allHoldings]
  );

  const globalStats = useMemo(() => {
    if (loading) return { totalAssets: 0, totalHolding: 0, totalInTransit: 0, totalProfitToday: 0, totalProfitCumulative: 0, monthProfit: 0, todayWanfen: 0, totalRate: 0, monthAnnual: 0, latestNavDateStr: "" };

    const totalHolding = holdings.reduce((s, h) => s + getHoldingMarketValue(h), 0);
    const totalInTransit = holdings.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
    const totalAssets = totalHolding + totalInTransit;

    const dates = holdings.map(h => h.products?.nav_date).filter(Boolean).sort();
    const latestNavDateStr = dates.length > 0 ? String(dates[dates.length - 1]) : "";

    let totalProfitToday = 0;
    let totalProfitCumulative = 0;
    let monthProfit = 0;

    const d = new Date();
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

    holdings.forEach(h => {
      const p = h.products;
      if (!p) return;
      const shares = Number(h.shares || 0);
      const hold = getHoldingMarketValue(h);
      const purchase = Number(h.purchase_amount || 0);
      
      if (purchase > 0) totalProfitCumulative += (hold - purchase);

      const navs = navHistory[p.id] || [];
      if (navs.length >= 2) {
        totalProfitToday += shares * (navs[navs.length - 1].nav - navs[navs.length - 2].nav);
        
        for (let i = 1; i < navs.length; i++) {
          if (navs[i].date >= monthStart) {
            monthProfit += shares * (navs[i].nav - navs[i - 1].nav);
          }
        }
      }
    });

    const todayWanfen = totalHolding > 0 ? (totalProfitToday / totalHolding) * 10000 : 0;
    const totalCost = totalHolding - totalProfitCumulative;
    const totalRate = totalCost > 0 ? (totalProfitCumulative / totalCost) * 100 : 0;
    
    const daysPassed = d.getDate();
    const monthAnnual = totalHolding > 0 && daysPassed > 0 ? (monthProfit / totalHolding) * (365 / daysPassed) * 100 : 0;

    return {
      totalAssets, totalHolding, totalInTransit, totalProfitToday, totalProfitCumulative, monthProfit, todayWanfen, totalRate, monthAnnual, latestNavDateStr
    };
  }, [holdings, navHistory, loading]);

  const animatedAssets = useCountUp(globalStats.totalAssets, 1200);
  const animatedToday = useCountUp(globalStats.totalProfitToday, 1200);
  const animatedCum = useCountUp(globalStats.totalProfitCumulative, 1200);
  const animatedMonth = useCountUp(globalStats.monthProfit, 1200);

  const closedStats = useMemo(() => {
    let totalProfit = 0, totalInvested = 0, winCount = 0, lossCount = 0, flatCount = 0;
    closedHoldings.forEach(h => {
      const purchase = Number(h.purchase_amount || 0);
      const closed = Number(h.closed_amount || 0);
      const profit = purchase > 0 ? closed - purchase : 0;
      totalProfit += profit; totalInvested += purchase;
      if (profit > 0.01) winCount++;
      else if (profit < -0.01) lossCount++;
      else flatCount++;
    });
    return { totalProfit, totalInvested, winCount, lossCount, flatCount, total: closedHoldings.length, rate: totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0 };
  }, [closedHoldings]);

  const latestNavDate = useMemo(() => {
    if (!globalStats.latestNavDateStr) return null;
    return globalStats.latestNavDateStr.slice(5);
  }, [globalStats.latestNavDateStr]);

  const bankList = useMemo(() => {
    const counter: Record<string, { count: number; total: number }> = {};
    holdings.forEach(h => {
      const b = h.products?.bank || "其他";
      if (!counter[b]) counter[b] = { count: 0, total: 0 };
      counter[b].count += 1;
      counter[b].total += getHoldingMarketValue(h);
    });
    const list = Object.entries(counter).sort((a, b) => b[1].total - a[1].total).map(([bank, info]) => ({ bank, ...info }));
    return [{ bank: "全部", count: holdings.length, total: globalStats.totalHolding }, ...list];
  }, [holdings, globalStats.totalHolding]);

  const groupSummary = useMemo(() => {
    let filtered = holdings;
    if (statusFilter === "confirmed") filtered = filtered.filter(h => Number(h.holding_amount || 0) > 0);
    else if (statusFilter === "transit") filtered = filtered.filter(h => Number(h.in_transit_amount || 0) > 0);
    if (bankFilter !== "全部") filtered = filtered.filter(h => (h.products?.bank || "其他") === bankFilter);

    const sortedItems = [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "value") {
        diff = getHoldingMarketValue(b) - getHoldingMarketValue(a);
      } else if (sortKey === "today") {
        const navsA = navHistory[a.products?.id || 0] || [];
        const navsB = navHistory[b.products?.id || 0] || [];
        const aP = navsA.length >= 2 ? Number(a.shares||0) * (navsA[navsA.length-1].nav - navsA[navsA.length-2].nav) : 0;
        const bP = navsB.length >= 2 ? Number(b.shares||0) * (navsB[navsB.length-1].nav - navsB[navsB.length-2].nav) : 0;
        diff = bP - aP;
      } else if (sortKey === "dailyReturn") {
        const aNavs = navHistory[a.products?.id || 0] || [];
        const bNavs = navHistory[b.products?.id || 0] || [];
        const aRate = aNavs.length >= 2 ? (aNavs[aNavs.length-1].nav - aNavs[aNavs.length-2].nav) / aNavs[aNavs.length-2].nav : 0;
        const bRate = bNavs.length >= 2 ? (bNavs[bNavs.length-1].nav - bNavs[bNavs.length-2].nav) / bNavs[bNavs.length-2].nav : 0;
        diff = bRate - aRate;
      } else if (sortKey === "annual") {
        const navsA = navHistory[a.products?.id || 0] || [];
        const navsB = navHistory[b.products?.id || 0] || [];
        const annualA = calcAnnualizedFromNav(navsA, annualPeriod);
        const annualB = calcAnnualizedFromNav(navsB, annualPeriod);
        diff = annualB - annualA;
      } else {
        diff = daysHeld(b.hold_date) - daysHeld(a.hold_date);
      }
      return sortDesc ? diff : -diff;
    });

    const grouped: Record<string, any[]> = {};
    sortedItems.forEach(h => {
      const key = h.products?.bank || "其他";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(h);
    });

    return Object.entries(grouped).map(([bank, items]) => {
      const total = items.reduce((s, h) => s + getHoldingMarketValue(h), 0);
      const inTransit = items.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
      
      const todayProfit = items.reduce((s, h) => {
        const navs = navHistory[h.products?.id || 0] || [];
        if (navs.length < 2) return s;
        return s + Number(h.shares || 0) * (navs[navs.length-1].nav - navs[navs.length-2].nav);
      }, 0);

      const currentPage = bankPages[bank] || 1;
      const totalPages = Math.ceil(items.length / PAGE_SIZE) || 1;
      const startIdx = (currentPage - 1) * PAGE_SIZE;
      const paginatedItems = items.slice(startIdx, startIdx + PAGE_SIZE);

      return { bank, items: paginatedItems, total, inTransit, todayProfit, currentPage, totalPages };
    }).sort((a, b) => b.total - a.total);
  }, [holdings, bankFilter, sortKey, sortDesc, statusFilter, navHistory, annualPeriod, bankPages]);

  function fmtMoney(n: number) { return privacy ? "••••" : n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtProfit(n: number) { return privacy ? "••" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}`; }

  const handlePressStart = (h: any) => {
    longPressed.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setMenuItem(h);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) { try { (navigator as any).vibrate(10); } catch {} }
    }, 480);
  };
  const handlePressEnd = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };
  const handleItemClick = (e: React.MouseEvent, h: any) => {
    if (longPressed.current) { e.preventDefault(); e.stopPropagation(); longPressed.current = false; }
  };

  return (
    <div className="min-h-screen pb-24 bg-slate-50">
      {mounted && (
        <div className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"}`}
          style={{ background: "rgba(255, 255, 255, 0.88)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", borderBottom: "1px solid rgba(15, 23, 42, 0.06)" }}>
          <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400">{view === "active" ? "总资产" : view === "closed" ? "已清仓累计" : "净值监控"}</span>
              <span className="font-mono font-bold text-[15px] text-slate-900 tabular">
                {view === "monitor" ? "监控规则" : `¥${privacy ? "••••" : (view === "active" ? globalStats.totalAssets : closedStats.totalProfit).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
            {view === "active" ? (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400">今日</span>
                <span className={`font-mono font-bold text-[14px] tabular ${globalStats.totalProfitToday > 0 ? "text-rose-500" : globalStats.totalProfitToday < 0 ? "text-emerald-500" : "text-slate-700"}`}>{fmtProfit(globalStats.totalProfitToday)}</span>
              </div>
            ) : <div />}
            {view !== "monitor" && (
              <button onClick={() => setPrivacy(p => !p)} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center active:scale-90 transition-all duration-200">
                {privacy ? <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" /></svg> : <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">理财助手</div>
            <div className="text-[12px] text-slate-400 mt-0.5">{nowStr}</div>
          </div>
          {view !== "monitor" && (
            <button onClick={() => setPrivacy(p => !p)} className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center transition-all duration-300 active:scale-90">
              {privacy ? <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" /></svg> : <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
          )}
        </div>

        {loading ? (
          <>
            <div className="w-full h-[190px] rounded-[24px] bg-slate-200/60 animate-pulse mb-5" />
            <div className="w-full h-[44px] rounded-xl bg-slate-200/60 animate-pulse mb-5" />
            <div className="w-full h-[180px] rounded-[18px] bg-slate-200/60 animate-pulse mb-4" />
          </>
        ) : (
          <>
            {holdings.length > 0 && (
              <div className="card-hero mb-5">
                <div className="dot-pattern" />
                <div className="p-6 relative z-10">
                  <button onClick={() => setSummaryCollapsed(c => !c)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all duration-300 active:scale-90">
                    <svg className={`w-3.5 h-3.5 text-white transition-transform duration-300 ${summaryCollapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <div className="text-[11px] text-white/70 tracking-wider mb-2">总资产（元）</div>
                  <div className={`text-white leading-none font-bold tracking-tight tabular transition-all duration-500 ${summaryCollapsed ? "text-[28px]" : "text-[36px] mb-5"}`}>
                    {privacy ? "••••••" : animatedAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={`overflow-hidden transition-all duration-500 ${summaryCollapsed ? "max-h-0 opacity-0" : "max-h-[400px] opacity-100"}`}>
                    
                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/15">
                      <div className="bg-white/10 rounded-xl p-3 flex flex-col justify-between">
                        <div className="flex items-start justify-between mb-1.5">
                          <span className="text-[11px] text-white/70">今日收益</span>
                          {latestNavDate && <span className="text-[9px] text-amber-200 bg-black/10 px-1 rounded">{latestNavDate}</span>}
                        </div>
                        <div className="font-mono font-bold text-[17px] text-white tracking-tight leading-none mb-1">
                          {fmtProfit(animatedToday)}
                        </div>
                        <div className="text-[10px] text-white/60">万份 {globalStats.todayWanfen.toFixed(2)}</div>
                      </div>

                      <div className="bg-white/10 rounded-xl p-3 flex flex-col justify-between">
                        <div className="text-[11px] text-white/70 mb-1.5">本月收益</div>
                        <div className="font-mono font-bold text-[17px] text-white tracking-tight leading-none mb-1">
                          {fmtProfit(animatedMonth)}
                        </div>
                        <div className="text-[10px] text-white/60">年化 {globalStats.monthAnnual.toFixed(2)}%</div>
                      </div>

                      <div className="bg-white/10 rounded-xl p-3 flex flex-col justify-between">
                        <div className="text-[11px] text-white/70 mb-1.5">累计收益</div>
                        <div className="font-mono font-bold text-[17px] text-white tracking-tight leading-none mb-1">
                          {fmtProfit(animatedCum)}
                        </div>
                        <div className="text-[10px] text-white/60">收益率 {globalStats.totalRate.toFixed(2)}%</div>
                      </div>

                      <div className="bg-white/10 rounded-xl p-3 flex flex-col justify-between">
                        <div className="text-[11px] text-white/70 mb-1.5">持仓产品</div>
                        <div className="font-mono font-bold text-[17px] text-white tracking-tight leading-none mb-1">
                          {holdings.length} <span className="text-[12px] font-normal text-white/60">个</span>
                        </div>
                        <div className="text-[10px] text-white/60">在途 {fmtMoney(globalStats.totalInTransit)}</div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}

            <div className="segment-group flex mb-5">
              <button onClick={() => switchView("active")} className={`flex-1 py-2.5 text-[12px] segment-item ${view === "active" ? "segment-item-active" : "hover:text-slate-700"}`}>持仓 {holdings.length > 0 ? `${holdings.length}` : ""}</button>
              <button onClick={() => switchView("closed")} className={`flex-1 py-2.5 text-[12px] segment-item ${view === "closed" ? "segment-item-active" : "hover:text-slate-700"}`}>已清仓 {closedHoldings.length > 0 ? `${closedHoldings.length}` : ""}</button>
              <button onClick={() => switchView("monitor")} className={`flex-1 py-2.5 text-[12px] segment-item ${view === "monitor" ? "segment-item-active" : "hover:text-slate-700"}`}>监控</button>
            </div>

            <div className="relative">
              <div style={{ display: view === "active" ? "block" : "none" }}>
                {holdings.length === 0 && closedHoldings.length === 0 ? (
                  <div className="flex items-center justify-center px-1 mt-8">
                    <div className="max-w-sm w-full text-center">
                      <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-xl shadow-purple-500/25">
                        <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      </div>
                      <div className="text-[20px] font-bold text-slate-900 mb-2">还没有理财记录</div>
                      <div className="text-[13px] text-slate-400 mb-8 leading-relaxed">添加第一笔理财，开始记录你的净值变化</div>
                      <Link href="/add" className="btn-primary inline-block text-sm px-8 py-3">添加持仓</Link>
                    </div>
                  </div>
                ) : holdings.length === 0 ? (
                  <div className="card p-12 text-center">
                    <div className="text-slate-300 text-sm mb-3">暂无持仓</div>
                    <Link href="/add" className="btn-primary inline-block text-xs px-6 py-2.5">添加持仓</Link>
                  </div>
                ) : (
                  <>
                    <HoldingDistribution holdings={holdings} privacy={privacy} />

                    <div className="mb-3">
                      <div className="segment-group flex">
                        {STATUS_TABS.map(t => (
                          <button key={t.key} onClick={() => setStatusFilter(t.key)} className={`flex-1 py-2 text-[13px] segment-item ${statusFilter === t.key ? "segment-item-active" : "hover:text-slate-700"}`}>{t.label}</button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
                        {bankList.map(b => {
                          const isActive = bankFilter === b.bank;
                          const info = b.bank === "全部" ? null : getBankInfo(b.bank);
                          return (
                            <button key={b.bank} onClick={() => setBankFilter(b.bank)} className={`bank-pill ${isActive ? "bank-pill-active" : ""}`} style={!isActive && info ? { borderColor: info.bg } : undefined}>
                              {b.bank}<span className={`ml-1.5 text-[10px] tabular ${isActive ? "text-white/80" : "text-slate-400"}`}>{b.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mb-5">
                      <div className="segment-group flex">
                        {SORTS.map(s => {
                          const isActive = sortKey === s.key;
                          return (
                            <button key={s.key} onClick={() => { if (isActive) setSortDesc(d => !d); else { setSortKey(s.key); setSortDesc(true); } }}
                              className={`flex-1 py-2 text-[13px] segment-item flex items-center justify-center gap-1 ${isActive ? "segment-item-active" : "hover:text-slate-700"}`}>
                              {s.label}
                              {isActive && <svg className={`w-3 h-3 transition-transform duration-300 ${sortDesc ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>}
                            </button>
                          );
                        })}
                      </div>
                      
                      {sortKey === "annual" && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar mt-2 bg-slate-50 p-1 rounded-xl">
                          {ANNUAL_PERIODS.map(p => (
                            <button key={p.key} onClick={() => setAnnualPeriod(p.key)}
                              className={`flex-1 py-1.5 px-3 rounded-lg text-[11px] font-medium transition-all ${
                                annualPeriod === p.key ? "bg-white text-purple-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                              }`}>
                              {p.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      {groupSummary.length === 0 ? (
                        <div className="card p-12 text-center text-slate-300 text-xs">该筛选条件下暂无持仓</div>
                      ) : (
                        groupSummary.map((group, gi) => {
                          const info = getBankInfo(group.bank);
                          const percent = globalStats.totalHolding > 0 ? (group.total / globalStats.totalHolding) * 100 : 0;
                          
                          return (
                            <div key={group.bank} className="card overflow-hidden" style={{ animationDelay: `${0.06 * (gi + 1)}s` }}>
                              <div className="flex items-stretch">
                                <div className="w-1" style={{ background: info.bar }} />
                                <div className="flex-1 px-5 py-4 bg-slate-50/60 border-b divider">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2.5">
                                      <span className="bank-avatar" style={{ background: info.bg, color: info.color }}>{info.label}</span>
                                      <div>
                                        <div className="text-[13px] font-semibold text-slate-900 leading-tight">{group.bank}</div>
                                        <div className="text-[11px] text-slate-400 leading-tight mt-0.5">{group.items.length} 个产品 · 占比 {percent.toFixed(1)}%</div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-[13px] font-mono font-bold text-slate-900 tabular">{privacy ? "••••" : group.total.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</div>
                                      <div className={`text-[11px] font-mono tabular ${group.todayProfit > 0 ? "text-rose-500" : group.todayProfit < 0 ? "text-emerald-500" : "text-slate-400"}`}>{fmtProfit(group.todayProfit)}</div>
                                    </div>
                                  </div>
                                  <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percent}%`, background: info.bar }} />
                                  </div>
                                </div>
                              </div>

                              <div>
                                {group.items.map((h: any, hi: number) => {
                                  const p = h.products;
                                  if (!p) return null;
                                  const hold = getHoldingMarketValue(h);
                                  const transit = Number(h.in_transit_amount || 0);
                                  
                                  const allNavs = navHistory[p.id] || [];
                                  const chartPoints = allNavs.slice(-15);

                                  const today = chartPoints.length >= 2 ? Number(h.shares||0) * (chartPoints[chartPoints.length-1].nav - chartPoints[chartPoints.length-2].nav) : 0;
                                  const todayRate = chartPoints.length >= 2 ? ((chartPoints[chartPoints.length-1].nav - chartPoints[chartPoints.length-2].nav) / chartPoints[chartPoints.length-2].nav) * 100 : 0;
                                  
                                  const annual = calcAnnualizedFromNav(allNavs, annualPeriod);
                                  const days = daysHeld(h.hold_date);

                                  return (
                                    <Link key={h.id} href={`/product/${p.id}`} onClick={(e) => handleItemClick(e, h)} onMouseDown={() => handlePressStart(h)} onMouseUp={handlePressEnd} onMouseLeave={handlePressEnd} onTouchStart={() => handlePressStart(h)} onTouchEnd={handlePressEnd} onTouchMove={handlePressEnd} onContextMenu={(e) => e.preventDefault()}
                                      className="block px-5 py-4 group select-none hover:bg-slate-50 active:bg-slate-100 border-b divider last:border-b-0 transition-colors duration-150">
                                      <div className="flex items-start gap-3 mb-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[13px] text-slate-900 font-medium leading-snug">{p.name}</div>
                                          <div className="flex items-center gap-2 mt-1.5">
                                            {p.category && <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">{p.category}</span>}
                                            {days > 0 && <span className="text-[10px] text-slate-400">持有 {days} 天</span>}
                                            {transit > 0 && <span className="text-[10px] text-amber-500">在途 {privacy ? "••" : transit.toLocaleString("zh-CN")}</span>}
                                          </div>
                                        </div>
                                        {chartPoints.length >= 2 && (
                                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            <MiniChart points={chartPoints.map((c:any)=>c.nav)} />
                                            <span className="text-[9px] text-slate-300">近期走势</span>
                                          </div>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-4 gap-2 items-end mt-2">
                                        <div>
                                          <div className="text-[10px] text-slate-400 mb-1">市值</div>
                                          <div className="font-mono font-bold text-[14px] text-slate-900 tabular">{privacy ? "••••" : hold.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-end gap-1">今日{p.nav_date && p.nav_date !== todayStr() && <span className="text-[9px] text-amber-500">{p.nav_date.slice(5)}</span>}</div>
                                          <div className={`font-mono font-semibold text-[14px] tabular ${today > 0 ? "text-rose-500" : today < 0 ? "text-emerald-500" : "text-slate-400"}`}>{today >= 0 ? "+" : ""}{privacy ? "••" : today.toFixed(2)}</div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-[10px] text-slate-400 mb-1">日涨幅</div>
                                          <div className={`font-mono font-semibold text-[14px] tabular ${todayRate > 0 ? "text-rose-500" : todayRate < 0 ? "text-emerald-500" : "text-slate-400"}`}>{privacy ? "••" : `${todayRate >= 0 ? "+" : ""}${todayRate.toFixed(2)}%`}</div>
                                        </div>
                                        <div className="text-right flex items-end justify-end gap-1">
                                          <div>
                                            <div className="text-[10px] text-slate-400 mb-1">年化({ANNUAL_PERIODS.find(x=>x.key===annualPeriod)?.label})</div>
                                            <div className={`font-mono font-semibold text-[14px] tabular ${annual > 0 ? "text-rose-500" : annual < 0 ? "text-emerald-500" : "text-slate-400"}`}>{annual > 0 ? "+" : ""}{annual.toFixed(2)}%</div>
                                          </div>
                                          <svg className="w-3.5 h-3.5 text-slate-300 row-arrow mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        </div>
                                      </div>
                                      {p.nav_date && hi === group.items.length - 1 && (
                                        <div className="mt-3 pt-3 border-t divider flex items-center gap-1.5">
                                          <span className="w-1 h-1 bg-emerald-400 rounded-full" /><span className="text-[10px] text-slate-400">净值更新至 {p.nav_date}</span>
                                        </div>
                                      )}
                                    </Link>
                                  );
                                })}
                              </div>

                              {group.totalPages > 1 && (
                                <div className="flex items-center justify-between px-5 py-3 border-t divider bg-slate-50/50">
                                  <button 
                                    onClick={() => setBankPages(prev => ({ ...prev, [group.bank]: group.currentPage - 1 }))}
                                    disabled={group.currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 bg-white border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                                  >
                                    上一页
                                  </button>
                                  <div className="text-[12px] text-slate-500 font-medium tabular">
                                    第 <span className="text-purple-600">{group.currentPage}</span> / {group.totalPages} 页
                                  </div>
                                  <button 
                                    onClick={() => setBankPages(prev => ({ ...prev, [group.bank]: group.currentPage + 1 }))}
                                    disabled={group.currentPage === group.totalPages}
                                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 bg-white border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                                  >
                                    下一页
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: view === "closed" ? "block" : "none" }}>
                <div className="text-center text-slate-400 mt-10">已清仓功能精简中...</div>
              </div>

              <div style={{ display: view === "monitor" ? "block" : "none" }}>
                <MonitorPanel />
              </div>
            </div>
          </>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}