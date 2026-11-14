"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../lib/supabase";
import AssetOverviewCard from "./components/AssetOverviewCard";
import FundTabs from "./components/FundTabs";
import HoldingCard from "./components/HoldingCard";
import AddHoldingModal from "./components/AddHoldingModal";
import UpdateCashModal from "./components/UpdateCashModal";
import CashBanner from "./components/CashBanner";

const TABS = ["all", "fund", "stock"];
const CACHE_KEY = "cache_funds_page_v1"; // ★ 定义一个干净的缓存键

export default function FundsPage() {
  const [mounted, setMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false); 
  
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("funds_view_tab") || "all";
    }
    return "all";
  });

  // ★ 核心优化 1：从缓存初始化，实现秒开
  const [data, setData] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).data || [];
    }
    return [];
  });
  
  const [cashAmount, setCashAmount] = useState(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).cashAmount || 0;
    }
    return 0;
  });
  
  const [historyMap, setHistoryMap] = useState<Record<string, any[]>>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).historyMap || {};
    }
    return {};
  });

  // 如果没有缓存，才显示 loading 骨架屏
  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") return !localStorage.getItem(CACHE_KEY);
    return true;
  });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);

  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
  const hasRestoredScroll = useRef(false);
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);

  // ★ 核心优化 2：后台静默拉取最新数据
  const fetchData = async () => {
    if (!userId) return;
    // 注意：这里不再 setLoading(true)，防止页面闪烁
    
    const { data: res, error } = await supabase
      .from("fund_stock_holdings")
      .select(`
        id, shares, cost_price, avg_cost, status,
        fund_stocks ( id, code, name, type, current_price, prev_price, nav_date )
      `)
      .eq("user_id", userId)
      .eq("status", "active");

    if (!error && res) {
      let cash = 0;
      const others: any[] = [];
      
      res.forEach((h: any) => {
        const fs = Array.isArray(h.fund_stocks) ? h.fund_stocks[0] : h.fund_stocks;
        if (fs?.type === "cash") {
          cash = Number(fs.current_price || 0);
        } else {
          others.push(h);
        }
      });

      const productIds = others.map((h: any) => {
        const fs = Array.isArray(h.fund_stocks) ? h.fund_stocks[0] : h.fund_stocks;
        return fs?.id;
      }).filter(Boolean);

      let newHistoryMap: Record<string, any[]> = {};
      if (productIds.length > 0) {
        const { data: navs } = await supabase
          .from("fund_stock_history")
          .select("product_id, nav_date, price")
          .in("product_id", productIds)
          .order("nav_date", { ascending: true })
          .limit(10000);

        if (navs) {
          navs.forEach((n: any) => {
            if (!newHistoryMap[n.product_id]) newHistoryMap[n.product_id] = [];
            newHistoryMap[n.product_id].push({ date: n.nav_date, price: Number(n.price) });
          });
        }
      }

      // 更新状态
      setCashAmount(cash);
      setData(others);
      setHistoryMap(newHistoryMap);
      setLoading(false);

      // ★ 核心优化 3：将最新数据写入缓存
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: others,
        cashAmount: cash,
        historyMap: newHistoryMap
      }));
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchData(); // 挂载时拉取最新数据
  }, [userId]);

  useEffect(() => {
    sessionStorage.setItem("funds_view_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleScroll = () => {
      if (hasRestoredScroll.current) {
        sessionStorage.setItem("funds_view_scroll", window.scrollY.toString());
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (loading || hasRestoredScroll.current) return;
    const savedScroll = sessionStorage.getItem("funds_view_scroll");
    if (savedScroll) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: parseInt(savedScroll, 10), behavior: "instant" });
          setTimeout(() => { hasRestoredScroll.current = true; }, 100);
        });
      });
    } else {
      hasRestoredScroll.current = true;
    }
  }, [loading]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    sessionStorage.setItem("funds_view_scroll", "0");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = touchStartRef.current.x - e.changedTouches[0].clientX;
    const dy = touchStartRef.current.y - e.changedTouches[0].clientY;
    touchStartRef.current = null;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const currentIndex = TABS.indexOf(activeTab);
      if (dx > 0 && currentIndex < TABS.length - 1) {
        handleTabChange(TABS[currentIndex + 1]);
      } else if (dx < 0 && currentIndex > 0) {
        handleTabChange(TABS[currentIndex - 1]);
      }
    }
  };

  const handleRefreshStocks = async () => {
    setIsRefreshing(true);
    try {
      await fetch('/api/sync-stocks', { method: 'POST' });
      await fetchData(); 
    } catch (err) {
      alert("行情刷新失败，请检查网络");
    } finally {
      setIsRefreshing(false);
    }
  };

  const stats = useMemo(() => {
    let fundValue = 0, fundProfit = 0;
    let stockValue = cashAmount, stockProfit = 0; 

    data.forEach((item) => {
      const fs = Array.isArray(item.fund_stocks) ? item.fund_stocks[0] : item.fund_stocks;
      if (!fs) return;
      
      const currentPrice = Number(fs.current_price || 0);
      const shares = Number(item.shares || 0);
      const costPrice = Number(item.avg_cost || item.cost_price || 0);
      const type = fs.type;
      
      const marketValue = shares * currentPrice;
      const totalCost = shares * costPrice;
      const profit = marketValue - totalCost;

      if (type === "fund") {
        fundValue += marketValue;
        fundProfit += profit;
      } else {
        stockValue += marketValue;
        stockProfit += profit;
      }
    });

    return {
      totalAssets: fundValue + stockValue,
      fund: { value: fundValue, profit: fundProfit },
      stock: { value: stockValue, profit: stockProfit },
    };
  }, [data, cashAmount]);

  const filteredData = useMemo(() => {
    if (activeTab === "all") return data;
    return data.filter((d) => {
      const fs = Array.isArray(d.fund_stocks) ? d.fund_stocks[0] : d.fund_stocks;
      return fs?.type === activeTab;
    });
  }, [data, activeTab]);

  if (!mounted) return <div className="min-h-screen bg-slate-50" />;

  return (
    <div 
      className="min-h-screen pb-24 bg-slate-50 relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        
        <div className="flex items-stretch justify-between mb-5">
          <div>
            <div className="text-[22px] font-bold tracking-tight text-slate-900">基金 / 股票</div>
            <div className="text-[12px] text-slate-400 mt-0.5">资产配置 · 收益透视</div>
          </div>
          <button 
            onClick={handleRefreshStocks} 
            disabled={isRefreshing}
            className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center active:scale-90 transition-all shadow-sm disabled:opacity-50"
          >
            <svg className={`w-4 h-4 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <AssetOverviewCard stats={stats} />
        
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1">
            <FundTabs activeTab={activeTab} onTabChange={handleTabChange} />
          </div>
          <CashBanner amount={cashAmount} onEdit={() => setIsCashModalOpen(true)} />
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-10 text-slate-400 text-sm animate-pulse">加载中...</div>
          ) : filteredData.length === 0 ? (
            <div className="bg-white/80 backdrop-blur rounded-3xl p-16 flex flex-col items-center justify-center text-slate-300 shadow-sm border border-white">
              <div className="text-sm font-medium text-slate-500 mb-1">暂无持仓数据</div>
              <div className="text-xs">点击右下角 + 号添加</div>
            </div>
          ) : (
            filteredData.map((item) => {
              const fs = Array.isArray(item.fund_stocks) ? item.fund_stocks[0] : item.fund_stocks;
              if (!fs) return null;
              return <HoldingCard key={item.id} item={item} history={historyMap[fs.id] || []} />;
            })
          )}
        </div>
      </div>

      <button onClick={() => setIsModalOpen(true)} className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full bg-slate-900 text-white shadow-xl shadow-slate-900/30 active:scale-90 transition-all duration-300" style={{ bottom: "calc(100px + env(safe-area-inset-bottom))", right: "20px" }}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      </button>

      <AddHoldingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} userId={userId} onSuccess={fetchData} />
      <UpdateCashModal isOpen={isCashModalOpen} onClose={() => setIsCashModalOpen(false)} userId={userId} currentAmount={cashAmount} onSuccess={fetchData} />
    </div>
  );
}