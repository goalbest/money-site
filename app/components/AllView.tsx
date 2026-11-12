"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { getBankInfo } from "../../lib/banks";
import { getHoldingMarketValue } from "../../lib/holdings";

const SORTS = [
  { key: "value", label: "市值" },
  { key: "today", label: "今日" },
  { key: "wanfen", label: "万收" },
  { key: "annual", label: "年化" },
  { key: "days", label: "天数" },
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
  allHoldings, navHistory, globalStats, privacy 
}: { 
  allHoldings: any[], navHistory: any, globalStats: any, privacy: boolean 
}) {
  const [statusFilter, setStatusFilter] = useState("hold");
  const [bankFilter, setBankFilter] = useState("全部");
  const [sortKey, setSortKey] = useState("annual");
  const [sortDesc, setSortDesc] = useState(true);
  const [annualPeriod, setAnnualPeriod] = useState("1m");
  
  const [pageMap, setPageMap] = useState<Record<string, number>>({});
  const [watchList, setWatchList] = useState<Set<number>>(new Set());
  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;

  useEffect(() => {
    setPageMap({});
  }, [statusFilter, bankFilter, sortKey, sortDesc, annualPeriod]);

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

  const bankStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    let total = 0;
    holdings.forEach(h => {
      const amount = Number(h.holding_amount || 0);
      const bank = h.products?.bank || "其他";
      if (!map.has(bank)) map.set(bank, { count: 0, amount: 0 });
      const curr = map.get(bank)!;
      curr.count += 1;
      curr.amount += amount;
      total += amount;
    });
    return Array.from(map.entries()).map(([bank, data]) => ({
      bank, count: data.count, amount: data.amount,
      percent: total > 0 ? (data.amount / total) * 100 : 0,
    })).sort((a, b) => b.amount - a.amount);
  }, [holdings]);

  const groupSummary = useMemo(() => {
    let filtered = [];
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

  }, [holdings, closedHoldings, statusFilter, watchList, bankFilter, sortKey, sortDesc, navHistory, annualPeriod, globalStats.totalHolding, pageMap]);

  function fmtProfit(n: number) { return privacy ? "••" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}`; }
  
  const periodLabel = ANNUAL_PERIODS.find(x => x.key === annualPeriod)?.label || "1月";
  const activeSubTabIndex = STATUS_TABS.findIndex(t => t.key === statusFilter);

  const handlePageChange = (bank: string, newPage: number) => {
    setPageMap(prev => ({ ...prev, [bank]: newPage }));
  };

  return (
    <div className="animate-fade-in space-y-4">
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

      {statusFilter === "hold" && holdings.length > 0 && (
        <div className="card p-5 animate-fade-in-up">
          <div className="text-[14px] font-bold text-slate-900 mb-4">持仓分布</div>
          <div className="flex h-2.5 rounded-full overflow-hidden mb-4 bg-slate-100">
            {bankStats.map((b) => (
              <div key={b.bank} style={{ width: `${b.percent}%`, background: getBankInfo(b.bank).bar }} className="h-full" />
            ))}
          </div>
          <div className="space-y-2 mb-5">
            {bankStats.map((b) => {
              const info = getBankInfo(b.bank);
              return (
                <div key={b.bank} className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <span className="w-2 h-2 rounded-full" style={{ background: info.bar }} />
                    {b.bank}
                  </div>
                  <div className="flex items-center gap-6 tabular">
                    <span className="text-slate-400 font-mono text-[11px]">{b.percent.toFixed(1)}%</span>
                    <span className="font-mono font-bold text-slate-900 w-24 text-right">
                      {privacy ? "••••" : b.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100">
            <button 
              onClick={() => setBankFilter("全部")} 
              className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-all shrink-0 ${
                bankFilter === "全部" ? "bg-purple-600 text-white shadow-md shadow-purple-500/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              全部 <span className="opacity-70 text-[10px] ml-1">{holdings.length}</span>
            </button>
            {bankStats.map(b => (
              <button 
                key={b.bank}
                onClick={() => setBankFilter(b.bank)} 
                className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-all shrink-0 ${
                  bankFilter === b.bank ? "bg-slate-800 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {b.bank} <span className="opacity-50 text-[10px] ml-1">{b.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(statusFilter === "hold" || statusFilter === "watch") && (
        <div className="px-1 mt-4">
          <div className="segment-group flex">
            {SORTS.map(s => (
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
                        <div className="text-[13px] font-mono font-bold text-slate-900 tabular">{privacy ? "••••" : group.total.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</div>
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
                    const hold = getHoldingMarketValue(h);
                    const allNavs = navHistory[p.id] || [];
                    const today = allNavs.length >= 2 ? Number(h.shares||0) * (allNavs[allNavs.length-1].nav - allNavs[allNavs.length-2].nav) : 0;
                    const wanfen = allNavs.length >= 2 ? (allNavs[allNavs.length-1].nav - allNavs[allNavs.length-2].nav) * 10000 : 0;
                    const annual = calcAnnualizedFromNav(allNavs, annualPeriod);
                    const isClosed = statusFilter === "closed";
                    const isWatched = watchList.has(Number(p.id));
                    
                    return (
                      <Link key={h.id} href={`/product/${p.id}`} className="block px-5 py-4 border-b divider last:border-b-0 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div className="text-[14px] text-slate-900 font-medium leading-snug pr-4">
                            {p.name}
                          </div>
                          {!isClosed && (
                            <button 
                              onClick={(e) => toggleWatch(Number(p.id), e)}
                              className="p-1 -mt-1 -mr-1 text-slate-300 hover:text-amber-400 transition-colors"
                            >
                              <svg className={`w-5 h-5 ${isWatched ? "fill-amber-400 text-amber-400" : "fill-transparent"}`} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr] gap-1">
                          <div>
                            <div className="text-[10px] text-slate-400 mb-1">{isClosed ? "卖出金额" : "市值"}</div>
                            <div className="font-mono font-bold text-[14px] text-slate-900 truncate">
                              {privacy ? "••••" : hold.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-end gap-1">
                              今日
                              {!isClosed && p.nav_date && (
                                <span className="text-[10px] text-amber-500 font-medium font-mono">
                                  {String(p.nav_date).slice(5)}
                                </span>
                              )}
                            </div>
                            <div className={`font-mono font-semibold text-[14px] ${today > 0 ? "text-rose-500" : today < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                              {isClosed ? "-" : (today >= 0 ? "+" : "") + (privacy ? "••" : today.toFixed(2))}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 mb-1 truncate">万收</div>
                            <div className={`font-mono font-semibold text-[14px] ${wanfen > 0 ? "text-rose-500" : wanfen < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                              {isClosed || allNavs.length < 2 ? "-" : (wanfen >= 0 ? "+" : "") + wanfen.toFixed(2)}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 mb-1 truncate">{isClosed ? "累计收益" : `年化(${periodLabel})`}</div>
                            <div className={`font-mono font-semibold text-[14px] ${isClosed ? (Number(h.closed_amount||0) > Number(h.purchase_amount||0) ? "text-rose-500" : "text-emerald-500") : annual > 0 ? "text-rose-500" : annual < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                              {isClosed 
                                ? fmtProfit(Number(h.closed_amount || 0) - Number(h.purchase_amount || 0))
                                : (annual > 0 ? "+" : "") + annual.toFixed(2) + "%"}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 mb-1">天数</div>
                            <div className="font-mono font-medium text-[12px] text-slate-500 mt-0.5">
                              {daysHeld(h.hold_date)}天
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {group.totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 bg-white border-t border-slate-100">
                    <button 
                      onClick={() => handlePageChange(group.bank, group.currentPage - 1)}
                      disabled={group.currentPage === 1}
                      className="px-4 py-1.5 text-[12px] font-medium bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm"
                    >
                      上一页
                    </button>
                    <span className="text-[12px] text-slate-500">
                      第 <span className="text-purple-600 font-bold mx-0.5">{group.currentPage}</span> / {group.totalPages} 页
                    </span>
                    <button 
                      onClick={() => handlePageChange(group.bank, group.currentPage + 1)}
                      disabled={group.currentPage === group.totalPages}
                      className="px-4 py-1.5 text-[12px] font-medium bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm"
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
    </div>
  );
}