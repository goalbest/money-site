"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { getBankInfo } from "../../lib/banks";
import { getHoldingMarketValue } from "../../lib/holdings";

const HOLD_SORTS = [
  { key: "value", label: "市值" },
  { key: "today", label: "今日" },
  { key: "wanfen", label: "万收" },
  { key: "annual", label: "年化" },
  { key: "days", label: "天数" },
];
const WATCH_SORTS = [
  { key: "wanfen", label: "万收" },
  { key: "annual", label: "年化" },
];

const ANNUAL_PERIODS = [
  { key: "7d", label: "7天" }, { key: "14d", label: "14天" }, { key: "1m", label: "1月" },
  { key: "3m", label: "3月" }, { key: "6m", label: "6月" }, { key: "1y", label: "1年" }, { key: "all", label: "成立" },
];
const STATUS_TABS = [
  { key: "hold", label: "持仓" }, { key: "watch", label: "关注" }, { key: "closed", label: "清仓" },
];

function daysHeld(holdDate?: string | null): number {
  if (!holdDate) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(holdDate).getTime()) / (1000 * 60 * 60 * 24)));
}

function calcAnnualizedFromNav(navs: any[], period: string) {
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
    const days = Math.max(1, (latestDate.getTime() - new Date(sorted[0].date).getTime()) / 86400000);
    return ((latest.nav / sorted[0].nav - 1) / days) * 365 * 100;
  }
  let closestNav = sorted[0];
  let minDiff = Infinity;
  for (const item of sorted) {
    const diff = Math.abs(new Date(item.date).getTime() - targetDate.getTime());
    if (diff < minDiff) { minDiff = diff; closestNav = item; }
  }
  const actualDays = Math.max(1, (latestDate.getTime() - new Date(closestNav.date).getTime()) / 86400000);
  return (((latest.nav / closestNav.nav) - 1) / actualDays) * 365 * 100;
}

export default function AllView({ 
  allHoldings, navHistory, transactions = [], globalStats, privacy 
}: { 
  allHoldings: any[], navHistory: any, transactions?: any[], globalStats: any, privacy: boolean 
}) {
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("all_view_tab") || "hold";
    return "hold";
  });
  const [bankFilter, setBankFilter] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("all_view_bank") || "全部";
    return "全部";
  });
  const [sortKey, setSortKey] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("all_view_sort") || "annual";
    return "annual";
  });
  const [annualPeriod, setAnnualPeriod] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("all_view_period") || "1m";
    return "1m";
  });

  const [sortDesc, setSortDesc] = useState(true);
  
  const [pageMap, setPageMap] = useState<Record<string, number>>({});
  const [watchList, setWatchList] = useState<Set<number>>(new Set());
  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;

  useEffect(() => {
    if (statusFilter === "hold") {
      setSortKey(sessionStorage.getItem("all_view_sort_hold") || "annual");
    } else if (statusFilter === "watch") {
      setSortKey(sessionStorage.getItem("all_view_sort_watch") || "wanfen");
    } else if (statusFilter === "closed") {
      setSortKey("sell_date");
    }
    setPageMap({});
  }, [statusFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("all_view_tab", statusFilter);
      if (statusFilter === "hold") sessionStorage.setItem("all_view_sort_hold", sortKey);
      if (statusFilter === "watch") sessionStorage.setItem("all_view_sort_watch", sortKey);
    }
  }, [statusFilter, sortKey]);

  useEffect(() => {
    if (typeof window !== "undefined") sessionStorage.setItem("all_view_bank", bankFilter);
  }, [bankFilter]);
  useEffect(() => {
    if (typeof window !== "undefined") sessionStorage.setItem("all_view_period", annualPeriod);
  }, [annualPeriod]);

  useEffect(() => {
    setPageMap({});
  }, [bankFilter, sortKey, sortDesc, annualPeriod]);

  useEffect(() => {
    if (!userId) return;
    supabase.from("user_watchlist").select("product_id").eq("user_id", userId).then(({ data, error }) => {
      if (!error && data) {
        setWatchList(new Set(data.map(d => Number(d.product_id))));
      }
    });
  }, [userId]);

  async function toggleWatch(productId: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!userId) return;

    const isWatched = watchList.has(productId);
    const newWatchList = new Set(watchList);
    
    if (isWatched) {
      newWatchList.delete(productId);
      setWatchList(newWatchList);
      await supabase.from("user_watchlist").delete().eq("user_id", userId).eq("product_id", productId);
    } else {
      newWatchList.add(productId);
      setWatchList(newWatchList);
      await supabase.from("user_watchlist").insert({ user_id: userId, product_id: productId });
    }
  }

  const holdings = useMemo(() => allHoldings.filter(h => h.status === "active"), [allHoldings]);
  const closedHoldings = useMemo(() => allHoldings.filter(h => h.status === "closed"), [allHoldings]);

  const groupSummary = useMemo(() => {
    let filtered: any[] = [];
    
    if (statusFilter === "hold") {
      filtered = holdings;
    } else if (statusFilter === "closed") {
      filtered = closedHoldings; 
    } else if (statusFilter === "watch") {
      filtered = holdings.filter(h => h.products && watchList.has(Number(h.products.id)));
    } else {
      return [];
    }

    if (bankFilter !== "全部") filtered = filtered.filter(h => (h.products?.bank || "其他") === bankFilter);

    const sortedItems = [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "value") {
        diff = getHoldingMarketValue(b) - getHoldingMarketValue(a);
      } else if (sortKey === "today") {
        const navsA = navHistory[a.products?.id] || []; const navsB = navHistory[b.products?.id] || [];
        diff = (navsB.length >= 2 ? b.shares * (navsB[navsB.length-1].nav - navsB[navsB.length-2].nav) : 0) - 
               (navsA.length >= 2 ? a.shares * (navsA[navsA.length-1].nav - navsA[navsA.length-2].nav) : 0);
      } else if (sortKey === "wanfen") {
        const navsA = navHistory[a.products?.id] || []; const navsB = navHistory[b.products?.id] || [];
        const wanfenA = navsA.length >= 2 ? (navsA[navsA.length-1].nav - navsA[navsA.length-2].nav) * 10000 : 0;
        const wanfenB = navsB.length >= 2 ? (navsB[navsB.length-1].nav - navsB[navsB.length-2].nav) * 10000 : 0;
        diff = wanfenB - wanfenA;
      } else if (sortKey === "annual") {
        diff = calcAnnualizedFromNav(navHistory[b.products?.id] || [], annualPeriod) - calcAnnualizedFromNav(navHistory[a.products?.id] || [], annualPeriod);
      } else if (sortKey === "days") {
        diff = daysHeld(b.hold_date) - daysHeld(a.hold_date);
      } else if (sortKey === "sell_date") {
        const getSellDate = (h: any) => {
          if (h.status !== "closed") return h.hold_date || "";
          const pTxs = transactions.filter((t: any) => t.product_id === h.products?.id && (t.type === "sell" || t.type === "close"));
          if (pTxs.length > 0) {
            pTxs.sort((x: any, y: any) => new Date(y.trade_date).getTime() - new Date(x.trade_date).getTime());
            return pTxs[0].trade_date;
          }
          return h.closed_at || h.hold_date || "";
        };
        const dateA = getSellDate(a);
        const dateB = getSellDate(b);
        diff = new Date(dateB).getTime() - new Date(dateA).getTime();
      }
      return sortDesc ? diff : -diff;
    });

    const grouped: Record<string, any[]> = {};
    sortedItems.forEach(h => {
      const key = h.products?.bank || "其他";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(h);
    });

    const ITEMS_PER_PAGE = 8;
    return Object.entries(grouped).map(([bank, items]) => {
      const totalItems = items.length;
      const total = items.reduce((s, h) => s + getHoldingMarketValue(h), 0);
      const percent = globalStats.totalHolding > 0 ? (total / globalStats.totalHolding) * 100 : 0;
      
      const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
      const currentPage = pageMap[bank] || 1;
      const paginatedItems = items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

      return { 
        bank, 
        items: paginatedItems, 
        totalItems,
        totalCount: totalItems, 
        total, 
        percent,
        totalPages,
        currentPage
      };
    }).sort((a, b) => b.total - a.total);

  }, [holdings, closedHoldings, statusFilter, watchList, bankFilter, sortKey, sortDesc, navHistory, annualPeriod, globalStats.totalHolding, pageMap, transactions]);

  function fmtProfit(n: number) { return privacy ? "••" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}`; }
  function fmtPercent(n: number) { return privacy ? "••" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }
  
  const periodLabel = ANNUAL_PERIODS.find(x => x.key === annualPeriod)?.label || "1月";
  const activeSubTabIndex = STATUS_TABS.findIndex(t => t.key === statusFilter);

  const handlePageChange = (bank: string, newPage: number) => {
    setPageMap(prev => ({ ...prev, [bank]: newPage }));
  };

  const currentSorts = statusFilter === "hold" ? HOLD_SORTS : statusFilter === "watch" ? WATCH_SORTS : [];

  return (
    <div className="animate-fade-in space-y-4">
      {/* Tabs */}
      <div className="relative flex bg-slate-100/60 p-1 rounded-full mb-4 shadow-sm border border-slate-200/50">
        <div 
          className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300 ease-out" 
          style={{ width: "calc(33.33% - 2px)", transform: `translateX(${activeSubTabIndex * 100}%)`, left: "4px" }} 
        />
        {STATUS_TABS.map(t => {
          const isActive = statusFilter === t.key;
          return (
            <button 
              key={t.key} 
              onClick={() => setStatusFilter(t.key)} 
              className={`flex-1 py-1.5 text-[13px] rounded-full relative z-10 transition-colors duration-300 ${
                isActive ? "text-slate-900 font-bold" : "text-slate-500 font-medium hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 排序工具栏 */}
      {currentSorts.length > 0 && (
        <div className="px-1 mt-4">
          <div className="segment-group flex">
            {currentSorts.map(s => (
              <button key={s.key} onClick={() => { if (sortKey === s.key) setSortDesc(!sortDesc); else { setSortKey(s.key); setSortDesc(true); } }}
                className={`flex-1 py-2 text-[12px] segment-item flex items-center justify-center gap-1 ${sortKey === s.key ? "segment-item-active" : "hover:text-slate-700"}`}>
                {s.label}
                {sortKey === s.key && <svg className={`w-3 h-3 transition-transform ${sortDesc ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>}
              </button>
            ))}
          </div>
          {sortKey === "annual" && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mt-2 bg-slate-50/80 p-1 rounded-xl">
              {ANNUAL_PERIODS.map(p => (
                <button key={p.key} onClick={() => setAnnualPeriod(p.key)} className={`flex-1 py-1.5 px-3 rounded-lg text-[11px] font-medium transition-all ${annualPeriod === p.key ? "bg-white text-purple-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4 mt-4">
        {groupSummary.length === 0 ? (
          <div className="card p-12 text-center text-slate-300 text-xs">暂无数据</div>
        ) : (
          groupSummary.map((group, gi) => {
            const info = getBankInfo(group.bank);
            return (
              <div key={group.bank} className="card overflow-hidden" style={{ animationDelay: `${0.06 * (gi + 1)}s` }}>
                {/* ★ 图二的头部卡片：包含了银行、产品数、占比、金额 */}
                <div className="flex items-stretch">
                  <div className="w-1" style={{ background: info.bar }} />
                  <div className="flex-1 px-5 py-4 bg-slate-50/60 border-b divider">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="bank-avatar" style={{ background: info.bg, color: info.color }}>{info.label}</span>
                        <div>
                          <div className="text-[13px] font-semibold text-slate-900 leading-tight">{group.bank}</div>
                          <div className="text-[11px] text-slate-400 leading-tight mt-0.5">{group.totalCount} 个产品 · 占比 {group.percent.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-mono font-bold text-slate-900 tabular">{privacy ? "••••" : group.total.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${group.percent}%`, background: info.bar }} />
                    </div>
                  </div>
                </div>

                <div>
                  {group.items.map((h: any, hi: number) => {
                    const p = h.products;
                    if (!p) return null;
                    const isClosed = statusFilter === "closed";
                    const allNavs = navHistory[p.id] || [];
                    const wanfen = allNavs.length >= 2 ? (allNavs[allNavs.length-1].nav - allNavs[allNavs.length-2].nav) * 10000 : 0;
                    const isWatched = watchList.has(Number(p.id));

                    let batches: any[] = [];
                    let totalProfit = 0;
                    let totalPurchaseAmount = 0;
                    
                    if (isClosed) {
                      const productTxs = transactions.filter((t: any) => t.product_id === p.id).sort((a:any,b:any) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
                      const buyTxs = productTxs.filter((t: any) => t.type === "buy");
                      const sellTxs = productTxs.filter((t: any) => t.type === "sell" || t.type === "close");
                      
                      const lastSellDate = sellTxs.length > 0 ? sellTxs[sellTxs.length - 1].trade_date : h.closed_at;
                      const totalSoldAmount = Number(h.closed_amount || 0) || sellTxs.reduce((sum:number, t:any)=> sum + Number(t.amount), 0);
                      totalPurchaseAmount = buyTxs.reduce((sum:number, t:any) => sum + Number(t.amount), 0);
                      const totalBuyShares = buyTxs.reduce((sum:number, t:any) => sum + Number(t.shares), 0);

                      if (buyTxs.length > 0) {
                        batches = buyTxs.map((bt: any, idx: number) => {
                          const batchShares = Number(bt.shares);
                          const batchAmount = Number(bt.amount);
                          
                          let batchSellAmount = 0;
                          if (totalBuyShares > 0 && batchShares > 0) {
                              batchSellAmount = (batchShares / totalBuyShares) * totalSoldAmount;
                          } else if (totalPurchaseAmount > 0) {
                              batchSellAmount = (batchAmount / totalPurchaseAmount) * totalSoldAmount;
                          }

                          const batchProfit = batchSellAmount - batchAmount;
                          totalProfit += batchProfit;
                          
                          const buyDateObj = new Date(bt.trade_date);
                          const sellDateObj = lastSellDate ? new Date(lastSellDate) : new Date();
                          const batchDays = Math.max(1, Math.floor((sellDateObj.getTime() - buyDateObj.getTime()) / (1000 * 60 * 60 * 24)));
                          const batchAnnualized = batchAmount > 0 ? (batchProfit / batchAmount) * (365 / batchDays) * 100 : 0;

                          return {
                            id: bt.id,
                            index: idx + 1,
                            amount: batchAmount,
                            profit: batchProfit,
                            days: batchDays,
                            annualized: batchAnnualized,
                            date: bt.trade_date,
                          };
                        });
                      } else {
                        totalPurchaseAmount = Number(h.purchase_amount || 0);
                        totalProfit = Number(h.closed_amount || 0) - totalPurchaseAmount;
                        batches = [{
                          id: h.id, index: 1, amount: totalPurchaseAmount, 
                          profit: totalProfit, days: daysHeld(h.hold_date), annualized: 0, date: h.hold_date
                        }];
                      }
                    }

                    const CardHeader = () => (
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 flex items-center gap-1.5 min-w-0 pr-4">
                          <div className="text-[14px] text-slate-900 font-medium leading-snug truncate">
                            {p.name}
                          </div>
                          {isClosed && batches.length > 0 && (
                            <span className="flex-shrink-0 bg-slate-100 text-slate-500 text-[9px] px-1.5 py-0.5 rounded font-medium">
                              {batches.length}次
                            </span>
                          )}
                        </div>
                        {!isClosed && (
                          <button onClick={(e) => toggleWatch(Number(p.id), e)} className="p-1 -mt-1 -mr-1 text-slate-300 hover:text-amber-400 transition-colors">
                            <svg className={`w-5 h-5 ${isWatched ? "fill-amber-400 text-amber-400" : "fill-transparent"}`} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                          </button>
                        )}
                      </div>
                    );

                    if (!isClosed || batches.length <= 1) {
                       const hold = getHoldingMarketValue(h);
                       const today = allNavs.length >= 2 ? Number(h.shares||0) * (allNavs[allNavs.length-1].nav - allNavs[allNavs.length-2].nav) : 0;
                       const annual = calcAnnualizedFromNav(allNavs, annualPeriod);
                       
                       let displayPurchaseAmount = Number(h.purchase_amount || 0);
                       let displayProfit = Number(h.closed_amount || 0) - displayPurchaseAmount;
                       let displayDays = daysHeld(h.hold_date);
                       let displayAnnualized = 0;
                       
                       if (isClosed && batches.length === 1) {
                         displayPurchaseAmount = batches[0].amount;
                         displayProfit = batches[0].profit;
                         displayDays = batches[0].days;
                         displayAnnualized = batches[0].annualized;
                       }

                       const gridCols = isClosed ? "grid-cols-[1.2fr_1fr_1.2fr_1fr_0.8fr]" : "grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr]";

                       return (
                         <Link key={h.id} href={`/product/${p.id}`} className="block px-5 py-4 border-b divider last:border-b-0 hover:bg-slate-50 transition-colors">
                           <CardHeader />
                           <div className={`grid ${gridCols} gap-1`}>
                             <div>
                               <div className="text-[10px] text-slate-400 mb-1">{isClosed ? "本金" : "市值"}</div>
                               <div className="font-mono font-bold text-[14px] text-slate-900 truncate">
                                 {privacy ? "••••" : (isClosed ? displayPurchaseAmount : hold).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                               </div>
                             </div>
                             
                             {!isClosed && (
                               <div className="text-right">
                                 <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-end gap-1">
                                   今日
                                   {p.nav_date && <span className="text-[10px] text-amber-500 font-medium font-mono">{String(p.nav_date).slice(5)}</span>}
                                 </div>
                                 <div className={`font-mono font-semibold text-[14px] ${today > 0 ? "text-rose-500" : today < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                                   {(today >= 0 ? "+" : "") + (privacy ? "••" : today.toFixed(2))}
                                 </div>
                               </div>
                             )}

                             <div className="text-right">
                               <div className="text-[10px] text-slate-400 mb-1 truncate">万收</div>
                               <div className={`font-mono font-semibold text-[14px] ${wanfen > 0 ? "text-rose-500" : wanfen < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                                 {allNavs.length < 2 ? "-" : (wanfen >= 0 ? "+" : "") + wanfen.toFixed(2)}
                               </div>
                             </div>

                             <div className="text-right">
                               <div className="text-[10px] text-slate-400 mb-1 truncate">{isClosed ? "累计收益" : `年化(${periodLabel})`}</div>
                               <div className={`font-mono font-semibold text-[14px] ${isClosed ? (displayProfit > 0 ? "text-rose-500" : "text-emerald-500") : annual > 0 ? "text-rose-500" : annual < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                                 {isClosed ? fmtProfit(displayProfit) : (annual > 0 ? "+" : "") + annual.toFixed(2) + "%"}
                               </div>
                             </div>

                             {isClosed && (
                               <div className="text-right">
                                 <div className="text-[10px] text-slate-400 mb-1 truncate">年化</div>
                                 <div className={`font-mono font-semibold text-[14px] ${displayAnnualized > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                                   {fmtPercent(displayAnnualized)}
                                 </div>
                               </div>
                             )}

                             <div className="text-right">
                               <div className="text-[10px] text-slate-400 mb-1">天数</div>
                               <div className="font-mono font-medium text-[12px] text-slate-500 mt-0.5">{displayDays}天</div>
                             </div>
                           </div>
                         </Link>
                       );
                    }

                    return (
                      <div key={h.id} className="border-b divider last:border-b-0 bg-white">
                        <Link href={`/product/${p.id}`} className="block px-5 pt-4 pb-3 hover:bg-slate-50 transition-colors">
                          <CardHeader />
                          <div className="flex justify-between items-center text-[11px] mb-1">
                             <div className="text-slate-400">
                               本金 {privacy ? "••••" : totalPurchaseAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                             </div>
                             <div className="flex items-center gap-4">
                               <div className="flex items-center gap-1 justify-end">
                                 <span className="text-slate-400 whitespace-nowrap">累计收益</span>
                                 <span className={`font-mono font-semibold ${totalProfit > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                                   {fmtProfit(totalProfit)}
                                 </span>
                               </div>
                               <div className="flex items-center gap-1 justify-end">
                                 <span className="text-slate-400 whitespace-nowrap">万收</span>
                                 <span className={`font-mono font-semibold ${wanfen > 0 ? "text-rose-500" : wanfen < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                                   {allNavs.length < 2 ? "-" : (wanfen >= 0 ? "+" : "") + wanfen.toFixed(2)}
                                 </span>
                               </div>
                             </div>
                          </div>
                        </Link>
                        
                        <div className="bg-slate-50/50">
                          {batches.map((b) => (
                            <div key={b.id} className="px-5 py-3 border-t border-slate-100/60 flex flex-col gap-1.5">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <span className="bg-slate-200/70 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-medium">第{b.index}次</span>
                                  <span className="text-[11px] text-slate-400 font-mono">{b.date}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr] gap-1">
                                <div>
                                  <div className="text-[10px] text-slate-400 mb-0.5">本金</div>
                                  <div className="font-mono font-bold text-[13px] text-slate-700">
                                    {privacy ? "••••" : b.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-slate-400 mb-0.5">收益</div>
                                  <div className={`font-mono font-bold text-[13px] ${b.profit > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                                    {privacy ? "••" : `${b.profit >= 0 ? "+" : ""}${b.profit.toFixed(2)}`}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-slate-400 mb-0.5">年化</div>
                                  <div className={`font-mono font-bold text-[13px] ${b.annualized > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                                    {privacy ? "••" : `${b.annualized >= 0 ? "+" : ""}${b.annualized.toFixed(2)}%`}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-slate-400 mb-0.5">天数</div>
                                  <div className="font-mono font-medium text-[12px] text-slate-500 mt-0.5">{b.days}天</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {group.totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 bg-white border-t border-slate-100">
                    <button onClick={() => handlePageChange(group.bank, group.currentPage - 1)} disabled={group.currentPage === 1} className="px-4 py-1.5 text-[12px] font-medium bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40">上一页</button>
                    <span className="text-[12px] text-slate-500">第 <span className="text-purple-600 font-bold mx-0.5">{group.currentPage}</span> / {group.totalPages} 页</span>
                    <button onClick={() => handlePageChange(group.bank, group.currentPage + 1)} disabled={group.currentPage === group.totalPages} className="px-4 py-1.5 text-[12px] font-medium bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40">下一页</button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}