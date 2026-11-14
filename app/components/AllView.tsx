"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { getHoldingMarketValue } from "../../lib/holdings";
import { getBankInfo } from "../../lib/banks";
import HoldingCard from "./allview/HoldingCard";
import LibraryCard from "./allview/LibraryCard";

const HOLD_SORTS = [
  { key: "value", label: "市值" }, { key: "today", label: "今日" }, { key: "wanfen", label: "万收" },
  { key: "annual", label: "年化" }, { key: "days", label: "天数" },
];
const CLOSED_SORTS = [
  { key: "sellDate", label: "卖出时间" }, { key: "wanfen", label: "万收" }, { key: "annual", label: "年化" },
];
const LIB_SORTS = [
  { key: "new", label: "最新加入" }, { key: "wanfen", label: "万收" }, { key: "annual", label: "年化" },
];

const ANNUAL_PERIODS = [
  { key: "7d", label: "7天" }, { key: "14d", label: "14天" }, { key: "1m", label: "1月" },
  { key: "3m", label: "3月" }, { key: "6m", label: "6月" }, { key: "1y", label: "1年" }, { key: "all", label: "成立" },
];

const STATUS_TABS = [
  { key: "hold", label: "持仓" }, { key: "closed", label: "清仓" }, 
  { key: "watch", label: "关注" }, { key: "all", label: "产品库" },
];

const PAGE_SIZE = 8;

export default function AllView({ 
  allHoldings, allProducts = [], navHistory, transactions = [], globalStats, privacy, onSwipeLeft
}: any) {
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("all_view_tab") || "hold";
    return "hold";
  });

  const [sortKey, setSortKey] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("all_view_sort_key");
      if (saved) return saved;
    }
    return "annual";
  });

  const [sortDesc, setSortDesc] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("all_view_sort_desc");
      if (saved) return saved === "true";
    }
    return true;
  });

  const [annualPeriod, setAnnualPeriod] = useState("1m");
  const [pageMap, setPageMap] = useState<Record<string, number>>({});
  const [globalPage, setGlobalPage] = useState(1);
  const [watchList, setWatchList] = useState<Set<number>>(new Set());
  const [mounted, setMounted] = useState(false);

  const touchStartRef = useRef<{ x: number, y: number } | null>(null);
  const hasRestoredScroll = useRef(false);
  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;

  useEffect(() => { sessionStorage.setItem("all_view_sort_key", sortKey); }, [sortKey]);
  useEffect(() => { sessionStorage.setItem("all_view_sort_desc", String(sortDesc)); }, [sortDesc]);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => { 
      if (hasRestoredScroll.current) sessionStorage.setItem("all_view_scroll", window.scrollY.toString()); 
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    sessionStorage.setItem("all_view_tab", statusFilter);
    setPageMap({});
    setGlobalPage(1);
    
    if (statusFilter === "hold" && !HOLD_SORTS.some(s => s.key === sortKey)) setSortKey("annual");
    else if (statusFilter === "closed" && !CLOSED_SORTS.some(s => s.key === sortKey)) setSortKey("sellDate");
    else if ((statusFilter === "watch" || statusFilter === "all") && !LIB_SORTS.some(s => s.key === sortKey)) setSortKey("new");
  }, [statusFilter]);

  const holdings = useMemo(() => allHoldings.filter((h: any) => h.status === "active"), [allHoldings]);

  const getRealSellDate = (productId: number) => {
    const txs = transactions.filter((t: any) => t.product_id === productId && (t.type === "sell" || t.type === "close"));
    if (txs.length > 0) {
      txs.sort((x: any, y: any) => new Date(y.trade_date).getTime() - new Date(x.trade_date).getTime());
      return txs[0].trade_date;
    }
    return "";
  };

  const groupedSummary = useMemo(() => {
    if (statusFilter !== "hold") return [];
    let filtered = holdings;

    const sortedItems = [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "value") {
        diff = getHoldingMarketValue(b) - getHoldingMarketValue(a);
      } else if (sortKey === "days") {
        diff = new Date(b.hold_date || 0).getTime() - new Date(a.hold_date || 0).getTime();
      } else if (sortKey === "today") {
        const calcToday = (h: any) => {
          const navs = navHistory[h.products?.id] || [];
          if (navs.length < 2 || h.products?.nav_date !== globalStats.latestNavDateStr) return 0;
          if (h.hold_date && h.products?.nav_date < h.hold_date) return 0;
          return Number(h.shares || 0) * (navs[navs.length - 1].nav - navs[navs.length - 2].nav);
        };
        diff = calcToday(b) - calcToday(a);
      } else if (sortKey === "wanfen") {
        const calcWanfen = (h: any) => {
          const navs = navHistory[h.products?.id] || [];
          if (navs.length < 2) return 0;
          return (navs[navs.length - 1].nav - navs[navs.length - 2].nav) * 10000;
        };
        diff = calcWanfen(b) - calcWanfen(a);
      } else if (sortKey === "annual") {
        const navsA = navHistory[a.products?.id] || []; const navsB = navHistory[b.products?.id] || [];
        const calc = (navs: any[]) => {
          if (!navs || navs.length < 2) return 0;
          const sorted = [...navs].sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
          const latest = sorted[sorted.length-1]; const prev = sorted[sorted.length-2];
          return ((latest.nav - prev.nav) / prev.nav) * 100;
        };
        diff = calc(navsB) - calc(navsA);
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
      const total = items.reduce((s, h) => s + getHoldingMarketValue(h), 0);
      const percent = globalStats.totalHolding > 0 ? (total / globalStats.totalHolding) * 100 : 0;
      const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
      const currentPage = pageMap[bank] || 1;
      return {
        bank, items: items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
        totalCount: items.length, total, percent, totalPages, currentPage
      };
    }).sort((a, b) => b.total - a.total);
  }, [holdings, statusFilter, sortKey, sortDesc, navHistory, pageMap, globalStats.totalHolding, globalStats.latestNavDateStr]);

  const getClosedTotalAnnualized = (h: any) => {
    const productTxs = transactions.filter((t: any) => t.product_id === h.product_id).sort((a:any,b:any) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
    const buyTxs = productTxs.filter((t: any) => t.type === "buy");
    const sellTxs = productTxs.filter((t: any) => t.type === "sell" || t.type === "close");
    
    if (buyTxs.length === 0) return 0;
    
    const lastSellDate = sellTxs.length > 0 ? sellTxs[sellTxs.length - 1].trade_date : h.closed_at;
    const sellDateObj = lastSellDate ? new Date(lastSellDate) : new Date();
    
    const totalPurchaseAmount = buyTxs.reduce((sum:number, t:any) => sum + Number(t.amount), 0);
    const totalSoldAmount = Number(h.closed_amount || 0) || sellTxs.reduce((sum:number, t:any)=> sum + Number(t.amount), 0);
    const totalProfit = totalSoldAmount - totalPurchaseAmount;

    let totalWeightedPrincipalDays = 0;
    buyTxs.forEach((bt: any) => {
      const buyDateObj = new Date(bt.trade_date);
      const batchDays = Math.max(1, Math.floor((sellDateObj.getTime() - buyDateObj.getTime()) / (1000 * 60 * 60 * 24)));
      totalWeightedPrincipalDays += Number(bt.amount) * batchDays;
    });

    return totalWeightedPrincipalDays > 0 ? (totalProfit / totalWeightedPrincipalDays) * 365 * 100 : 0;
  };

  const flatList = useMemo(() => {
    if (statusFilter !== "closed" && statusFilter !== "watch" && statusFilter !== "all") return [];
    
    let list: any[] = [];
    
    if (statusFilter === "closed") {
      allHoldings.filter((h: any) => h.status === "closed").forEach((h: any) => {
        if (!h.products) return;
        list.push({ 
          id: h.id, product_id: h.products.id, products: h.products, 
          status: h.status, holding_info: h, type: "holding" 
        });
      });
    } else {
      const processedIds = new Set<number>();
      allHoldings.forEach((h: any) => {
        if (!h.products) return;
        processedIds.add(h.products.id);
        list.push({ 
          id: h.id, product_id: h.products.id, products: h.products, 
          status: h.status, holding_info: h, isWatched: watchList.has(h.products.id), type: "library" 
        });
      });
      allProducts.forEach((p: any) => {
        if (!processedIds.has(p.id)) {
          list.push({ 
            id: `lib-${p.id}`, product_id: p.id, products: p, 
            status: "none", holding_info: null, isWatched: watchList.has(p.id), type: "library" 
          });
        }
      });
      if (statusFilter === "watch") {
        list = list.filter(h => h.isWatched);
      }
    }

    return list.sort((a, b) => {
      let diff = 0;
      if (sortKey === "value") diff = getHoldingMarketValue(b) - getHoldingMarketValue(a);
      else if (sortKey === "days") diff = new Date(b.hold_date || 0).getTime() - new Date(a.hold_date || 0).getTime();
      else if (sortKey === "sellDate") {
        const dateA = getRealSellDate(a.product_id);
        const dateB = getRealSellDate(b.product_id);
        diff = new Date(dateB || b.closed_at || 0).getTime() - new Date(dateA || a.closed_at || 0).getTime();
      } else if (sortKey === "today") {
        const calcToday = (h: any) => {
          const navs = navHistory[h.products?.id] || [];
          if (navs.length < 2 || h.products?.nav_date !== globalStats.latestNavDateStr) return 0;
          if (h.hold_date && h.products?.nav_date < h.hold_date) return 0;
          return Number(h.shares || 0) * (navs[navs.length - 1].nav - navs[navs.length - 2].nav);
        };
        diff = calcToday(b) - calcToday(a);
      } else if (sortKey === "wanfen") {
        const navsA = navHistory[a.product_id] || []; const navsB = navHistory[b.product_id] || [];
        const wA = navsA.length >= 2 ? (navsA[navsA.length - 1].nav - navsA[navsA.length - 2].nav) * 10000 : 0;
        const wB = navsB.length >= 2 ? (navsB[navsB.length - 1].nav - navsB[navsB.length - 2].nav) * 10000 : 0;
        diff = wB - wA;
      } else if (sortKey === "annual") {
        if (statusFilter === "closed") {
          diff = getClosedTotalAnnualized(b) - getClosedTotalAnnualized(a);
        } else {
          diff = Number(b.products.annualized_1m || 0) - Number(a.products.annualized_1m || 0);
        }
      } else if (sortKey === "new") {
        diff = b.product_id - a.product_id;
      }
      return sortDesc ? diff : -diff;
    });
  }, [allHoldings, allProducts, statusFilter, sortKey, sortDesc, navHistory, watchList, globalStats.latestNavDateStr, transactions]);

  const currentSorts = statusFilter === "hold" ? HOLD_SORTS : statusFilter === "closed" ? CLOSED_SORTS : LIB_SORTS;
  const activeSubTabIndex = STATUS_TABS.findIndex(t => t.key === statusFilter);

  const totalGlobalPages = Math.ceil(flatList.length / PAGE_SIZE);
  const paginatedFlatItems = flatList.slice((globalPage - 1) * PAGE_SIZE, globalPage * PAGE_SIZE);
  const periodLabel = ANNUAL_PERIODS.find(x => x.key === annualPeriod)?.label || "1月";

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = touchStartRef.current.x - endX;
    const dy = touchStartRef.current.y - endY;
    touchStartRef.current = null;

    // 横向滑动阈值，且横向大于纵向（防止误触上下滚动）
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) {
        // 向左滑，切下一个
        if (activeSubTabIndex < STATUS_TABS.length - 1) setStatusFilter(STATUS_TABS[activeSubTabIndex + 1].key);
        else if (onSwipeLeft) onSwipeLeft();
      } else if (dx < 0) {
        // 向右滑，切上一个
        if (activeSubTabIndex > 0) setStatusFilter(STATUS_TABS[activeSubTabIndex - 1].key);
      }
    }
  };

  if (!mounted) return <div className="min-h-[200px] flex items-center justify-center text-slate-400 text-sm animate-pulse">加载中...</div>;

  return (
    // ★ 核心修复：给最外层加上 min-h-[75vh]，强制撑开高度，让下方空白区域也能响应滑动
    <div className="animate-fade-in space-y-4 min-h-[75vh]" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="relative flex bg-slate-100/60 p-1 rounded-full mb-4 shadow-sm border border-slate-200/50 overflow-hidden">
        <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300 ease-out" 
             style={{ width: "calc(25% - 2px)", transform: `translateX(${activeSubTabIndex * 100}%)`, left: "4px" }} />
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setStatusFilter(t.key)} 
            className={`flex-1 py-1.5 text-[12px] rounded-full relative z-10 transition-colors duration-300 ${statusFilter === t.key ? "text-slate-900 font-bold" : "text-slate-500 font-medium"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-1">
        <div className="segment-group flex">
          {currentSorts.map(s => (
            <button key={s.key} onClick={() => { if (sortKey === s.key) setSortDesc(!sortDesc); else { setSortKey(s.key); setSortDesc(true); } }}
              className={`flex-1 py-2 text-[12px] segment-item flex items-center justify-center gap-1 ${sortKey === s.key ? "segment-item-active" : "hover:text-slate-700"}`}>
              {s.label}
              {sortKey === s.key && <svg className={`w-3 h-3 transition-transform ${sortDesc ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>}
            </button>
          ))}
        </div>
        {sortKey === "annual" && statusFilter !== "closed" && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mt-2 bg-slate-50/80 p-1 rounded-xl">
            {ANNUAL_PERIODS.map(p => (
              <button key={p.key} onClick={() => setAnnualPeriod(p.key)} className={`flex-1 py-1.5 px-3 rounded-lg text-[11px] font-medium transition-all ${annualPeriod === p.key ? "bg-white text-purple-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        {statusFilter === "hold" ? (
          groupedSummary.length === 0 ? (
            <div className="card p-12 text-center text-slate-300 text-xs">暂无数据</div>
          ) : (
            groupedSummary.map(group => {
              const info = getBankInfo(group.bank);
              return (
                <div key={group.bank} className="card overflow-hidden mb-4">
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
                  <div className="p-2">
                    {group.items.map((h: any) => (
                      <HoldingCard key={h.id} h={h} navHistory={navHistory} transactions={transactions} annualPeriod={annualPeriod} privacy={privacy} isClosedMode={false} periodLabel={periodLabel} />
                    ))}
                  </div>
                  {group.totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
                      <button onClick={() => setPageMap(p => ({...p, [group.bank]: group.currentPage - 1}))} disabled={group.currentPage === 1} className="px-4 py-1 text-[12px] bg-white border border-slate-200 rounded-lg disabled:opacity-40">上一页</button>
                      <span className="text-[11px] text-slate-500">第 {group.currentPage} / {group.totalPages} 页</span>
                      <button onClick={() => setPageMap(p => ({...p, [group.bank]: group.currentPage + 1}))} disabled={group.currentPage === group.totalPages} className="px-4 py-1 text-[12px] bg-white border border-slate-200 rounded-lg disabled:opacity-40">下一页</button>
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          <>
            {paginatedFlatItems.length === 0 ? (
              <div className="card p-12 text-center text-slate-300 text-xs">暂无数据</div>
            ) : (
              <div className="card overflow-hidden mb-4 p-2">
                {paginatedFlatItems.map((h: any) => {
                  if (h.type === "holding") {
                    return <HoldingCard key={h.id} h={h} navHistory={navHistory} transactions={transactions} annualPeriod={annualPeriod} privacy={privacy} isClosedMode={true} periodLabel={periodLabel} />;
                  } else {
                    return <LibraryCard key={h.id} h={h} navHistory={navHistory} onToggleWatch={() => {}} />;
                  }
                })}
              </div>
            )}
            
            {totalGlobalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm border border-slate-100 mt-4">
                <button onClick={() => setGlobalPage(p => Math.max(1, p - 1))} disabled={globalPage === 1} className="px-4 py-1.5 text-[12px] font-medium bg-slate-50 rounded-lg text-slate-600 disabled:opacity-40">上一页</button>
                <span className="text-[12px] text-slate-500">第 <span className="text-purple-600 font-bold mx-0.5">{globalPage}</span> / {totalGlobalPages} 页 (共 {flatList.length} 个)</span>
                <button onClick={() => setGlobalPage(p => Math.min(totalGlobalPages, p + 1))} disabled={globalPage === totalGlobalPages} className="px-4 py-1.5 text-[12px] font-medium bg-slate-50 rounded-lg text-slate-600 disabled:opacity-40">下一页</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}