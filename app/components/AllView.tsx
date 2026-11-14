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

export default function AllView({ 
  allHoldings, allProducts = [], navHistory, transactions = [], globalStats, privacy, onSwipeLeft
}: any) {
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("all_view_tab") || "hold";
    }
    return "hold";
  });

  // ★ 核心修复 1：初始化时读取排序缓存
  const [sortKey, setSortKey] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("all_view_sort_key");
      if (saved && [...HOLD_SORTS, ...LIB_SORTS].some(s => s.key === saved)) return saved;
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

  // ★ 核心修复 2：排序变化时同步到缓存
  useEffect(() => {
    sessionStorage.setItem("all_view_sort_key", sortKey);
  }, [sortKey]);

  useEffect(() => {
    sessionStorage.setItem("all_view_sort_desc", String(sortDesc));
  }, [sortDesc]);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => { 
      if (hasRestoredScroll.current) {
        sessionStorage.setItem("all_view_scroll", window.scrollY.toString()); 
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    sessionStorage.setItem("all_view_tab", statusFilter);
    setPageMap({});
    setGlobalPage(1);
    
    // 切换 Tab 时，只有当前排序方式不适用于新 Tab 才重置
    if (statusFilter === "hold" && !HOLD_SORTS.some(s => s.key === sortKey)) {
      setSortKey("annual");
    } else if (statusFilter === "closed" && !HOLD_SORTS.some(s => s.key === sortKey)) {
      setSortKey("value");
    } else if ((statusFilter === "watch" || statusFilter === "all") && !LIB_SORTS.some(s => s.key === sortKey)) {
      setSortKey("new");
    }
  }, [statusFilter]); // 注意：去掉了对 sortKey 的依赖，防止死循环

  const holdings = useMemo(() => allHoldings.filter((h: any) => h.status === "active"), [allHoldings]);
  const closedHoldings = useMemo(() => allHoldings.filter((h: any) => h.status === "closed"), [allHoldings]);

  const groupedSummary = useMemo(() => {
    if (statusFilter !== "hold" && statusFilter !== "closed") return [];
    let filtered = statusFilter === "hold" ? holdings : closedHoldings;

    const sortedItems = [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "value") {
        diff = getHoldingMarketValue(b) - getHoldingMarketValue(a);
      } else if (sortKey === "days") {
        diff = new Date(b.hold_date || 0).getTime() - new Date(a.hold_date || 0).getTime();
      } else if (sortKey === "today") {
        const calcToday = (h: any) => {
          const navs = navHistory[h.products?.id] || [];
          if (navs.length < 2) return 0;
          if (h.hold_date && navs[navs.length - 1].date < h.hold_date) return 0;
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
  }, [holdings, closedHoldings, statusFilter, sortKey, sortDesc, navHistory, pageMap, globalStats.totalHolding]);

  const flatList = useMemo(() => {
    if (statusFilter !== "watch" && statusFilter !== "all") return [];
    
    const list: any[] = [];
    const processedIds = new Set<number>();

    allHoldings.forEach((h: any) => {
      if (!h.products) return;
      processedIds.add(h.products.id);
      list.push({ id: h.id, product_id: h.products.id, products: h.products, status: h.status, holding_info: h, isWatched: watchList.has(h.products.id) });
    });

    allProducts.forEach((p: any) => {
      if (!processedIds.has(p.id)) {
        list.push({ id: `lib-${p.id}`, product_id: p.id, products: p, status: "none", holding_info: null, isWatched: watchList.has(p.id) });
      }
    });

    let filtered = statusFilter === "watch" ? list.filter(h => h.isWatched) : list;
    
    return [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "new") diff = b.product_id - a.product_id;
      else if (sortKey === "wanfen") {
        const navsA = navHistory[a.product_id] || []; const navsB = navHistory[b.product_id] || [];
        diff = (navsB.length >= 2 ? (navsB[navsB.length-1].nav - navsB[navsB.length-2].nav) * 10000 : 0) - (navsA.length >= 2 ? (navsA[navsA.length-1].nav - navsA[navsA.length-2].nav) * 10000 : 0);
      } else if (sortKey === "annual") diff = Number(b.products.annualized_1m || 0) - Number(a.products.annualized_1m || 0);
      return sortDesc ? diff : -diff;
    });
  }, [statusFilter, sortKey, sortDesc, navHistory, allHoldings, allProducts, watchList]);

  const currentSorts = (statusFilter === "hold" || statusFilter === "closed") ? HOLD_SORTS : LIB_SORTS;
  const activeSubTabIndex = STATUS_TABS.findIndex(t => t.key === statusFilter);

  const ITEMS_PER_PAGE = statusFilter === "all" ? 8 : 15;
  const totalGlobalPages = Math.ceil(flatList.length / ITEMS_PER_PAGE);
  const paginatedFlatItems = flatList.slice((globalPage - 1) * ITEMS_PER_PAGE, globalPage * ITEMS_PER_PAGE);
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

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) {
        if (activeSubTabIndex < STATUS_TABS.length - 1) {
          setStatusFilter(STATUS_TABS[activeSubTabIndex + 1].key);
        } else if (onSwipeLeft) {
          onSwipeLeft();
        }
      } else if (dx < 0) {
        if (activeSubTabIndex > 0) {
          setStatusFilter(STATUS_TABS[activeSubTabIndex - 1].key);
        }
      }
    }
  };

  if (!mounted) return <div className="min-h-[200px] flex items-center justify-center text-slate-400 text-sm animate-pulse">加载中...</div>;

  return (
    <div className="animate-fade-in space-y-4" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="relative flex bg-slate-100/60 p-1 rounded-full mb-4 shadow-sm border border-slate-200/50 overflow-hidden">
        <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300 ease-out" 
             style={{ width: "calc(25% - 2px)", transform: `translateX(${activeSubTabIndex * 100}%)`, left: "4px" }} />
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => { setStatusFilter(t.key); setPageMap({}); setGlobalPage(1); }} 
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

      <div className="mt-4">
        {(statusFilter === "hold" || statusFilter === "closed") ? (
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
                      <HoldingCard key={h.id} h={h} navHistory={navHistory} transactions={transactions} annualPeriod={annualPeriod} privacy={privacy} isClosedMode={statusFilter === "closed"} periodLabel={periodLabel} />
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
              paginatedFlatItems.map((h: any) => (
                <LibraryCard key={h.id} h={h} navHistory={navHistory} onToggleWatch={() => {}} />
              ))
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