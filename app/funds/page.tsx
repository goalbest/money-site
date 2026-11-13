"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useCountUp } from "../../lib/useCountUp";

type AssetType = "fund" | "stock";

interface HoldingData {
  id: string;
  shares: number;
  cost_price: number;
  status: string;
  fund_stocks: {
    id: string;
    code: string;
    name: string;
    type: AssetType;
    current_price: number;
    prev_price: number;
    nav_date: string | null;
  };
}

const TABS = [
  { key: "all", label: "全部" },
  { key: "fund", label: "基金" },
  { key: "stock", label: "股票" },
];

export default function FundsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // ★ 1. 从 sessionStorage 初始化 Tab
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("funds_view_tab") || "all";
    }
    return "all";
  });

  const [data, setData] = useState<HoldingData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formType, setFormType] = useState<AssetType>("fund");
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formShares, setFormShares] = useState("");
  const [formCost, setFormCost] = useState("");
  const [formCurrent, setFormCurrent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;

  // ★ 滚动恢复锁
  const hasRestoredScroll = useRef(false);

  const fetchData = async () => {
    if (!userId) return;
    setLoading(true);
    const { data: res, error } = await supabase
      .from("fund_stock_holdings")
      .select(`
        id, shares, cost_price, status,
        fund_stocks ( id, code, name, type, current_price, prev_price, nav_date )
      `)
      .eq("user_id", userId)
      .eq("status", "active");

    if (!error && res) {
      setData(res as unknown as HoldingData[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [userId]);

  // ★ 2. 保存 Tab 状态
  useEffect(() => {
    sessionStorage.setItem("funds_view_tab", activeTab);
  }, [activeTab]);

  // ★ 3. 监听滚动，保存位置
  useEffect(() => {
    const handleScroll = () => {
      // 只有在恢复完毕后才开始记录，防止覆盖
      if (hasRestoredScroll.current) {
        sessionStorage.setItem("funds_view_scroll", window.scrollY.toString());
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ★ 4. 数据加载完后，恢复滚动位置
  useEffect(() => {
    if (loading || hasRestoredScroll.current) return;
    
    const savedScroll = sessionStorage.getItem("funds_view_scroll");
    if (savedScroll) {
      // 使用双层 requestAnimationFrame 确保 DOM 完全渲染，撑开了页面高度
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

  // ★ 切换 Tab 时，重置滚动位置
  const handleTabChange = (key: string) => {
    setActiveTab(key);
    sessionStorage.setItem("funds_view_scroll", "0");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stats = useMemo(() => {
    let fundValue = 0, fundProfit = 0;
    let stockValue = 0, stockProfit = 0;

    data.forEach((item) => {
      if (!item.fund_stocks) return;
      const { current_price, type } = item.fund_stocks;
      const { shares, cost_price } = item;
      
      const marketValue = shares * current_price;
      const totalCost = shares * cost_price;
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
  }, [data]);

  const animatedTotal = useCountUp(stats.totalAssets, 1000);
  const animatedFundValue = useCountUp(stats.fund.value, 1000);
  const animatedFundProfit = useCountUp(stats.fund.profit, 1000);
  const animatedStockValue = useCountUp(stats.stock.value, 1000);
  const animatedStockProfit = useCountUp(stats.stock.profit, 1000);

  const filteredData = useMemo(() => {
    if (activeTab === "all") return data;
    return data.filter((d) => d.fund_stocks.type === activeTab);
  }, [data, activeTab]);

  const activeTabIndex = TABS.findIndex((t) => t.key === activeTab);

  const handleAdd = async () => {
    if (!formCode || !formName || !formShares || !formCost || !formCurrent) {
      alert("请填写完整信息"); return;
    }
    if (!userId) { alert("请先登录"); return; }

    setIsSubmitting(true);
    try {
      const { data: prod, error: prodErr } = await supabase
        .from("fund_stocks")
        .upsert({
          code: formCode,
          name: formName,
          type: formType,
          current_price: Number(formCurrent),
          prev_price: Number(formCurrent)
        }, { onConflict: "code" })
        .select("id")
        .single();

      if (prodErr || !prod) throw new Error("产品库保存失败：" + prodErr?.message);

      const { error: holdErr } = await supabase
        .from("fund_stock_holdings")
        .upsert({
          user_id: userId,
          product_id: prod.id,
          shares: Number(formShares),
          cost_price: Number(formCost),
          status: "active"
        }, { onConflict: "user_id,product_id" });

      if (holdErr) throw new Error("持仓保存失败：" + holdErr.message);

      await supabase.from("fund_stock_transactions").insert({
        user_id: userId,
        product_id: prod.id,
        type: "buy",
        shares: Number(formShares),
        price: Number(formCost),
        amount: Number(formShares) * Number(formCost),
        trade_date: new Date().toISOString().split("T")[0]
      });

      await fetchData();
      setIsModalOpen(false);
      setFormCode(""); setFormName(""); setFormShares(""); setFormCost(""); setFormCurrent("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return <div className="min-h-screen bg-slate-50" />;

  return (
    <div className="min-h-screen pb-24 bg-slate-50 relative">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[22px] font-bold tracking-tight text-slate-900">基金 / 股票</div>
            <div className="text-[12px] text-slate-400 mt-0.5">资产配置 · 收益透视</div>
          </div>
        </div>

        {/* 黑金大卡片 */}
        <div className="relative overflow-hidden rounded-[24px] bg-[#0A0A0A] p-5 shadow-xl shadow-black/20 mb-5 ring-1 ring-white/10">
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          
          <div className="relative z-10">
            <div className="text-[12px] text-white/50 font-medium tracking-widest mb-1">总资产（元）</div>
            <div className="text-white leading-none font-mono font-bold tracking-tight tabular flex items-baseline text-[36px] mb-5">
              <span className="text-[20px] mr-1 font-sans text-amber-500/90 font-medium">¥</span>
              {animatedTotal.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl p-3.5 border border-white/[0.06] flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]"></span>
                    <span className="text-[11px] text-white/60">基金市值</span>
                  </div>
                  <div className="text-white font-mono font-bold text-[18px] mb-1">
                    ¥{animatedFundValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-[10px] text-white/40 font-mono">
                  收益 <span className={animatedFundProfit > 0 ? "text-rose-400" : animatedFundProfit < 0 ? "text-emerald-400" : "text-white"}>
                    {animatedFundProfit >= 0 ? "+" : ""}{animatedFundProfit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl p-3.5 border border-white/[0.06] flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"></span>
                    <span className="text-[11px] text-white/60">股票市值</span>
                  </div>
                  <div className="text-white font-mono font-bold text-[18px] mb-1">
                    ¥{animatedStockValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-[10px] text-white/40 font-mono">
                  收益 <span className={animatedStockProfit > 0 ? "text-rose-400" : animatedStockProfit < 0 ? "text-emerald-400" : "text-white"}>
                    {animatedStockProfit >= 0 ? "+" : ""}{animatedStockProfit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="relative flex bg-slate-200/60 backdrop-blur-md p-1 rounded-2xl mb-6 border border-white/60 shadow-sm overflow-hidden">
          <div className="absolute top-1 bottom-1 bg-white rounded-xl shadow-md transition-transform duration-300 ease-out" style={{ width: "calc(33.33% - 2px)", transform: `translateX(${activeTabIndex * 100}%)`, left: "4px" }} />
          {TABS.map((t) => (
            <button 
              key={t.key} 
              // ★ 这里调用了重置滚动的 handleTabChange
              onClick={() => handleTabChange(t.key)} 
              className={`flex-1 py-2 text-[13px] font-bold relative z-10 transition-colors rounded-xl ${activeTab === t.key ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 列表区域 */}
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
              const p = item.fund_stocks;
              const marketValue = item.shares * p.current_price;
              const profit = marketValue - (item.shares * p.cost_price);
              const profitRate = (profit / (item.shares * p.cost_price)) * 100;
              const prevPrice = p.prev_price || p.current_price;
              const todayProfit = (p.current_price - prevPrice) * item.shares;

              return (
                <div key={item.id} onClick={() => router.push(`/funds/${p.code}?type=${p.type}`)} className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 shadow-sm border border-white/60 hover:shadow-md cursor-pointer transition-all active:scale-[0.98]">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${p.type === "fund" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                        {p.type === "fund" ? "基金" : "股票"}
                      </span>
                      <span className="text-[15px] font-bold text-slate-900 truncate max-w-[200px]">{p.name}</span>
                    </div>
                    <span className="text-[12px] text-slate-400 font-mono">{p.code}</span>
                  </div>

                  <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-1 mt-2">
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1 truncate">持仓市值</div>
                      <div className="font-mono font-bold text-[13px] text-slate-900 truncate">
                        {marketValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 mb-1">
                        <span className="text-[10px] text-slate-400 truncate">今日收益</span>
                      </div>
                      <div className={`font-mono font-bold text-[13px] truncate ${todayProfit > 0 ? "text-rose-500" : todayProfit < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                        {todayProfit > 0 ? "+" : ""}{todayProfit.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 mb-1 truncate">累计收益</div>
                      <div className={`font-mono font-bold text-[13px] truncate ${profit > 0 ? "text-rose-500" : profit < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                        {profit > 0 ? "+" : ""}{profit.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 mb-1 truncate">收益率</div>
                      <div className={`font-mono font-bold text-[13px] truncate ${profitRate > 0 ? "text-rose-500" : profitRate < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                        {profitRate >= 0 ? "+" : ""}{profitRate.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <button onClick={() => setIsModalOpen(true)} className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full bg-slate-900 text-white shadow-xl shadow-slate-900/30 active:scale-90 transition-all duration-300" style={{ bottom: "calc(100px + env(safe-area-inset-bottom))", right: "20px" }}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 animate-slide-up border border-white/50 shadow-2xl">
            <h3 className="text-[17px] font-bold text-slate-900 mb-5">添加持仓</h3>
            <div className="space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setFormType("fund")} className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${formType === "fund" ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}>基金</button>
                <button onClick={() => setFormType("stock")} className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${formType === "stock" ? "bg-white shadow-sm text-amber-600" : "text-slate-500"}`}>股票</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] text-slate-500 mb-1.5">代码</label><input type="text" value={formCode} onChange={e => setFormCode(e.target.value)} className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-200 outline-none" /></div>
                <div><label className="block text-[11px] text-slate-500 mb-1.5">名称</label><input type="text" value={formName} onChange={e => setFormName(e.target.value)} className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-200 outline-none" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-[11px] text-slate-500 mb-1.5">持有份额</label><input type="number" value={formShares} onChange={e => setFormShares(e.target.value)} className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-200 outline-none" /></div>
                <div><label className="block text-[11px] text-slate-500 mb-1.5">成本价</label><input type="number" value={formCost} onChange={e => setFormCost(e.target.value)} className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-200 outline-none" /></div>
                <div><label className="block text-[11px] text-slate-500 mb-1.5">现价</label><input type="number" value={formCurrent} onChange={e => setFormCurrent(e.target.value)} className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-200 outline-none" /></div>
              </div>
            </div>
            <div className="flex gap-2 mt-8">
              <button disabled={isSubmitting} onClick={() => setIsModalOpen(false)} className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-medium rounded-2xl active:scale-95 transition-all">取消</button>
              <button disabled={isSubmitting} onClick={handleAdd} className="flex-[2] py-3.5 bg-slate-900 text-white rounded-2xl font-bold active:scale-95 transition-all">{isSubmitting ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}