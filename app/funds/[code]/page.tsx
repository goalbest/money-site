"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useCountUp } from "../../../lib/useCountUp";

export default function FundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = params?.code as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!code) return;
    const userId = localStorage.getItem("user_id");

    async function load() {
      // 1. 查产品信息
      const { data: stock } = await supabase.from("fund_stocks").select("*").eq("code", code).maybeSingle();
      if (!stock) { setLoading(false); return; }

      // 2. 查用户持仓
      const { data: holding } = await supabase
        .from("fund_stock_holdings")
        .select("*")
        .eq("user_id", userId)
        .eq("product_id", stock.id)
        .maybeSingle();

      // 3. 查历史净值（用于画图）
      const { data: navs } = await supabase
        .from("fund_stock_history")
        .select("nav_date, price")
        .eq("product_id", stock.id)
        .order("nav_date", { ascending: true });

      setData({ ...stock, holding });
      setHistory(navs || []);
      setLoading(false);
    }
    load();
  }, [code]);

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm animate-pulse">加载中...</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">未找到该产品</div>;

  const p = data;
  const h = data.holding;
  const hasHolding = !!h && h.shares > 0;

  const marketValue = hasHolding ? h.shares * p.current_price : 0;
  const totalCost = hasHolding ? h.shares * h.cost_price : 0;
  const profit = marketValue - totalCost;
  const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const todayProfit = hasHolding ? (p.current_price - (p.prev_price || p.current_price)) * h.shares : 0;

  // 简单画个折线图占位（实际开发中建议用 recharts 或 echarts）
  const renderChart = () => {
    if (history.length < 2) return <div className="h-40 flex items-center justify-center text-slate-400 text-xs bg-slate-50 rounded-xl">暂无走势数据</div>;
    const prices = history.map(h => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    
    const points = history.map((h, i) => {
      const x = (i / (history.length - 1)) * 100;
      const y = 100 - ((h.price - min) / range) * 100;
      return `${x},${y}`;
    }).join(" ");

    return (
      <div className="h-44 w-full relative pt-4">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon points={`0,100 ${points} 100,100`} fill="url(#chartGrad)" />
          <polyline points={points} fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* 顶部标题栏 */}
      <div className="bg-white px-5 pt-12 pb-4 sticky top-0 z-30 shadow-sm flex items-center gap-3">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <div className="text-[16px] font-bold text-slate-900 leading-tight">{p.name}</div>
          <div className="text-[11px] text-slate-400 font-mono">{p.code}</div>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-4 max-w-3xl space-y-4">
        
        {/* 核心收益卡片 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col items-center justify-center py-6">
          <div className="text-[12px] text-slate-500 mb-1">持仓金额（元）</div>
          <div className="text-[36px] font-mono font-bold text-slate-900 leading-none mb-4 tracking-tight">
            {marketValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className="grid grid-cols-3 gap-4 w-full pt-4 border-t border-slate-100">
            <div className="text-center">
              <div className="text-[11px] text-slate-400 mb-1">今日收益</div>
              <div className={`font-mono font-bold text-[14px] ${todayProfit > 0 ? "text-rose-500" : todayProfit < 0 ? "text-emerald-500" : "text-slate-800"}`}>
                {todayProfit > 0 ? "+" : ""}{todayProfit.toFixed(2)}
              </div>
            </div>
            <div className="text-center border-x border-slate-100">
              <div className="text-[11px] text-slate-400 mb-1">累计收益</div>
              <div className={`font-mono font-bold text-[14px] ${profit > 0 ? "text-rose-500" : profit < 0 ? "text-emerald-500" : "text-slate-800"}`}>
                {profit > 0 ? "+" : ""}{profit.toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-slate-400 mb-1">收益率</div>
              <div className={`font-mono font-bold text-[14px] ${profitRate > 0 ? "text-rose-500" : profitRate < 0 ? "text-emerald-500" : "text-slate-800"}`}>
                {profitRate > 0 ? "+" : ""}{profitRate.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* 关键指标 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-slate-900">最新净值</span>
              <span className="text-[11px] text-slate-400 font-mono">{p.nav_date}</span>
            </div>
            <div className="text-[18px] font-mono font-bold text-rose-500">{p.current_price?.toFixed(4)}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">成本价</div>
              <div className="font-mono font-medium text-[14px] text-slate-700">{hasHolding ? h.cost_price.toFixed(4) : "-"}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1">持仓份额</div>
              <div className="font-mono font-medium text-[14px] text-slate-700">{hasHolding ? h.shares.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "-"}</div>
            </div>
          </div>
        </div>

        {/* 净值走势 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="text-[15px] font-bold text-slate-900 mb-2">业绩走势</div>
          {renderChart()}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-4 pb-8 z-40 max-w-3xl mx-auto flex gap-3">
        <button className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-2xl active:scale-95 transition-all">赎回</button>
        <button className="flex-[2] py-3 bg-gradient-to-r from-rose-500 to-red-500 text-white font-bold rounded-2xl shadow-lg shadow-rose-500/30 active:scale-95 transition-all">买入 / 加仓</button>
      </div>
    </div>
  );
}