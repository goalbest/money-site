"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabase";
import { getHoldingMarketValue } from "../lib/holdings";
import AssetCard from "./components/AssetCard";

const AllView = dynamic(() => import("./components/AllView"), { 
  ssr: false,
  loading: () => <div className="h-40 flex items-center justify-center text-slate-400 text-sm animate-pulse">正在加载持仓列表...</div>
});
const CalendarView = dynamic(() => import("./components/CalendarView"), { ssr: false });
const AddModal = dynamic(() => import("./components/AddModal"), { ssr: false });

// ★ 核心修复：把 CACHE_KEY 定义在组件外部，防止作用域报错
const CACHE_KEY = "cache_home_data_v11";

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type View = "calendar" | "all";

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);

  // 从缓存初始化数据，实现秒开
  const [allHoldings, setAllHoldings] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).allHoldings || [];
    }
    return [];
  });
  
  const [allProducts, setAllProducts] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).allProducts || [];
    }
    return [];
  });

  const [navHistory, setNavHistory] = useState<Record<number, any[]>>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).navHistory || {};
    }
    return {};
  });

  const [transactions, setTransactions] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).transactions || [];
    }
    return [];
  });

  const [updatedAt, setUpdatedAt] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).updatedAt || "";
    }
    return "";
  });

  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") return !localStorage.getItem(CACHE_KEY);
    return true;
  });

  const [refreshing, setRefreshing] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [nowStr, setNowStr] = useState("");
  const [view, setView] = useState<View>("all");
  const [hideFab, setHideFab] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // 静默拉取最新数据（不再强制展示全屏 loading）
  const fetchData = useCallback(async (userId: string, isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const { data: hd } = await supabase.from("user_holdings")
        .select("id, holding_amount, in_transit_amount, purchase_amount, shares, hold_date, closed_at, closed_amount, status, products(id, name, bank, category, unit_nav, nav_date)")
        .eq("user_id", userId).in("status", ["active", "closed"]);

      const { data: txs } = await supabase.from("transactions").select("product_id, type, amount, shares, trade_date").eq("user_id", userId);

      const { data: prods } = await supabase.from("products")
        .select("id, name, bank, code, unit_nav, nav_date, daily_return, annualized_1m")
        .order("id", { ascending: false })
        .limit(1000);

      const allProductIds = (hd || []).map((h: any) => h.products?.id).filter(Boolean);
      const uniqueProductIds = [...new Set(allProductIds)] as number[];
      
      let allGrouped: Record<number, {nav: number, date: string}[]> = {};
      
      if (uniqueProductIds.length > 0) {
        await Promise.all(uniqueProductIds.map(async (id: number) => {
          const { data: navData } = await supabase.from("nav_history")
            .select("nav_date, unit_nav")
            .eq("product_id", id)
            .order("nav_date", { ascending: true });
          if (navData && navData.length > 0) {
            allGrouped[id] = navData.map((r: any) => ({ nav: Number(r.unit_nav), date: r.nav_date }));
          }
        }));
      }

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      setAllHoldings(hd || []);
      setAllProducts(prods || []);
      setNavHistory(allGrouped);
      setTransactions(txs || []);
      setUpdatedAt(timeStr);
      setLoading(false); 

      // 更新缓存
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        allHoldings: hd || [],
        allProducts: prods || [],
        navHistory: allGrouped,
        transactions: txs || [],
        updatedAt: timeStr
      }));
    } catch (err) {
      console.error("加载数据失败:", err);
      setLoading(false);
    } finally {
      if (isManual) setTimeout(() => setRefreshing(false), 500);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const d = new Date();
    setNowStr(`${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`);
    const onScroll = () => setHideFab(window.scrollY > 150);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("view");
      if (v === "calendar" || v === "all") setView(v as View);
    }
  }, []);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) { setLoading(false); return; }
    fetchData(userId);
  }, [fetchData]);

  function switchView(v: View) {
    setView(v);
    if (typeof window !== "undefined") window.history.replaceState(null, "", v === "all" ? "/" : `/?view=${v}`);
  }

  // ★ 核心修复：处理日历页的触摸滑动
  const handleCalendarTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleCalendarTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = touchStartRef.current.x - endX;
    const dy = touchStartRef.current.y - endY;
    touchStartRef.current = null;

    // 向右滑动（dx < 0），且横向滑动幅度大于纵向
    if (dx < -50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      switchView("all");
    }
  };

  const holdings = useMemo(() => allHoldings.filter(h => h.status === "active"), [allHoldings]);

  const globalStats = useMemo(() => {
    const totalHolding = holdings.reduce((s, h) => s + getHoldingMarketValue(h), 0);
    const totalInTransit = holdings.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
    const dates = holdings.map(h => h.products?.nav_date).filter(Boolean).sort();
    const latestNavDateStr = dates.length > 0 ? String(dates[dates.length - 1]) : "";
    
    let totalProfitToday = 0, totalProfitCumulative = 0, monthProfit = 0;
    const d = new Date();
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

    holdings.forEach(h => {
      const p = h.products; if (!p) return;
      const shares = Number(h.shares || 0); const hold = getHoldingMarketValue(h); const purchase = Number(h.purchase_amount || 0);
      if (purchase > 0) totalProfitCumulative += (hold - purchase);
      
      const navs = navHistory[p.id] || [];
      if (navs.length >= 2) {
        // 核心修复：只有当该基金更新到了全局最新日期，且买入日期早于或等于最新日期时，才算今日收益
        if (p.nav_date === latestNavDateStr && (!h.hold_date || h.hold_date <= p.nav_date)) {
          totalProfitToday += shares * (navs[navs.length - 1].nav - navs[navs.length - 2].nav);
        }
        for (let i = 1; i < navs.length; i++) { 
          if (navs[i].date >= monthStart) {
            monthProfit += shares * (navs[i].nav - navs[i - 1].nav); 
          }
        }
      }
    });

    return {
      totalAssets: totalHolding + totalInTransit, totalHolding, totalInTransit, totalProfitToday, totalProfitCumulative, monthProfit,
      todayWanfen: totalHolding > 0 ? (totalProfitToday / totalHolding) * 10000 : 0,
      totalRate: totalHolding - totalProfitCumulative > 0 ? (totalProfitCumulative / (totalHolding - totalProfitCumulative)) * 100 : 0,
      monthAnnual: totalHolding > 0 && d.getDate() > 0 ? (monthProfit / totalHolding) * (365 / d.getDate()) * 100 : 0,
      latestNavDateStr
    };
  }, [holdings, navHistory]);

  return (
    <div className="min-h-screen pb-24 bg-slate-50">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">理财助手</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[12px] text-slate-400">{nowStr}</span>
              
              {mounted && globalStats.latestNavDateStr && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                  净值至 {String(globalStats.latestNavDateStr).slice(5)}
                </span>
              )}
              {mounted && updatedAt && (
                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  {updatedAt} 已同步
                </span>
              )}
            </div>
          </div>
          
          <button 
            onClick={() => { const userId = localStorage.getItem("user_id"); if(userId) fetchData(userId, true); }}
            disabled={refreshing}
            className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center active:scale-90 transition-all shadow-sm disabled:opacity-50"
          >
            <svg className={`w-4 h-4 text-slate-500 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button onClick={() => setPrivacy(p => !p)} className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center active:scale-90 transition-all shadow-sm">
            {privacy ? <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" /></svg> : <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
        </div>

        {loading ? (
          <div className="w-full h-[190px] rounded-[24px] bg-slate-200/60 animate-pulse mb-5" />
        ) : (
          <>
            {holdings.length > 0 && <AssetCard stats={globalStats} privacy={privacy} />}

            <div className="relative flex p-1.5 rounded-[22px] mb-6 overflow-hidden border border-white/60" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 100%)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(31, 38, 135, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.8)" }}>
              <div className="absolute top-1.5 bottom-1.5 rounded-2xl transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]" style={{ width: "calc(50% - 4px)", transform: `translateX(${view === "all" ? 0 : 100}%)`, left: "4px", background: "linear-gradient(to bottom, #ffffff, #f8fafc)", boxShadow: "0 2px 10px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,1)", border: "1px solid rgba(255,255,255,0.5)" }} />
              <button onClick={() => switchView("all")} className={`flex-1 py-2.5 text-[13px] font-bold relative z-10 transition-colors duration-300 rounded-2xl ${view === "all" ? "text-slate-900" : "text-slate-500"}`}>全部</button>
              <button onClick={() => switchView("calendar")} className={`flex-1 py-2.5 text-[13px] font-bold relative z-10 transition-colors duration-300 rounded-2xl ${view === "calendar" ? "text-slate-900" : "text-slate-500"}`}>日历</button>
            </div>

            {view === "all" && (
              <AllView 
                allHoldings={allHoldings} 
                allProducts={allProducts}
                navHistory={navHistory} 
                transactions={transactions} 
                globalStats={globalStats} 
                privacy={privacy} 
                onSwipeLeft={() => switchView("calendar")} 
              />
            )}
            
            {view === "calendar" && (
              <div 
                className="min-h-[75vh]"
                onTouchStart={handleCalendarTouchStart}
                onTouchEnd={handleCalendarTouchEnd}
              >
                {/* ★ 核心：把已经拉取好的数据直接传进去 */}
                <CalendarView 
                  allHoldings={allHoldings} 
                  navHistory={navHistory} 
                  globalStats={globalStats}
                />
              </div>
            )}
          </>
        )}
      </div>

      <button onClick={() => setShowAddModal(true)} className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-xl shadow-purple-500/30 active:scale-90 transition-all duration-300" style={{ bottom: "calc(100px + env(safe-area-inset-bottom))", right: "20px", opacity: hideFab ? 0 : 1, transform: hideFab ? "translateY(20px)" : "translateY(0)", pointerEvents: hideFab ? "none" : "auto" }}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      </button>
      
      {showAddModal && (
        <div className="fixed inset-0 z-[200] bg-white overflow-y-auto">
          <AddModal onClose={() => { setShowAddModal(false); window.location.href = "/"; }} />
        </div>
      )}
    </div>
  );
}