"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
import { useDragSort } from "../../components/home/useDragSort";
import { useProductLayout, type ProductModuleKey } from "../../../lib/useProductLayout";

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
  const productId = Number(params.id);

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

  /* ============ 支持 ?action= 参数自动打开弹窗 ============ */
  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const action = searchParams.get("action");
    if (!action) return;
    if (action === "buy" && myHolding) setQuickBuyOpen(true);
    else if (action === "sell" && myHolding) setQuickSellOpen(true);
    else if (action === "edit" && myHolding) setEditHoldingOpen(true);
  }, [loading, myHolding]);

  const { order: productOrder, hydrated: productLayoutHydrated, move: moveProductModule } = useProductLayout();
  const [editMode, setEditMode] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ★ enabled 恒为 true，由外部决定何时调用 startDrag */
  const {
    draggingIndex: cardDraggingIdx,
    overIndex: cardOverIdx,
    startDrag: startCardDrag,
  } = useDragSort({
    onReorder: moveProductModule,
    enabled: true,
    dataKey: "product-module-index",
  });

  /* 用 ref 保存最新的 startCardDrag */
  const startDragRef = useRef(startCardDrag);
  useEffect(() => {
    startDragRef.current = startCardDrag;
  }, [startCardDrag]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const userId = localStorage.getItem("user_id");

      let prod: any = null;
      const { data: p1 } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();

      if (p1) {
        prod = p1;
      } else {
        const { data: hd } = await supabase
          .from("user_holdings")
          .select("products(*)")
          .eq("product_id", productId)
          .limit(1)
          .maybeSingle();
        prod = hd?.products || null;
      }

      setProduct(prod);

      if (prod) {
        const { data: navs } = await supabase
          .from("nav_history")
          .select("nav_date, unit_nav, accum_nav")
          .eq("product_id", productId)
          .order("nav_date", { ascending: true });
        setNavList(navs || []);
      }

      if (userId) {
        const { data: hd } = await supabase
          .from("user_holdings")
          .select("id, holding_amount, in_transit_amount, shares, hold_date, status, products(id, name, unit_nav)")
          .eq("user_id", userId)
          .eq("product_id", productId)
          .in("status", ["active", "closed"])
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        setMyHolding(hd || null);

        const { data: rules } = await supabase
          .from("watch_rules")
          .select("*")
          .eq("user_id", userId)
          .eq("product_id", productId);
        setWatchRules(rules || []);

        try {
          const { data: wl } = await supabase
            .from("watchlist")
            .select("id")
            .eq("user_id", userId)
            .eq("product_id", productId)
            .maybeSingle();
          setInWatchlist(!!wl);
        } catch {
          setInWatchlist(false);
        }
      }

      setLoading(false);
    }
    load();
  }, [productId]);

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
        await supabase.from("watchlist").delete()
          .eq("user_id", userId).eq("product_id", productId);
        setInWatchlist(false);
      } else {
        await supabase.from("watchlist").insert({
          user_id: userId, product_id: productId,
        });
        setInWatchlist(true);
      }
    } catch {}
  }

  /* ★ 长按标题：一步到位 → 进入编辑模式 + 立即拖动 */
  function handleTitlePress(e: React.PointerEvent, idx: number) {
    if (editMode) return;

    const target = e.target as HTMLElement;
    if (target.closest("button, a, [data-no-drag], .segment-group")) return;

    if (pressTimer.current) clearTimeout(pressTimer.current);

    /* ★ 立即捕获字段（React 19 合成事件在异步回调里会丢） */
    const x0 = e.clientX;
    const y0 = e.clientY;
    const ptype = e.pointerType || "touch";
    const btn = typeof e.button === "number" ? e.button : 0;

    pressTimer.current = setTimeout(() => {
      setEditMode(true);
      try { (navigator as any).vibrate?.(15); } catch {}

      /* ★ 用 plain object 代替合成事件 */
      startDragRef.current(
        {
          pointerType: ptype,
          button: btn,
          clientX: x0,
          clientY: y0,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as any,
        idx
      );
      pressTimer.current = null;
    }, 350);

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (dx * dx + dy * dy > 64) {
        if (pressTimer.current) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
        }
        window.removeEventListener("pointermove", onMove);
      }
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", () => {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
      window.removeEventListener("pointermove", onMove);
    }, { once: true });
  }

  if (loading) {
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
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl
                          bg-gradient-to-br from-slate-200 to-slate-300
                          flex items-center justify-center">
            <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-[15px] text-slate-700 font-medium mb-1.5">没有找到该产品</div>
          <div className="text-[12px] text-slate-400 mb-6">可能已被删除，或 ID 无效</div>
          <button onClick={() => router.back()} className="btn-primary px-6 py-2.5 text-sm">
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
  const holdAmount = Number(myHolding?.holding_amount || 0);
  const holdShares = (() => {
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
      case "holdings":
        return null;

      case "metrics":
        if (navList.length === 0) return null;
        return (
          <div className="card p-5">
            <MetricsPanel navList={navList} />
          </div>
        );

      case "trend":
        return (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-bold text-slate-900">净值走势</div>
              <div className="text-[11px] text-slate-400 tabular">{filteredNav.length} 天</div>
            </div>
            <div className="segment-group flex mb-4 relative z-[3]">
              {RANGES.map(r => (
                <button
                  key={r.key}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setRange(r.key); }}
                  className={`flex-1 py-1.5 text-[11px] segment-item ${
                    range === r.key ? "segment-item-active" : "hover:text-slate-700"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {filteredNav.length === 0 ? (
              <div className="py-16 text-center text-slate-300 text-xs">暂无净值历史数据</div>
            ) : (
              <NavChart data={filteredNav} interactive />
            )}
            {filteredNav.length >= 2 && (
              <div className="mt-4 pt-3 border-t divider flex items-center justify-between text-[11px]">
                <div className="text-slate-400">
                  起点 <span className="font-mono text-slate-600 tabular">{Number(filteredNav[0].unit_nav).toFixed(4)}</span>
                </div>
                <div className={`font-mono font-semibold tabular ${
                  rangeChange == null ? "text-slate-400"
                  : rangeChange > 0 ? "text-rose-500"
                  : rangeChange < 0 ? "text-emerald-500"
                  : "text-slate-500"
                }`}>
                  {rangeChange == null ? "—" : `${rangeChange >= 0 ? "+" : ""}${rangeChange.toFixed(2)}%`}
                </div>
                <div className="text-slate-400">
                  终点 <span className="font-mono text-slate-600 tabular">{Number(filteredNav[filteredNav.length - 1].unit_nav).toFixed(4)}</span>
                </div>
              </div>
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
            <div className="px-5 py-2 bg-slate-50/60 border-b divider flex items-center gap-3">
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider w-[92px]">日期</span>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider flex-1 text-right">单位净值</span>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider text-right w-[60px]">累计</span>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider text-right w-[68px]">日涨跌</span>
            </div>
            <NavHistoryList rows={navList} visibleCount={8} itemHeight={48} />
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
              {watchRules.map((rule: any) => {
                const conds = Array.isArray(rule.conditions) && rule.conditions.length > 0
                  ? rule.conditions
                  : [{ indicator: rule.indicator, operator: rule.operator, threshold: rule.threshold }];
                const logic = rule.condition_logic === "or" ? "OR" : "AND";
                return (
                  <div key={rule.id} className="flex items-center gap-2 text-[12px] py-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                    <span className="text-slate-700 truncate">
                      {conds.map((c: any) => `${c.indicator} ${c.operator} ${c.threshold}`).join(` ${logic} `)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case "transactions":
        return (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-bold text-slate-900">交易记录</div>
            </div>
            <TransactionList productId={productId} disabled={editMode} />
          </div>
        );
    }
  }

  return (
    <div className="min-h-screen pb-28">
      <div className="container mx-auto px-5 pt-6 max-w-3xl">

        <div className="flex items-center gap-2 mb-5 animate-fade-in-up">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white border border-slate-200
                       hover:border-slate-300 hover:bg-slate-50
                       flex items-center justify-center flex-shrink-0
                       transition-all duration-300 active:scale-90"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold tracking-tight text-slate-900 truncate">
              产品详情
            </div>
          </div>
          {editMode ? (
            <button
              onClick={() => setEditMode(false)}
              className="px-4 py-2 rounded-full
                         bg-gradient-to-r from-violet-500 to-purple-600
                         text-white text-[12px] font-semibold
                         shadow-md shadow-purple-500/25
                         active:scale-95 transition-all flex-shrink-0"
            >
              完成
            </button>
          ) : (
            <button
              onClick={copyName}
              className="w-9 h-9 rounded-full bg-white border border-slate-200
                         hover:border-slate-300 hover:bg-slate-50
                         flex items-center justify-center flex-shrink-0
                         transition-all duration-300 active:scale-90"
              aria-label="复制产品名"
            >
              {copied ? (
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* 产品信息卡 */}
        <div className="card p-5 mb-4 animate-fade-in-up delay-1">
          <div className="flex items-start gap-3">
            <span
              className="flex-shrink-0 rounded-lg flex items-center justify-center font-bold"
              style={{
                background: bankInfo.bg,
                color: bankInfo.color,
                width: 34,
                height: 34,
                fontSize: 14,
              }}
            >
              {bankInfo.label}
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-bold text-slate-900 leading-snug">{product.name}</h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                <span className="text-[11px] text-slate-500 font-medium">{product.bank}</span>
                {product.code && <span className="text-[10px] text-slate-400 font-mono">{product.code}</span>}
                {hasHolding && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-50 text-rose-600">持有中</span>
                )}
                {!hasHolding && myHolding?.status === "closed" && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-500">已清仓</span>
                )}
              </div>
            </div>
          </div>

          {hasHolding && (
            <>
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t divider">
                <div>
                  <div className="text-[10px] text-slate-400 mb-1">持仓金额</div>
                  <div className="text-[15px] font-bold font-mono text-slate-900 tabular">
                    ¥{holdAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 mb-1">份额</div>
                  <div className="text-[15px] font-bold font-mono text-slate-900 tabular">
                    {holdShares.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 mb-1">持有天数</div>
                  <div className="text-[15px] font-bold font-mono text-slate-900 tabular">
                    {holdDays} 天
                  </div>
                </div>
              </div>

              <button
                onClick={() => setEditHoldingOpen(true)}
                className="w-full mt-3 py-2 rounded-full
                           bg-slate-50 hover:bg-slate-100
                           text-[11px] text-slate-500 font-medium
                           active:scale-[0.98] transition-all
                           flex items-center justify-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                编辑持仓
              </button>
            </>
          )}
        </div>

        {editMode && (
          <div className="card p-3 mb-4 bg-purple-50 border border-purple-100 animate-fade-in">
            <div className="text-[12px] text-purple-700 leading-relaxed px-1">
              <span className="font-semibold">编辑模式</span> · 拖动卡片排序，或点 ↑↓ 按钮；完成后点右上角"完成"
            </div>
          </div>
        )}

        {productLayoutHydrated && productOrder.map((key, idx) => {
          const content = renderModule(key);
          if (!content) return null;

          const isDragging = cardDraggingIdx === idx;
          const isOver = cardOverIdx === idx && cardDraggingIdx !== null && cardDraggingIdx !== idx;
          const canUp = idx > 0;
          const canDown = idx < productOrder.length - 1;

          return (
            <div
              key={key}
              data-product-module-index={idx}
              className={`relative mb-4 transition-all duration-200
                          ${isDragging ? "opacity-40 scale-[0.98]" : ""}
                          ${isOver ? "ring-2 ring-purple-400 ring-offset-2 rounded-[20px]" : ""}
                          ${editMode ? "animate-wiggle" : ""}`}
            >
              <div className={editMode ? "pointer-events-none" : ""}>
                {content}
              </div>

              {!editMode && (
                <div
                  onPointerDown={(e) => handleTitlePress(e, idx)}
                  className="absolute top-0 left-0 right-0 z-[2]"
                  style={{
                    height: 52,
                    touchAction: "auto",
                  }}
                />
              )}

              {editMode && (
                <div
                  onPointerDown={(e) => startCardDrag(e, idx)}
                  className="absolute inset-0 z-[1]"
                  style={{ touchAction: "none" }}
                />
              )}

              {editMode && (
                <div className="absolute -top-2 right-2 flex gap-1 z-20">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canUp) moveProductModule(idx, idx - 1);
                    }}
                    disabled={!canUp}
                    className={`w-7 h-7 rounded-full flex items-center justify-center
                                transition-all active:scale-90 shadow-sm
                                ${canUp
                                  ? "bg-white border border-slate-200 hover:bg-slate-50"
                                  : "bg-slate-100 opacity-40"}`}
                  >
                    <svg className="w-3.5 h-3.5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canDown) moveProductModule(idx, idx + 1);
                    }}
                    disabled={!canDown}
                    className={`w-7 h-7 rounded-full flex items-center justify-center
                                transition-all active:scale-90 shadow-sm
                                ${canDown
                                  ? "bg-white border border-slate-200 hover:bg-slate-50"
                                  : "bg-slate-100 opacity-40"}`}
                  >
                    <svg className="w-3.5 h-3.5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="h-4" />
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-40"
        style={{
          background: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderTop: "1px solid #eef0f5",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="max-w-3xl mx-auto px-5 py-3 flex gap-2">
          <button
            onClick={toggleWatchlist}
            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0
                        transition-all duration-200 active:scale-90
                        ${inWatchlist
                          ? "bg-amber-50 border border-amber-200 text-amber-500"
                          : "bg-white border border-slate-200 text-slate-500"}`}
            aria-label={inWatchlist ? "取消自选" : "加入自选"}
          >
            <svg className="w-5 h-5" fill={inWatchlist ? "currentColor" : "none"}
                 stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
          {hasHolding ? (
            <>
              <button
                onClick={() => setQuickBuyOpen(true)}
                className="btn-primary flex-1 py-3 text-[14px] font-semibold
                           flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                加仓
              </button>
              <button
                onClick={() => setQuickSellOpen(true)}
                className="flex-1 py-3 text-[14px] font-semibold rounded-full
                           bg-white text-amber-600 border border-amber-200
                           hover:bg-amber-50 active:scale-[0.98]
                           transition-all duration-200"
              >
                赎回
              </button>
            </>
          ) : (
            <button
              onClick={() => setQuickBuyOpen(true)}
              className="btn-primary flex-1 py-3 text-[14px] font-semibold
                         flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              记录购买
            </button>
          )}
        </div>
      </div>

      <QuickBuyModal
        open={quickBuyOpen}
        productId={productId}
        productName={product.name}
        defaultNav={latestNav ?? undefined}
        existingHolding={hasHolding ? myHolding : null}
        onClose={() => setQuickBuyOpen(false)}
        onSuccess={() => {
          setQuickBuyOpen(false);
          window.location.reload();
        }}
      />

      <QuickSellModal
        open={quickSellOpen}
        holding={hasHolding ? myHolding : null}
        onClose={() => setQuickSellOpen(false)}
        onSuccess={() => {
          setQuickSellOpen(false);
          window.location.reload();
        }}
      />

      <EditHoldingModal
        open={editHoldingOpen}
        holding={myHolding}
        onClose={() => setEditHoldingOpen(false)}
        onSuccess={() => {
          setEditHoldingOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
}