"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { getBankInfo } from "../../../lib/banks";
import NavChart from "./NavChart";
import MetricsPanel from "./MetricsPanel";
import TransactionList from "./TransactionList";
import QuickBuyModal from "./QuickBuyModal";
import QuickSellModal from "../../components/QuickSellModal";
import EditHoldingModal from "../../components/EditHoldingModal";
import NavHistoryList from "../../components/NavHistoryList";
import { useProductLayout, type ProductModuleKey } from "../../../lib/useProductLayout";
import { getHoldingMarketValue } from "../../../lib/holdings";

type Range = "7d" | "30d" | "90d" | "1y" | "all";
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: "7d", label: "7 天", days: 7 },
  { key: "30d", label: "30 天", days: 30 },
  { key: "90d", label: "90 天", days: 90 },
  { key: "1y", label: "1 年", days: 365 },
  { key: "all", label: "全部", days: 99999 },
];

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id ? Number(params.id) : 0;

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<any>(null);
  const [navList, setNavList] = useState<any[]>([]);
  const [myHolding, setMyHolding] = useState<any>(null);
  const [watchRules, setWatchRules] = useState<any[]>([]);
  const [range, setRange] = useState<Range>("30d");
  const [quickBuyOpen, setQuickBuyOpen] = useState(false);
  const [quickSellOpen, setQuickSellOpen] = useState(false);
  const [editHoldingOpen, setEditHoldingOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);

  const { order: productOrder, hydrated: productLayoutHydrated } = useProductLayout();

  // ★ 核心优化 1：接入 localStorage 缓存和 Promise.all 并行请求
  useEffect(() => {
    if (!productId) return;

    // 1. 先读缓存，实现 0 延迟秒开
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(`cache_product_detail_v1_${productId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setProduct(parsed.product);
          setNavList(parsed.navList);
          setMyHolding(parsed.myHolding);
          setWatchRules(parsed.watchRules);
          setInWatchlist(parsed.inWatchlist);
          setLoading(false); // 有缓存直接渲染
        } catch (e) {
          setLoading(true);
        }
      } else {
        setLoading(true); // 没缓存才显示骨架屏
      }
    }

    // 2. 后台并发请求最新数据
    async function load() {
      const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;

      try {
        // 并行发起所有请求，把原来串行的 4-5 秒缩减到 1 秒内
        const pReq = supabase.from("products").select("*").eq("id", productId).maybeSingle();
        const nReq = supabase.from("nav_history").select("nav_date, unit_nav, accum_nav").eq("product_id", productId).order("nav_date", { ascending: true });
        const hReq = userId ? supabase.from("user_holdings").select("id, holding_amount, in_transit_amount, shares, hold_date, status, products(id, name, unit_nav, risk_level, redeem_arrival_days, redeem_confirm_days, redeem_cutoff_time)").eq("user_id", userId).eq("product_id", productId).in("status", ["active", "closed"]).order("id", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null });
        const rReq = userId ? supabase.from("watch_rules").select("*").eq("user_id", userId).eq("product_id", productId) : Promise.resolve({ data: [] });
        const wReq = userId ? supabase.from("watchlist").select("id").eq("user_id", userId).eq("product_id", productId).maybeSingle() : Promise.resolve({ data: null });

        const [pRes, nRes, hRes, rRes, wRes] = await Promise.all([pReq, nReq, hReq, rReq, wReq]);

        let prod = pRes.data;
        if (!prod) {
          const { data: hd } = await supabase.from("user_holdings").select("products(*)").eq("product_id", productId).limit(1).maybeSingle();
          prod = hd?.products || null;
        }

        const newNavList = nRes.data || [];
        const newHolding = hRes.data || null;
        const newRules = rRes.data || [];
        const newWatch = !!wRes.data;

        setProduct(prod);
        setNavList(newNavList);
        setMyHolding(newHolding);
        setWatchRules(newRules);
        setInWatchlist(newWatch);
        setLoading(false);

        // 3. 写入缓存
        if (prod && typeof window !== "undefined") {
          localStorage.setItem(`cache_product_detail_v1_${productId}`, JSON.stringify({
            product: prod,
            navList: newNavList,
            myHolding: newHolding,
            watchRules: newRules,
            inWatchlist: newWatch
          }));
        }
      } catch (error) {
        console.error("加载产品详情失败:", error);
        setLoading(false);
      }
    }
    load();
  }, [productId]);

  useEffect(() => {
    if (loading || !myHolding || typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const action = searchParams.get("action");
    if (action === "buy") setQuickBuyOpen(true);
    else if (action === "sell") setQuickSellOpen(true);
    else if (action === "edit") setEditHoldingOpen(true);
  }, [loading, myHolding]);

  const filteredNav = useMemo(() => {
    if (navList.length === 0) return [];
    const r = RANGES.find(r => r.key === range);
    if (!r || r.key === "all") return navList;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - r.days);
    const cutStr = cutoff.toISOString().split("T")[0];
    const filtered = navList.filter(n => n.nav_date >= cutStr);
    return filtered.length >= 2 ? filtered : navList.slice(-Math.max(2, r.days));
  }, [navList, range]);

  // ★ 最干净的返回逻辑，把滚动恢复交还给浏览器和 AllView
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace("/?view=all"); // 只有真的没历史记录时才回首页
    }
  };

  async function copyName() {
    if (!product?.name) return;
    try {
      await navigator.clipboard.writeText(product.name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function toggleWatchlist() {
    const userId = localStorage.getItem("user_id");
    if (!userId) return router.push("/login");
    try {
      if (inWatchlist) {
        await supabase.from("watchlist").delete().eq("user_id", userId).eq("product_id", productId);
        setInWatchlist(false);
      } else {
        await supabase.from("watchlist").insert({ user_id: userId, product_id: productId });
        setInWatchlist(true);
      }
    } catch {}
  }

  if (loading && !product) {
    return (
      <div className="min-h-screen pb-24">
        <div className="container mx-auto px-5 pt-6 max-w-3xl">
          <div className="h-7 w-32 bg-slate-200/60 rounded-lg animate-pulse mb-6" />
          <div className="card p-5 mb-4 h-40 animate-pulse" />
          <div className="card p-5 h-80 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
            <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-[15px] text-slate-700 font-medium mb-1.5">没有找到该产品</div>
          <div className="text-[12px] text-slate-400 mb-6">可能已被删除，或 ID 无效</div>
          <button onClick={handleBack} className="px-6 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all active:scale-95">
            返回
          </button>
        </div>
      </div>
    );
  }

  const bankInfo = getBankInfo(product.bank);
  const latest = filteredNav[filteredNav.length - 1] || navList[navList.length - 1];
  const latestNav = latest ? Number(latest.unit_nav) : null;

  let rangeChange: number | null = null;
  if (filteredNav.length >= 2) {
    const first = Number(filteredNav[0].unit_nav);
    const last = Number(filteredNav[filteredNav.length - 1].unit_nav);
    if (first > 0) rangeChange = ((last - first) / first) * 100;
  }

  const hasHolding = myHolding && myHolding.status === "active";
  const holdAmount = hasHolding ? getHoldingMarketValue(myHolding) : 0;
  const holdShares = (() => {
    if (!hasHolding) return 0;
    const raw = Number(myHolding?.shares || 0);
    if (raw > 0) return raw;
    const nav = Number(product?.unit_nav || 0);
    if (holdAmount > 0 && nav > 0) return holdAmount / nav;
    return 0;
  })();
  const holdDays = myHolding?.hold_date
    ? Math.max(0, Math.floor((Date.now() - new Date(myHolding.hold_date).getTime()) / 86400000))
    : 0;

  function renderModule(key: ProductModuleKey) {
    switch (key) {
      case "holdings": return null;
      case "metrics":
        if (navList.length === 0) return null;
        return <div className="card p-5"><MetricsPanel navList={navList} /></div>;
      case "trend":
        return (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-bold text-slate-900">净值走势</div>
              <div className="text-[11px] text-slate-400 tabular">{filteredNav.length} 天</div>
            </div>
            <div className="segment-group flex mb-4 relative z-[3]">
              {RANGES.map(r => (
                <button key={r.key} onClick={(e) => { e.stopPropagation(); setRange(r.key); }} className={`flex-1 py-1.5 text-[11px] segment-item ${range === r.key ? "segment-item-active" : "hover:text-slate-700"}`}>{r.label}</button>
              ))}
            </div>
            {filteredNav.length === 0 ? (
              <div className="py-16 text-center text-slate-300 text-xs">暂无净值历史数据</div>
            ) : (
              <NavChart data={filteredNav} interactive />
            )}
          </div>
        );
      case "navlist":
        if (navList.length === 0) return null;
        return (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b divider flex items-center justify-between">
              <div className="text-[15px] font-bold text-slate-900">净值明细</div>
              <div className="text-[11px] text-slate-400 tabular">共 {navList.length} 条</div>
            </div>
            <NavHistoryList rows={navList} />
          </div>
        );
      case "rules":
        if (watchRules.length === 0) return null;
        return (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-bold text-slate-900">🔔 监控规则</div>
              <a href="/holdings?view=monitor" className="text-[12px] text-purple-600 font-medium">管理</a>
            </div>
            <div className="space-y-2">
              {watchRules.map((rule: any) => (
                <div key={rule.id} className="flex items-center gap-2 text-[12px] py-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <span className="text-slate-700 truncate">监控规则已开启</span>
                </div>
              ))}
            </div>
          </div>
        );
      case "transactions":
        return (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-bold text-slate-900">交易记录</div>
            </div>
            <TransactionList productId={productId} disabled={false} />
          </div>
        );
      default: return null;
    }
  }

  return (
    <div className="min-h-screen pb-28">
      <div className="container mx-auto px-5 pt-6 max-w-3xl">
        <div className="flex items-center gap-2 mb-5">
          <button onClick={handleBack} className="w-9 h-9 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center flex-shrink-0 transition-all duration-300 active:scale-90">
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold tracking-tight text-slate-900 truncate">产品详情</div>
          </div>
          <button onClick={copyName} className="w-9 h-9 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center flex-shrink-0 transition-all duration-300 active:scale-90">
            {copied ? <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
          </button>
        </div>

        <div className="card p-5 mb-4">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 rounded-lg flex items-center justify-center font-bold" style={{ background: bankInfo.bg, color: bankInfo.color, width: 34, height: 34, fontSize: 14 }}>{bankInfo.label}</span>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-bold text-slate-900 leading-snug">{product.name}</h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                <span className="text-[11px] text-slate-500 font-medium">{product.bank}</span>
                {product.code && <span className="text-[10px] text-slate-400 font-mono">{product.code}</span>}
                {hasHolding && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-50 text-rose-600">持有中</span>}
              </div>
            </div>
          </div>

          {hasHolding && (
            <>
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t divider">
                <div><div className="text-[10px] text-slate-400 mb-1">持仓金额</div><div className="text-[15px] font-bold font-mono text-slate-900 tabular">¥{holdAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</div></div>
                <div><div className="text-[10px] text-slate-400 mb-1">份额</div><div className="text-[15px] font-bold font-mono text-slate-900 tabular">{holdShares.toFixed(4)}</div></div>
                <div><div className="text-[10px] text-slate-400 mb-1">持有天数</div><div className="text-[15px] font-bold font-mono text-slate-900 tabular">{holdDays} 天</div></div>
              </div>
              <button onClick={() => setEditHoldingOpen(true)} className="w-full mt-3 py-2 rounded-full bg-slate-50 hover:bg-slate-100 text-[11px] text-slate-500 font-medium active:scale-[0.98] transition-all flex items-center justify-center gap-1">编辑持仓</button>
            </>
          )}
        </div>

        {productLayoutHydrated && productOrder.map((key) => {
          const content = renderModule(key);
          if (!content) return null;
          return <div key={key} className="mb-4">{content}</div>;
        })}

        <div className="h-4" />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40" style={{ background: "rgba(255, 255, 255, 0.92)", backdropFilter: "blur(20px) saturate(180%)", borderTop: "1px solid #eef0f5", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-3xl mx-auto px-5 py-3 flex gap-2">
          <button onClick={toggleWatchlist} className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 active:scale-90 ${inWatchlist ? "bg-amber-50 border border-amber-200 text-amber-500" : "bg-white border border-slate-200 text-slate-500"}`}>
            <svg className="w-5 h-5" fill={inWatchlist ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
          </button>
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