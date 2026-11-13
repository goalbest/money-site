"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import TransactionList from "./TransactionList";
import MetricsPanel from "./MetricsPanel";
import QuickBuyModal from "./QuickBuyModal";
import QuickSellModal from "../../components/QuickSellModal";
import EditHoldingModal from "../../components/EditHoldingModal";
import NavHistoryList from "../../components/NavHistoryList";
import { getHoldingMarketValue } from "../../../lib/holdings";
import { createChart, ColorType, AreaSeries, LineStyle } from "lightweight-charts";

type Range = "7d" | "30d" | "90d" | "1y" | "all";
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: "7d", label: "7天", days: 7 },
  { key: "30d", label: "30天", days: 30 },
  { key: "90d", label: "90天", days: 90 },
  { key: "1y", label: "1年", days: 365 },
  { key: "all", label: "全部", days: 99999 },
];

// ★ 极致还原图一的图表组件
function InteractiveChart({ data }: { data: { date: string, value: number }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverData, setHoverData] = useState<{ date: string, price: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;
    
    const container = containerRef.current;
    container.innerHTML = ""; 

    const isProfit = data[data.length - 1].value >= data[0].value;
    const color = isProfit ? "#f43f5e" : "#10b981";

    const chart = createChart(container, {
      layout: { 
        background: { type: ColorType.Solid, color: "transparent" }, 
        textColor: "#94a3b8",
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      width: container.clientWidth,
      height: 180,
      // ★ 核心：彻底隐藏右侧价格轴和底部时间轴
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      // ★ 核心：只保留垂直红色虚线，去掉所有横线
      crosshair: { 
        vertLine: { color: color, style: LineStyle.Dashed, labelVisible: false }, 
        horzLine: { visible: false } 
      },
      handleScale: false,
      handleScroll: true,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}30`,
      bottomColor: `${color}00`,
      lineWidth: 2.5,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: "#ffffff",
      crosshairMarkerBackgroundColor: color,
    });

    series.setData(data.map(n => ({ time: n.date, value: n.value })));
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setHoverData(null);
        return;
      }
      const price = param.seriesData.get(series)?.value;
      if (price !== undefined) {
        setHoverData({
          date: param.time as string,
          price: price
        });
      }
    });

    const handleResize = () => {
      if (container) chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data]); 

  return (
    <div className="relative w-full pt-10">
      {/* ★ 顶部居中气泡，字体放大到 13px */}
      {hoverData && (
        <div 
          className="absolute z-10 bg-[#1e293b] text-white px-3.5 py-1.5 rounded-xl text-[13px] font-mono shadow-xl pointer-events-none flex gap-2 border border-slate-700/50"
          style={{ 
            left: "50%",
            top: "0px",
            transform: "translateX(-50%)"
          }}
        >
          <span>{hoverData.date}</span>
          <span className="font-bold text-white">{hoverData.price.toFixed(4)}</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-[180px] relative cursor-crosshair" />
      
      {/* ★ 手动绘制底部两端的日期，完美还原图一 */}
      {data.length > 0 && (
        <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-2 px-1">
          <span>{data[0].date.slice(5)}</span>
          <span>{data[data.length - 1].date.slice(5)}</span>
        </div>
      )}
    </div>
  );
}

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id ? Number(params.id) : 0;

  const CACHE_KEY = `cache_product_detail_v1_${productId}`;

  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<Range>("90d"); 
  
  const [quickBuyOpen, setQuickBuyOpen] = useState(false);
  const [quickSellOpen, setQuickSellOpen] = useState(false);
  const [editHoldingOpen, setEditHoldingOpen] = useState(false);

  const [product, setProduct] = useState<any>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).product || null;
    }
    return null;
  });

  const [navList, setNavList] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).navList || [];
    }
    return [];
  });

  const [myHolding, setMyHolding] = useState<any>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).myHolding || null;
    }
    return null;
  });

  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") return !localStorage.getItem(CACHE_KEY);
    return true;
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !productId) return;
    
    async function load() {
      const userId = localStorage.getItem("user_id");

      try {
        let prod: any = null;
        const { data: p1 } = await supabase.from("products").select("*").eq("id", productId).maybeSingle();
        if (p1) prod = p1;
        else {
          const { data: hd } = await supabase.from("user_holdings").select("products(*)").eq("product_id", productId).limit(1).maybeSingle();
          prod = hd?.products || null;
        }

        let navs: any[] = [];
        if (prod) {
          const { data } = await supabase
            .from("nav_history").select("nav_date, unit_nav").eq("product_id", productId).order("nav_date", { ascending: true });
          navs = data || [];
        }

        let hdData = null;
        if (userId) {
          const { data } = await supabase
            .from("user_holdings")
            .select("id, holding_amount, in_transit_amount, purchase_amount, shares, hold_date, status")
            .eq("user_id", userId).eq("product_id", productId).in("status", ["active", "closed"]).order("id", { ascending: false }).limit(1).maybeSingle();
          hdData = data;
        }

        setProduct(prod);
        setNavList(navs);
        setMyHolding(hdData);
        setLoading(false);

        if (prod) {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            product: prod,
            navList: navs,
            myHolding: hdData
          }));
        }
      } catch (error) {
        console.error("加载产品详情失败:", error);
        setLoading(false);
      }
    }
    load();
  }, [productId, mounted, CACHE_KEY]);

  const chartData = useMemo(() => {
    if (navList.length === 0) return [];
    
    const rawData = navList
      .filter(item => item.nav_date && item.unit_nav !== null && item.unit_nav !== undefined)
      .map(item => ({ date: item.nav_date, value: Number(item.unit_nav) }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const uniqueMap = new Map();
    rawData.forEach(item => uniqueMap.set(item.date, item));
    const cleanData = Array.from(uniqueMap.values());

    const r = RANGES.find(r => r.key === range);
    if (!r || r.key === "all") return cleanData;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - r.days);
    const cutStr = cutoff.toISOString().split("T")[0];
    
    const filtered = cleanData.filter(n => n.date >= cutStr);
    return filtered.length >= 2 ? filtered : cleanData.slice(-Math.max(2, r.days));
  }, [navList, range]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/?view=all");
  };

  if (!mounted || (loading && !product)) {
    return (
      <div className="min-h-screen pb-24 bg-slate-50">
        <div className="container mx-auto px-5 pt-6 max-w-3xl">
          <div className="h-7 w-32 bg-slate-200/60 rounded-lg animate-pulse mb-6" />
          <div className="card p-5 mb-4 h-40 animate-pulse" />
          <div className="card p-5 h-80 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!product) return null;

  const latest = chartData.length > 0 ? { nav_date: chartData[chartData.length - 1].date, unit_nav: chartData[chartData.length - 1].value } : null;
  const latestNav = latest ? latest.unit_nav : null;

  const hasHolding = myHolding && myHolding.status === "active";
  const holdAmount = hasHolding ? getHoldingMarketValue(myHolding) : 0;
  const holdDays = myHolding?.hold_date ? Math.max(0, Math.floor((Date.now() - new Date(myHolding.hold_date).getTime()) / 86400000)) : 0;
  const totalProfit = hasHolding ? (holdAmount - Number(myHolding.purchase_amount || 0)) : 0;

  return (
    <div className="min-h-screen pb-28 bg-slate-50">
      <div className="container mx-auto px-5 pt-6 max-w-3xl">
        
        <div className="flex items-center gap-2 mb-5">
          <button onClick={handleBack} className="w-9 h-9 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center flex-shrink-0 transition-all active:scale-90">
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold tracking-tight text-slate-900 truncate">{product.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-slate-400 font-medium">{product.bank}</span>
              {hasHolding && <span className="px-1.5 py-0.5 rounded-[4px] text-[9px] font-semibold bg-rose-50 text-rose-600">持有中</span>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col items-center justify-center pt-6 mb-4">
          {hasHolding ? (
            <div className="w-full flex flex-col items-center">
              <div className="text-center mb-5">
                <div className="text-[12px] text-slate-500 mb-1">持仓金额（元）</div>
                <div className="font-mono font-bold text-[32px] text-slate-900 tracking-tight">
                  ¥{holdAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="w-full h-px bg-slate-100 mb-4"></div>

              <div className="w-full grid grid-cols-3 gap-1">
                <div className="text-center flex flex-col items-center">
                  <div className="text-[11px] text-slate-500">最新净值</div>
                  <div className="text-[9px] text-slate-400 mb-1">{latest?.nav_date}</div>
                  <div className="text-[16px] font-mono font-bold text-slate-900 leading-none">
                    {latestNav?.toFixed(4) || '0.0000'}
                  </div>
                </div>
                
                <div className="text-center border-x border-slate-100 flex flex-col items-center justify-between pt-0.5">
                  <div className="text-[11px] text-slate-500">收益</div>
                  <div className={`font-mono font-bold text-[16px] leading-none mt-2 ${totalProfit > 0 ? "text-red-500" : totalProfit < 0 ? "text-green-500" : "text-slate-800"}`}>
                    {totalProfit > 0 ? "+" : ""}{totalProfit.toFixed(2)}
                  </div>
                </div>
                
                <div className="text-center flex flex-col items-center justify-between pt-0.5">
                  <div className="text-[11px] text-slate-500">天数</div>
                  <div className="font-mono font-medium text-[16px] text-slate-700 leading-none mt-2">
                    {holdDays} 天
                  </div>
                </div>
              </div>
              
              <button onClick={() => setEditHoldingOpen(true)} className="w-full mt-5 py-2.5 rounded-full bg-slate-50 hover:bg-slate-100 text-[12px] text-slate-600 font-medium transition-all">
                编辑持仓
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4">
              <div className="text-[12px] text-slate-500 mb-1 flex items-center gap-2">
                最新净值（元）
                <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{latest?.nav_date}</span>
              </div>
              <div className="text-[40px] font-mono font-bold leading-none mb-2 tracking-tight text-slate-900">
                {latestNav?.toFixed(4) || '0.0000'}
              </div>
            </div>
          )}
        </div>

        <div className="card p-5 mb-4">
          <MetricsPanel navList={navList} holding={myHolding} />
        </div>

        {navList.length > 0 && (
          <div className="card overflow-hidden mb-4">
            <div className="px-5 py-4 border-b divider flex items-center justify-between">
              <div className="text-[15px] font-bold text-slate-900">净值明细</div>
              <div className="text-[11px] text-slate-400 tabular">共 {navList.length} 条</div>
            </div>
            <NavHistoryList rows={navList} />
          </div>
        )}

        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[15px] font-bold text-slate-900">交易记录</div>
          </div>
          <TransactionList productId={productId} disabled={false} />
        </div>

        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-bold text-slate-900">净值走势</div>
            <span className="text-[11px] text-slate-400">{chartData.length} 天</span>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
            {RANGES.map(r => (
              <button 
                key={r.key} 
                onClick={() => setRange(r.key)} 
                className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg transition-all ${range === r.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          
          <InteractiveChart data={chartData} />
        </div>

      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40" style={{ background: "rgba(255, 255, 255, 0.92)", backdropFilter: "blur(20px) saturate(180%)", borderTop: "1px solid #eef0f5", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-3xl mx-auto px-5 py-3 flex gap-2">
          {hasHolding ? (
            <>
              <button onClick={() => setQuickBuyOpen(true)} className="btn-primary flex-1 py-3 text-[14px] font-semibold flex items-center justify-center gap-1.5">加仓</button>
              <button onClick={() => setQuickSellOpen(true)} className="flex-1 py-3 text-[14px] font-semibold rounded-full bg-white text-amber-600 border border-amber-200 hover:bg-amber-50 active:scale-[0.98] transition-all duration-200">赎回</button>
            </>
          ) : (
            <button onClick={() => setQuickBuyOpen(true)} className="btn-primary flex-1 py-3 text-[14px] font-semibold flex items-center justify-center gap-1.5">记录购买</button>
          )}
        </div>
      </div>

      <QuickBuyModal open={quickBuyOpen} productId={productId} productName={product.name} defaultNav={latestNav ?? undefined} existingHolding={hasHolding ? myHolding : null} onClose={() => setQuickBuyOpen(false)} onSuccess={() => { setQuickBuyOpen(false); window.location.reload(); }} />
      <QuickSellModal open={quickSellOpen} holding={hasHolding ? myHolding : null} onClose={() => setQuickSellOpen(false)} onSuccess={() => { setQuickSellOpen(false); window.location.reload(); }} />
      <EditHoldingModal open={editHoldingOpen} holding={myHolding} onClose={() => setEditHoldingOpen(false)} onSuccess={() => { setEditHoldingOpen(false); window.location.reload(); }} />
    </div>
  );
}