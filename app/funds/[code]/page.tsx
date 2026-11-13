"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { createChart, ColorType, AreaSeries, LineStyle } from "lightweight-charts";

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
  
  const [viewType, setViewType] = useState<"daily" | "minute">("daily");
  const [minuteData, setMinuteData] = useState<{ time: string, price: number }[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedMinuteDate, setSelectedMinuteDate] = useState<string>("");

  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code) return;
    const userId = localStorage.getItem("user_id");

    async function load() {
      const { data: stock } = await supabase.from("fund_stocks").select("*").eq("code", code).maybeSingle();
      if (!stock) { setLoading(false); return; }

      const { data: holding } = await supabase.from("fund_stock_holdings").select("*").eq("user_id", userId).eq("product_id", stock.id).maybeSingle();
      const { data: navs } = await supabase.from("fund_stock_history").select("nav_date, price").eq("product_id", stock.id).order("nav_date", { ascending: true }).limit(10000);

      setData({ ...stock, holding });
      setHistory(navs || []);
      
      if (type === "stock") {
        const { data: dates } = await supabase.from("stock_minute_data").select("trade_date").eq("product_id", stock.id).order("trade_date", { ascending: false }).limit(100);
        if (dates && dates.length > 0) {
          const uniqueDates = [...new Set(dates.map(d => d.trade_date))];
          setAvailableDates(uniqueDates);
          if (uniqueDates.length > 0) setSelectedMinuteDate(uniqueDates[0]);
        }
      }
      setLoading(false);
    }
    load();
  }, [code, type]);

  useEffect(() => {
    if (viewType === "minute" && selectedMinuteDate && data?.id) {
      supabase.from("stock_minute_data").select("time_str, price").eq("product_id", data.id).eq("trade_date", selectedMinuteDate).order("time_str", { ascending: true }).then(({ data: mins }) => {
        if (mins) setMinuteData(mins.map(m => ({ time: m.time_str, price: Number(m.price) })));
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
    return filtered.length >= 2 ? filtered : history.slice(-30);
  }, [history, range]);

  // 初始化 lightweight-charts
  useEffect(() => {
    if (!chartContainerRef.current || loading) return;
    
    chartContainerRef.current.innerHTML = ""; 

    const isProfit = filteredHistory.length > 0 && filteredHistory[filteredHistory.length - 1].price >= filteredHistory[0].price;
    const color = isProfit ? "#f43f5e" : "#10b981";

    const chart = createChart(chartContainerRef.current, {
      layout: { 
        background: { type: ColorType.Solid, color: "transparent" }, 
        textColor: "#94a3b8",
        attributionLogo: false, 
      },
      localization: {
        locale: "zh-CN",
        timeFormatter: (time: any) => {
          if (typeof time === "string" && time.includes("-")) {
            const parts = time.split("-");
            if (parts.length === 3) return `${parseInt(parts[1], 10)}.${parseInt(parts[2], 10)}`;
          }
          if (typeof time === "string" && time.includes(" ")) return time.split(" ")[1]; 
          return time;
        }
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "#f1f5f9" } },
      width: chartContainerRef.current.clientWidth,
      height: 220,
      timeScale: { 
        borderVisible: false, 
        timeVisible: viewType === "minute",
        tickMarkFormatter: (time: any) => {
          if (typeof time === "string" && time.includes(" ")) return time.split(" ")[1]; 
          if (typeof time === "string" && time.includes("-")) {
            const parts = time.split("-");
            return `${parseInt(parts[1], 10)}.${parseInt(parts[2], 10)}`; 
          }
          return time;
        }
      },
      crosshair: { 
        vertLine: { color: "#94a3b8", style: LineStyle.Dashed, labelBackgroundColor: "#0f172a" },
        horzLine: { color: "#94a3b8", style: LineStyle.Dashed, labelBackgroundColor: "#0f172a" }
      },
      handleScroll: true,
      handleScale: true,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}40`,
      bottomColor: `${color}00`,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });

    let chartData: any[] = [];
    if (viewType === "daily") {
      chartData = filteredHistory.map(h => ({ time: h.nav_date, value: Number(h.price) }));
    } else {
      const tDate = selectedMinuteDate || new Date().toISOString().split("T")[0];
      chartData = minuteData.map(m => ({ time: `${tDate} ${m.time}`, value: m.price }));
    }

    const uniqueData = chartData.filter((v, i, a) => i === 0 || v.time !== a[i-1].time);
    series.setData(uniqueData);
    chart.timeScale().fitContent();

    // 监听图表点击事件
    chart.subscribeClick((param) => {
      if (viewType === "daily" && param.time && type === "stock") {
        const clickedDate = param.time as string; 
        if (availableDates.includes(clickedDate)) {
          setSelectedMinuteDate(clickedDate);
          setViewType("minute");
        }
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [loading, filteredHistory, viewType, minuteData, availableDates]); 

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
  const todayProfit = hasHolding ? (currentPrice - prevPrice) * shares : 0;
  const changePercent = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

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
        
        {/* ★ 核心合并大卡片 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col items-center justify-center pt-6">
          <div className="text-[12px] text-slate-500 mb-1 flex items-center gap-2">
            {type === "stock" ? "当前股价（元）" : "最新净值（元）"}
            <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{p.nav_date}</span>
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
            <div className="w-full mt-2">
              {/* 上排：成本 / 股数 / 市值 */}
              <div className="grid grid-cols-3 gap-2 w-full pt-4 border-t border-slate-100">
                <div className="text-center">
                  <div className="text-[11px] text-slate-400 mb-1">持仓成本</div>
                  <div className="font-mono font-medium text-[14px] text-slate-700">
                    {costPrice.toFixed(type === "stock" ? 2 : 4)}
                  </div>
                </div>
                <div className="text-center border-x border-slate-100">
                  <div className="text-[11px] text-slate-400 mb-1">{type === "stock" ? "持仓股数" : "持仓份额"}</div>
                  <div className="font-mono font-medium text-[14px] text-slate-700">
                    {shares.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[11px] text-slate-400 mb-1">持仓金额</div>
                  <div className="font-mono font-bold text-[14px] text-slate-900">
                    {marketValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              
              {/* 下排：今日盈亏 / 累计盈亏 */}
              <div className="grid grid-cols-2 gap-4 w-full pt-4 mt-2 border-t border-slate-100/60 bg-slate-50/50 rounded-xl py-2">
                <div className="text-center">
                  <div className="text-[11px] text-slate-400 mb-1">今日盈亏</div>
                  <div className={`font-mono font-bold text-[15px] ${todayProfit > 0 ? "text-rose-500" : todayProfit < 0 ? "text-emerald-500" : "text-slate-800"}`}>
                    {todayProfit > 0 ? "+" : ""}{todayProfit.toFixed(2)}
                  </div>
                </div>
                <div className="text-center border-l border-slate-100">
                  <div className="text-[11px] text-slate-400 mb-1">累计盈亏</div>
                  <div className={`font-mono font-bold text-[15px] ${profit > 0 ? "text-rose-500" : profit < 0 ? "text-emerald-500" : "text-slate-800"}`}>
                    {profit > 0 ? "+" : ""}{profit.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 走势图卡片 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-bold text-slate-900">{type === "stock" ? "走势图" : "业绩走势"}</div>
            
            {type === "stock" ? (
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                <button onClick={() => setViewType("minute")} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${viewType === "minute" ? "bg-white text-rose-500 shadow-sm" : "text-slate-500"}`}>分时</button>
                <button onClick={() => setViewType("daily")} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${viewType === "daily" ? "bg-white text-rose-500 shadow-sm" : "text-slate-500"}`}>日K</button>
              </div>
            ) : null}
          </div>

          {type === "stock" && viewType === "daily" && (
             <div className="flex bg-slate-100 p-0.5 rounded-lg mb-4 w-max ml-auto">
               {RANGES.map(r => (
                 <button key={r.key} onClick={() => setRange(r.key)} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${range === r.key ? "bg-white text-rose-500 shadow-sm" : "text-slate-500"}`}>
                   {r.label}
                 </button>
               ))}
             </div>
          )}

          {type === "stock" && viewType === "minute" && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-2 pb-1">
              {availableDates.length > 0 ? availableDates.map(date => (
                  <button key={date} onClick={() => setSelectedMinuteDate(date)} className={`px-2 py-1 text-[10px] font-mono rounded whitespace-nowrap ${selectedMinuteDate === date ? "bg-rose-50 text-rose-500 font-bold border border-rose-200" : "bg-slate-50 text-slate-500 border border-transparent"}`}>
                    {date.slice(5)}
                  </button>
                )) : (
                <button className="px-2 py-1 text-[10px] font-mono rounded whitespace-nowrap bg-slate-50 text-slate-400 border border-dashed border-slate-200" onClick={() => window.location.reload()}>今天 (暂无数据)</button>
              )}
            </div>
          )}
          
          <div ref={chartContainerRef} className="w-full h-[220px] relative" />
          
          {type === "stock" && viewType === "daily" && (
             <div className="text-center text-[10px] text-slate-400 mt-2">
               提示：点击日K线上任意一点，可直接跳转查看当天的分时走势
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