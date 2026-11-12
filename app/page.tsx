"use client";

import { useState, useEffect, useLayoutEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabase";
import { getHoldingMarketValue } from "../lib/holdings";
import AssetCard from "./components/AssetCard";

// ★ 核心优化：按需懒加载列表、日历、监控，不阻塞首页第一屏渲染
const AllView = dynamic(() => import("./components/AllView"), { 
  ssr: false,
  loading: () => <div className="h-64 flex items-center justify-center text-slate-400 text-sm animate-pulse">正在加载持仓列表...</div>
});
const CalendarView = dynamic(() => import("./components/CalendarView"), { ssr: false });
const MonitorPanel = dynamic(() => import("./components/MonitorPanel"), { ssr: false });
const AddModal = dynamic(() => import("./components/AddModal"), { ssr: false });

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type View = "calendar" | "all" | "monitor";

export default function HomePage() {
  const [allHoldings, setAllHoldings] = useState<any[]>([]);
  const [navHistory, setNavHistory] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(false);
  const [nowStr, setNowStr] = useState("");
  const [view, setView] = useState<View>("all");
  const [hideFab, setHideFab] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const d = new Date();
    setNowStr(`${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    
    const onScroll = () => setHideFab(window.scrollY > 150);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("view");
      if (v === "monitor" || v === "calendar" || v === "all") setView(v as View);
    }
  }, []);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) { 
      setLoading(false); 
      return; 
    }
    
    async function fetchData() {
      try {
        const { data, error } = await supabase.from("user_holdings")
          .select("id, holding_amount, in_transit_amount, purchase_amount, shares, hold_date, closed_at, closed_amount, status, products(id, name, bank, category, unit_nav, nav_date)")
          .eq("user_id", userId).in("status", ["active", "closed"]);
        
        if (error) throw error;
        if (!data) return;

        setAllHoldings(data);
        setLoading(false); // ★ 核心：拿到持仓后立刻关闭 loading，先渲染资产卡片和 Tab

        // 后台静默拉取历史净值，拉完自动更新盈亏数字
        const activeIds = data.filter((h: any) => h.status === "active").map((h: any) => h.products?.id).filter(Boolean);
        if (activeIds.length > 0) {
          const allGrouped: Record<number, {nav: number, date: string}[]> = {};
          await Promise.all(activeIds.map(async (id: number) => {
            const { data: navData } = await supabase.from("nav_history").select("nav_date, unit_nav").eq("product_id", id).gte("nav_date", daysAgoStr(400)).order("nav_date", { ascending: true });
            if (navData && navData.length > 0) {
              allGrouped[id] = navData.map((r: any) => ({ nav: Number(r.unit_nav), date: r.nav_date }));
            }
          }));
          setNavHistory(allGrouped);
        }
      } catch (err) {
        console.error("加载数据失败:", err);
      } finally {
        // ★ 绝对兜底：不管成功还是报错，都要关掉 loading
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  function switchView(v: View) {
    setView(v);
    if (typeof window !== "undefined") window.history.replaceState(null, "", v === "all" ? "/" : `/?view=${v}`);
  }

  const holdings = useMemo(() => allHoldings.filter(h => h.status === "active"), [allHoldings]);

  const globalStats = useMemo(() => {
    if (loading) return { totalAssets: 0, totalHolding: 0, totalInTransit: 0, totalProfitToday: 0, totalProfitCumulative: 0, monthProfit: 0, todayWanfen: 0, totalRate: 0, monthAnnual: 0, latestNavDateStr: "" };
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
        if (p.nav_date === latestNavDateStr) totalProfitToday += shares * (navs[navs.length - 1].nav - navs[navs.length - 2].nav);
        for (let i = 1; i < navs.length; i++) { if (navs[i].date >= monthStart) monthProfit += shares * (navs[i].nav - navs[i - 1].nav); }
      }
    });

    return {
      totalAssets: totalHolding + totalInTransit, totalHolding, totalInTransit, totalProfitToday, totalProfitCumulative, monthProfit,
      todayWanfen: totalHolding > 0 ? (totalProfitToday / totalHolding) * 10000 : 0,
      totalRate: totalHolding - totalProfitCumulative > 0 ? (totalProfitCumulative / (totalHolding - totalProfitCumulative)) * 100 : 0,
      monthAnnual: totalHolding > 0 && d.getDate() > 0 ? (monthProfit / totalHolding) * (365 / d.getDate()) * 100 : 0,
      latestNavDateStr
    };
  }, [holdings, navHistory, loading]);

  return (
    <div className="min-h-screen pb-24 bg-slate-50">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">理财助手</div>
            <div className="text-[12px] text-slate-400 mt-0.5">{nowStr}</div>
          </div>
          <button onClick={() => setPrivacy(p => !p)} className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center active:scale-90 transition-all shadow-sm">
            {privacy ? <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" /></svg> : <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
        </div>

        {loading ? (
          <div className="w-full h-[190px] rounded-[24px] bg-slate-200/60 animate-pulse mb-5" />
        ) : (
          <>
            {holdings.length > 0 && <AssetCard stats={globalStats} privacy={privacy} />}

            <div 
              className="relative flex p-1.5 rounded-[22px] mb-6 overflow-hidden border border-white/60"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 100%)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                boxShadow: "0 8px 32px rgba(31, 38, 135, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.8)"
              }}
            >
              <div 
                className="absolute top-1.5 bottom-1.5 rounded-2xl transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]" 
                style={{ 
                  width: "calc(33.33% - 4px)", 
                  transform: `translateX(${view === "calendar" ? 0 : view === "all" ? 100 : 200}%)`, 
                  left: "4px",
                  background: "linear-gradient(to bottom, #ffffff, #f8fafc)",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,1)",
                  border: "1px solid rgba(255,255,255,0.5)"
                }} 
              />
              <button onClick={() => switchView("calendar")} className={`flex-1 py-2.5 text-[13px] font-bold relative z-10 transition-colors duration-300 rounded-2xl ${view === "calendar" ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>日历</button>
              <button onClick={() => switchView("all")} className={`flex-1 py-2.5 text-[13px] font-bold relative z-10 transition-colors duration-300 rounded-2xl ${view === "all" ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>全部</button>
              <button onClick={() => switchView("monitor")} className={`flex-1 py-2.5 text-[13px] font-bold relative z-10 transition-colors duration-300 rounded-2xl ${view === "monitor" ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>监控</button>
            </div>

            {view === "calendar" && <CalendarView />}
            {view === "all" && <AllView allHoldings={allHoldings} navHistory={navHistory} globalStats={globalStats} privacy={privacy} />}
            {view === "monitor" && <MonitorPanel />}
          </>
        )}
      </div>

      <button 
        onClick={() => setShowAddModal(true)} 
        className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-xl shadow-purple-500/30 active:scale-90 transition-all duration-300" 
        style={{ 
          bottom: "calc(100px + env(safe-area-inset-bottom))", 
          right: "20px",
          opacity: hideFab ? 0 : 1, 
          transform: hideFab ? "translateY(20px)" : "translateY(0)", 
          pointerEvents: hideFab ? "none" : "auto" 
        }}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      </button>
      
      {showAddModal && (
        <div className="fixed inset-0 z-[200] bg-white overflow-y-auto">
          <AddModal onClose={() => { setShowAddModal(false); window.location.reload(); }} />
        </div>
      )}
    </div>
  );
}