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

  const CACHE_KEY = `cache_asset_detail_v1_${code}`;

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("3m"); 
  const [viewType, setViewType] = useState<"daily" | "minute">("daily");
  
  const [selectedMinuteDate, setSelectedMinuteDate] = useState<string>("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [hoverData, setHoverData] = useState<{ time: string, value: number } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);

  // ★ 核心优化：从缓存初始化，实现秒开
  const [data, setData] = useState<any>(() => {
    if (typeof window !== "undefined") {
      const c = localStorage.getItem(CACHE_KEY);
      if (c) return JSON.parse(c).data || null;
    }
    return null;
  });
  
  const [history, setHistory] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const c = localStorage.getItem(CACHE_KEY);
      if (c) return JSON.parse(c).history || [];
    }
    return [];
  });
  
  const [minuteData, setMinuteData] = useState<{ time: string, price: number }[]>(() => {
    if (typeof window !== "undefined") {
      const c = localStorage.getItem(CACHE_KEY);
      if (c) return JSON.parse(c).minuteData || [];
    }
    return [];
  });

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      // 如果没缓存，才显示全屏 loading
      setLoading(!localStorage.getItem(CACHE_KEY));
    }
  }, [CACHE_KEY]);

  // ★ 核心优化：并行拉取，后台静默更新
  useEffect(() => {
    if (!mounted || !code) return;
    const userId = localStorage.getItem("user_id");

    async function load() {
      try {
        // 并行请求基本信息
        const [stockRes, holdingRes] = await Promise.all([
          supabase.from("fund_stocks").select("*").eq("code", code).maybeSingle(),
          userId ? supabase.from("fund_stock_holdings").select("*").eq("user_id", userId).eq("product_id", (await supabase.from("fund_stocks").select("id").eq("code", code).single()).data?.id).maybeSingle() : Promise.resolve({ data: null })
        ]);

        const stock = stockRes.data;
        if (!stock) { setLoading(false); return; }

        const holding = holdingRes.data;
        
        // 请求历史数据
        const { data: navs } = await supabase.from("fund_stock_history").select("nav_date, price").eq("product_id", stock.id).order("nav_date", { ascending: true }).limit(10000);

        // 请求分时数据 (仅股票)
        let mins = [];
        let dates = [];
        if (type === "stock") {
          const { data: dateData } = await supabase.from("stock_minute_data").select("trade_date").eq("product_id", stock.id).order("trade_date", { ascending: false }).limit(100);
          if (dateData && dateData.length > 0) {
            dates = [...new Set(dateData.map(d => d.trade_date))];
            setAvailableDates(dates);
            
            const targetDate = selectedMinuteDate || dates[0];
            if (!selectedMinuteDate && dates[0]) setSelectedMinuteDate(dates[0]);

            if (targetDate) {
              const { data: mData } = await supabase.from("stock_minute_data").select("time_str, price").eq("product_id", stock.id).eq("trade_date", targetDate).order("time_str", { ascending: true });
              if (mData) mins = mData.map(m => ({ time: m.time_str, price: Number(m.price) }));
            }
          }
        }

        const newData = { ...stock, holding };
        const newHistory = navs || [];

        setData(newData);
        setHistory(newHistory);
        if (mins.length > 0) setMinuteData(mins);
        setLoading(false);

        // 更新缓存
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: newData,
          history: newHistory,
          minuteData: mins
        }));
      } catch (error) {
        console.error("加载失败:", error);
        setLoading(false);
      }
    }
    load();
  }, [code, type, mounted, CACHE_KEY, selectedMinuteDate]);

  // 计算图表视口数据
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

  const activeChartData = useMemo(() => {
    if (viewType === "daily") {
      return filteredHistory.map(h => ({ time: h.nav_date, value: Number(h.price) }));
    } else {
      const tDate = selectedMinuteDate || new Date().toISOString().split("T")[0];
      return minuteData.map(m => ({ time: `${tDate} ${m.time}`, value: m.price }));
    }
  }, [viewType, filteredHistory, minuteData, selectedMinuteDate]);

  // 渲染图表
  useEffect(() => {
    if (!chartContainerRef.current || loading || !data) return;
    
    chartContainerRef.current.innerHTML = ""; 
    setHoverData(null);

    const isDaily = viewType === "daily";
    // 图表底层使用全量数据，保证拖动时前后能衔接
    let chartRenderData = isDaily 
      ? history.map(h => ({ time: h.nav_date, value: Number(h.price) }))
      : minuteData.map(m => ({ time: `${selectedMinuteDate || new Date().toISOString().split("T")[0]} ${m.time}`, value: m.price }));

    // 深度去重
    chartRenderData = chartRenderData.filter((v, i, a) => i === 0 || v.time !== a[i-1].time);
    if (chartRenderData.length === 0) return;

    const isProfit = chartRenderData[chartRenderData.length - 1].value >= chartRenderData[0].value;
    const color = isProfit ? "#f43f5e" : "#10b981";

    const chart = createChart(chartContainerRef.current, {
      layout: { 
        background: { type: ColorType.Solid, color: "transparent" }, 
        textColor: "#94a3b8",
        attributionLogo: false, 
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      width: chartContainerRef.current.clientWidth,
      height: 220,
      rightPriceScale: { visible: true, borderVisible: false },
      timeScale: { visible: false },
      // ★ 核心：彻底关闭十字光标（不显示横竖虚线）
      crosshair: { 
        vertLine: { visible: false }, 
        horzLine: { visible: false } 
      },
      handleScroll: true, 
      handleScale: true,  
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}30`,
      bottomColor: `${color}00`,
      lineWidth: 2,
      crosshairMarkerVisible: false, // 隐藏原点
      priceLineVisible: true,       
      priceLineColor: color,
      priceLineStyle: LineStyle.Dashed,
    });

    series.setData(chartRenderData);
    
    // 框选视口
    if (isDaily && range !== "all" && filteredHistory.length > 0) {
      const startTime = filteredHistory[0].nav_date;
      const startIndex = Math.max(0, chartRenderData.findIndex(d => d.time === startTime));
      chart.timeScale().setVisibleLogicalRange({
        from: startIndex,
        to: chartRenderData.length + 4
      });
    } else {
      chart.timeScale().fitContent();
    }

    // 监听滑动，只更新顶部气泡，不渲染坐标线
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setHoverData(null);
        return;
      }
      const price = param.seriesData.get(series)?.value;
      if (price !== undefined) {
        setHoverData({ time: param.time as string, value: price });
      }
    });

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
  }, [loading, history, filteredHistory, range, viewType, minuteData, selectedMinuteDate, availableDates, type, data]); 

  if (!mounted || (loading && !data)) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm animate-pulse">加载中...</div>;
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

  const formatDate = (t: string) => t.includes(" ") ? t.split(" ")[1] : t.slice(5);
  const startDate = activeChartData.length > 0 ? formatDate(activeChartData[0].time) : "";
  const endDate = activeChartData.length > 0 ? formatDate(activeChartData[activeChartData.length - 1].time) : "";

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
        
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col items-center justify-center pt-6">
          <div className="text-[12px] text-slate-500 mb-1 flex items-center gap-2">
            {type === "stock" ? "当前股价（元）" : "最新净值（元）"}
            <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{p.nav_date}</span>
          </div>
          
          <div className={`text-[40px] font-mono font-bold leading-none mb-2 tracking-tight ${type === "stock" ? (changePercent > 0 ? "text-red-500" : changePercent < 0 ? "text-green-500" : "text-slate-900") : "text-slate-900"}`}>
            {currentPrice.toFixed(type === "stock" ? 2 : 4)}
          </div>
          
          {type === "stock" && (
            <div className={`text-[13px] font-mono font-bold mb-4 ${changePercent > 0 ? "text-red-500" : changePercent < 0 ? "text-green-500" : "text-slate-500"}`}>
              {changePercent > 0 ? "+" : ""}{changePercent.toFixed(2)}%
            </div>
          )}

          {hasHolding && (
            <div className="w-full mt-2">
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
              
              <div className="grid grid-cols-2 gap-4 w-full pt-4 mt-2 border-t border-slate-100/60 bg-slate-50/50 rounded-xl py-2">
                <div className="text-center">
                  <div className="text-[11px] text-slate-400 mb-1">今日盈亏</div>
                  <div className={`font-mono font-bold text-[15px] ${todayProfit > 0 ? "text-red-500" : todayProfit < 0 ? "text-green-500" : "text-slate-800"}`}>
                    {todayProfit > 0 ? "+" : ""}{todayProfit.toFixed(2)}
                  </div>
                </div>
                <div className="text-center border-l border-slate-100">
                  <div className="text-[11px] text-slate-400 mb-1">累计盈亏</div>
                  <div className={`font-mono font-bold text-[15px] ${profit > 0 ? "text-red-500" : profit < 0 ? "text-green-500" : "text-slate-800"}`}>
                    {profit > 0 ? "+" : ""}{profit.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-bold text-slate-900">{type === "stock" ? "走势图" : "业绩走势"}</div>
            
            <div className="flex items-center gap-2">
              {type === "stock" && (
                <div className="flex bg-slate-100 p-0.5 rounded-lg">
                  <button onClick={() => setViewType("minute")} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${viewType === "minute" ? "bg-white text-rose-500 shadow-sm" : "text-slate-500"}`}>分时</button>
                  <button onClick={() => setViewType("daily")} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${viewType === "daily" ? "bg-white text-rose-500 shadow-sm" : "text-slate-500"}`}>日K</button>
                </div>
              )}
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                {RANGES.map(r => (
                  <button key={r.key} onClick={() => setRange(r.key)} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${range === r.key ? "bg-white text-rose-500 shadow-sm" : "text-slate-500"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {type === "stock" && viewType === "minute" && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-2 pb-1">
              {availableDates.length > 0 ? availableDates.map(date => (
                  <button key={date} onClick={() => setSelectedMinuteDate(date)} className={`px-2 py-1 text-[10px] font-mono rounded whitespace-nowrap ${selectedMinuteDate === date ? "bg-rose-50 text-rose-500 font-bold border border-rose-200" : "bg-slate-50 text-slate-500 border border-transparent"}`}>
                    {date.slice(5)}
                  </button>
                )) : (
                <div className="text-[11px] text-slate-400 py-1 bg-slate-50 px-2 rounded-lg">今天暂无分时数据，请等待脚本抓取</div>
              )}
            </div>
          )}
          
          <div className="relative w-full pt-10">
            {hoverData && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#1e293b] text-white px-3.5 py-1.5 rounded-xl text-[13px] font-mono shadow-xl pointer-events-none flex gap-2 z-10 border border-slate-700/50">
                <span>{hoverData.time.includes(' ') ? hoverData.time.split(' ')[0] : hoverData.time}</span>
                <span className="font-bold text-white">{hoverData.value.toFixed(type === 'stock' ? 2 : 4)}</span>
              </div>
            )}
            <div ref={chartContainerRef} className="w-full h-[220px] relative cursor-crosshair" />

            {activeChartData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs bg-slate-50/50">
                暂无走势数据
              </div>
            )}
            
            <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-2 px-1">
              <span>{startDate}</span>
              <span>{endDate}</span>
            </div>
          </div>

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