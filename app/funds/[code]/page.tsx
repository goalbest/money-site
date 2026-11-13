"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type Range = "1m" | "3m" | "1y" | "all";
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: "1m", label: "近1月", days: 30 },
  { key: "3m", label: "近3月", days: 90 },
  { key: "1y", label: "近1年", days: 365 },
  { key: "all", label: "全部", days: 99999 },
];

export default function AssetDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = params?.code as string;
  const type = searchParams?.get("type") || "fund";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [range, setRange] = useState<Range>("3m");
  
  // 分时图相关状态
  const [viewType, setViewType] = useState<"daily" | "minute">("daily");
  const [minuteData, setMinuteData] = useState<{ time: string, price: number }[]>([]);
  const [loadingMinute, setLoadingMinute] = useState(false);
  
  // 历史分时日期选择
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedMinuteDate, setSelectedMinuteDate] = useState<string>("");

  useEffect(() => {
    if (!code) return;
    const userId = localStorage.getItem("user_id");

    async function load() {
      const { data: stock } = await supabase.from("fund_stocks").select("*").eq("code", code).maybeSingle();
      if (!stock) { setLoading(false); return; }

      const { data: holding } = await supabase
        .from("fund_stock_holdings")
        .select("*")
        .eq("user_id", userId)
        .eq("product_id", stock.id)
        .maybeSingle();

      // 查历史日 K
      const { data: navs } = await supabase
        .from("fund_stock_history")
        .select("nav_date, price")
        .eq("product_id", stock.id)
        .order("nav_date", { ascending: true })
        .limit(10000);

      setData({ ...stock, holding });
      setHistory(navs || []);
      
      // 查有哪些日期存了分时数据
      if (type === "stock") {
        const { data: dates } = await supabase
          .from("stock_minute_data")
          .select("trade_date")
          .eq("product_id", stock.id)
          .order("trade_date", { ascending: false })
          .limit(30);
        
        if (dates) {
          const uniqueDates = [...new Set(dates.map(d => d.trade_date))];
          setAvailableDates(uniqueDates);
          if (uniqueDates.length > 0) setSelectedMinuteDate(uniqueDates[0]);
        }
      }

      setLoading(false);
    }
    load();
  }, [code, type]);

  // 当切换日期或切到分时视图时，去查对应的分钟数据
  useEffect(() => {
    if (viewType === "minute" && selectedMinuteDate && data?.id) {
      setLoadingMinute(true);
      supabase
        .from("stock_minute_data")
        .select("time_str, price")
        .eq("product_id", data.id)
        .eq("trade_date", selectedMinuteDate)
        .order("time_str", { ascending: true })
        .then(({ data: mins }) => {
          if (mins) {
            setMinuteData(mins.map(m => ({ time: m.time_str, price: Number(m.price) })));
          }
          setLoadingMinute(false);
        });
    }
  }, [viewType, selectedMinuteDate, data?.id]);

  const filteredHistory = useMemo(() => {
    if (history.length === 0) return [];
    if (range === "all") return history;
    
    const days = RANGES.find(r => r.key === range)?.days || 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutStr = cutoff.toISOString().split("T")[0];
    
    const filtered = history.filter(h => h.nav_date >= cutStr);
    return filtered.length > 2 ? filtered : history.slice(-30);
  }, [history, range]);

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm animate-pulse">加载中...</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">未找到该产品</div>;

  const p = data;
  const h = data.holding;
  const hasHolding = !!h && Number(h.shares) > 0;

  const currentPrice = Number(p.current_price || 0);
  const prevPrice = Number(p.prev_price || currentPrice);
  const shares = Number(h?.shares || 0);
  const costPrice = Number(h?.avg_cost || h?.cost_price || 0);

  const marketValue = hasHolding ? shares * currentPrice : 0;
  const totalCost = hasHolding ? shares * costPrice : 0;
  const profit = marketValue - totalCost;
  const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const todayProfit = hasHolding ? (currentPrice - prevPrice) * shares : 0;
  const changePercent = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

  // 绘制平滑曲线函数
  const renderSmoothLine = (points: { x: number, y: number }[], width: number, height: number, color: string, fillId: string) => {
    if (points.length < 2) return null;
    let path = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? i : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 >= points.length ? i + 1 : i + 2];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    const fillPath = `${path} L ${width},${height} L 0,${height} Z`;
    return (
      <>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={fillPath} fill={`url(#${fillId})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      </>
    );
  };

  const renderDailyChart = () => {
    if (filteredHistory.length < 2) return <div className="h-48 flex items-center justify-center text-slate-400 text-xs bg-slate-50 rounded-xl">暂无走势数据</div>;
    
    const prices = filteredHistory.map(h => Number(h.price));
    let min = Math.min(...prices);
    let max = Math.max(...prices);
    if (hasHolding && costPrice > 0) { min = Math.min(min, costPrice); max = Math.max(max, costPrice); }
    const rangeDiff = max - min || 1;
    const width = 300, height = 120, padding = 10;
    const getY = (val: number) => height - padding - ((val - min) / rangeDiff) * (height - padding * 2);

    const points = filteredHistory.map((h, i) => ({
      x: (i / (filteredHistory.length - 1)) * width,
      y: getY(Number(h.price))
    }));
    
    const isProfit = filteredHistory[filteredHistory.length - 1].price >= filteredHistory[0].price;
    const color = isProfit ? "#f43f5e" : "#10b981";
    const costY = hasHolding && costPrice > 0 ? getY(costPrice) : null;

    return (
      <div className="h-52 w-full relative pt-4 select-none">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {renderSmoothLine(points, width, height, color, "dailyGrad")}
          {costY !== null && <line x1="0" y1={costY} x2={width} y2={costY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" />}
        </svg>
        {costY !== null && (
          <div className="absolute right-0 text-[9px] text-slate-400 bg-white/80 px-1 rounded-sm -translate-y-1/2" style={{ top: `${(costY / height) * 100}%` }}>成本 {costPrice.toFixed(2)}</div>
        )}
      </div>
    );
  };

  const renderMinuteChart = () => {
    if (loadingMinute) return <div className="h-52 flex items-center justify-center text-slate-400 text-xs animate-pulse">分时数据加载中...</div>;
    if (minuteData.length < 2) return <div className="h-52 flex items-center justify-center text-slate-400 text-xs bg-slate-50 rounded-xl">该日期暂无分时记录</div>;

    const prices = minuteData.map(h => h.price);
    const maxVal = Math.max(...prices, prevPrice);
    const minVal = Math.min(...prices, prevPrice);
    const rangeDiff = maxVal - minVal || 1;
    const width = 300, height = 120, padding = 10;
    const getY = (val: number) => height - padding - ((val - minVal) / rangeDiff) * (height - padding * 2);

    const points = minuteData.map((d, i) => ({
      x: (i / (minuteData.length - 1)) * width,
      y: getY(d.price)
    }));
    
    const isProfit = minuteData[minuteData.length - 1].price >= prevPrice;
    const color = isProfit ? "#f43f5e" : "#10b981";
    const prevY = getY(prevPrice);

    return (
      <div className="h-52 w-full relative pt-4 select-none">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {renderSmoothLine(points, width, height, color, "minuteGrad")}
          <line x1="0" y1={prevY} x2={width} y2={prevY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" />
        </svg>
        <div className="absolute left-0 top-0 text-[9px] text-slate-400 -translate-y-2">09:30</div>
        <div className="absolute right-0 top-0 text-[9px] text-slate-400 -translate-y-2">15:00</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
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
        
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col items-center justify-center py-6">
          <div className="text-[12px] text-slate-500 mb-1">
            {type === "stock" ? "当前股价（元）" : "最新净值（元）"}
          </div>
          <div className={`text-[40px] font-mono font-bold leading-none mb-2 tracking-tight ${type === "stock" ? (changePercent > 0 ? "text-rose-500" : changePercent < 0 ? "text-emerald-500" : "text-slate-900") : "text-slate-900"}`}>
            {currentPrice.toFixed(type === "stock" ? 2 : 4)}
          </div>
          
          {type === "stock" && (
            <div className={`text-[13px] font-mono font-bold mb-4 ${changePercent > 0 ? "text-rose-500" : changePercent < 0 ? "text-emerald-500" : "text-slate-500"}`}>
              {changePercent > 0 ? "+" : ""}{changePercent.toFixed(2)}%
            </div>
          )}

          {hasHolding && (
            <div className="grid grid-cols-3 gap-4 w-full pt-4 border-t border-slate-100 mt-2">
              <div className="text-center">
                <div className="text-[11px] text-slate-400 mb-1">持仓金额</div>
                <div className="font-mono font-bold text-[14px] text-slate-900">
                  {marketValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-center border-x border-slate-100">
                <div className="text-[11px] text-slate-400 mb-1">今日盈亏</div>
                <div className={`font-mono font-bold text-[14px] ${todayProfit > 0 ? "text-rose-500" : todayProfit < 0 ? "text-emerald-500" : "text-slate-800"}`}>
                  {todayProfit > 0 ? "+" : ""}{todayProfit.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[11px] text-slate-400 mb-1">累计盈亏</div>
                <div className={`font-mono font-bold text-[14px] ${profit > 0 ? "text-rose-500" : profit < 0 ? "text-emerald-500" : "text-slate-800"}`}>
                  {profit > 0 ? "+" : ""}{profit.toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-slate-900">{type === "stock" ? "持仓详情" : "最新净值"}</span>
              <span className="text-[11px] text-slate-400 font-mono">{p.nav_date}</span>
            </div>
            {type === "fund" && <div className="text-[18px] font-mono font-bold text-rose-500">{currentPrice.toFixed(4)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">持仓成本</div>
              <div className="font-mono font-medium text-[14px] text-slate-700">{hasHolding ? costPrice.toFixed(type === "stock" ? 2 : 4) : "-"}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1">{type === "stock" ? "持仓股数" : "持仓份额"}</div>
              <div className="font-mono font-medium text-[14px] text-slate-700">{hasHolding ? shares.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "-"}</div>
            </div>
          </div>
        </div>

        {/* ★ 核心图表区域 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[15px] font-bold text-slate-900">{type === "stock" ? "走势图" : "业绩走势"}</div>
            
            {type === "stock" ? (
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                <button onClick={() => setViewType("minute")} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${viewType === "minute" ? "bg-white text-rose-500 shadow-sm" : "text-slate-500"}`}>分时</button>
                <button onClick={() => setViewType("daily")} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${viewType === "daily" ? "bg-white text-rose-500 shadow-sm" : "text-slate-500"}`}>日K</button>
              </div>
            ) : (
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                {RANGES.map(r => (
                  <button key={r.key} onClick={() => setRange(r.key)} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${range === r.key ? "bg-white text-rose-500 shadow-sm" : "text-slate-500"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ★ 分时模式下，显示历史日期选择（带兜底） */}
          {type === "stock" && viewType === "minute" && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-2 pb-1">
              {availableDates.length > 0 ? (
                availableDates.map(date => (
                  <button
                    key={date}
                    onClick={() => setSelectedMinuteDate(date)}
                    className={`px-2 py-1 text-[10px] font-mono rounded whitespace-nowrap ${selectedMinuteDate === date ? "bg-rose-50 text-rose-500 font-bold border border-rose-200" : "bg-slate-50 text-slate-500 border border-transparent"}`}
                  >
                    {date.slice(5)}
                  </button>
                ))
              ) : (
                <button
                  className="px-2 py-1 text-[10px] font-mono rounded whitespace-nowrap bg-slate-50 text-slate-400 border border-dashed border-slate-200"
                  onClick={() => window.location.reload()}
                >
                  今天 (暂无数据)
                </button>
              )}
            </div>
          )}
          
          {type === "stock" && viewType === "minute" ? renderMinuteChart() : renderDailyChart()}

          {(!(type === "stock" && viewType === "minute")) && (
            <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-2 px-1">
              <span>{filteredHistory[0]?.nav_date.slice(5)}</span>
              <span>{filteredHistory[filteredHistory.length - 1]?.nav_date.slice(5)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-4 pb-8 z-40 max-w-3xl mx-auto flex gap-3">
        <button className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-2xl active:scale-95 transition-all">卖出</button>
        <button className="flex-[2] py-3 bg-gradient-to-r from-rose-500 to-red-500 text-white font-bold rounded-2xl shadow-lg shadow-rose-500/30 active:scale-95 transition-all">买入 / 加仓</button>
      </div>
    </div>
  );
}