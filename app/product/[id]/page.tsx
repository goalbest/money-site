"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { getBankInfo } from "../../../lib/banks";
import NavChart from "./NavChart";
import MetricsPanel from "./MetricsPanel";
import TransactionList from "./TransactionList";
import QuickBuyModal from "./QuickBuyModal";

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
  const [copied, setCopied] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [scrollDir, setScrollDir] = useState<"up" | "down">("up");
  const lastYRef = useRef(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const userId = localStorage.getItem("user_id");

      // 1. 产品信息
      let prod: any = null;
      const { data: p1 } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();

      if (p1) {
        prod = p1;
      } else {
        // 兜底：从 user_holdings 关联查（保险）
        const { data: hd } = await supabase
          .from("user_holdings")
          .select("products(*)")
          .eq("product_id", productId)
          .limit(1)
          .maybeSingle();
        prod = hd?.products || null;
      }

      setProduct(prod);

      // 2. 净值历史
      if (prod) {
        const { data: navs } = await supabase
          .from("nav_history")
          .select("nav_date, unit_nav, accum_nav")
          .eq("product_id", productId)
          .order("nav_date", { ascending: true });
        setNavList(navs || []);
      }

      // 3. 我的持仓
      if (userId) {
        const { data: hd } = await supabase
          .from("user_holdings")
          .select("id, holding_amount, in_transit_amount, shares, hold_date, status")
          .eq("user_id", userId)
          .eq("product_id", productId)
          .in("status", ["active", "closed"])
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        setMyHolding(hd || null);

        // 4. 监控规则
        const { data: rules } = await supabase
          .from("watch_rules")
          .select("*")
          .eq("user_id", userId)
          .eq("product_id", productId);
        setWatchRules(rules || []);

        // 5. 自选状态（如果表存在）
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

  // 滚动方向监听（Q1 C）
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastYRef.current + 8) setScrollDir("down");
      else if (y < lastYRef.current - 8) setScrollDir("up");
      lastYRef.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    } catch {
      // 表可能不存在，静默忽略
    }
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
          <button
            onClick={() => router.back()}
            className="btn-primary px-6 py-2.5 text-sm"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const bankInfo = getBankInfo(product.bank);
  const latest = filteredNav[filteredNav.length - 1] || navList[navList.length - 1];
  const latestNav = latest ? Number(latest.unit_nav) : null;
  const latestDate = latest?.nav_date || null;

  let rangeChange: number | null = null;
  if (filteredNav.length >= 2) {
    const first = Number(filteredNav[0].unit_nav);
    const last = Number(filteredNav[filteredNav.length - 1].unit_nav);
    if (first > 0) rangeChange = ((last - first) / first) * 100;
  }

  const hasHolding = myHolding && myHolding.status === "active";
  const holdAmount = Number(myHolding?.holding_amount || 0);
  const holdShares = Number(myHolding?.shares || 0);
  const holdDays = myHolding?.hold_date
    ? Math.max(0, Math.floor((Date.now() - new Date(myHolding.hold_date).getTime()) / 86400000))
    : 0;

  return (
    <div className="min-h-screen pb-32">
      <div className="container mx-auto px-5 pt-6 max-w-3xl">

        {/* 顶部栏 */}
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
          <button
            onClick={copyName}
            className="w-9 h-9 rounded-full bg-white border border-slate-200
                       hover:border-slate-300 hover:bg-slate-50
                       flex items-center justify-center flex-shrink-0
                       transition-all duration-300 active:scale-90"
            aria-label="复制产品名"
            title="复制产品名"
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
          {hasHolding && (
            <button
              onClick={() => router.push(`/holdings/${myHolding.id}?action=edit`)}
              className="w-9 h-9 rounded-full bg-white border border-slate-200
                         hover:border-slate-300 hover:bg-slate-50
                         flex items-center justify-center flex-shrink-0
                         transition-all duration-300 active:scale-90"
              aria-label="编辑持仓"
              title="编辑持仓"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>

        {/* 产品信息卡 */}
        <div className="card p-5 mb-4 animate-fade-in-up delay-1">
          <div className="flex items-start gap-3 mb-4">
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
              <h1 className="text-[15px] font-bold text-slate-900 leading-snug">
                {product.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                <span className="text-[11px] text-slate-500 font-medium">{product.bank}</span>
                {product.code && (
                  <span className="text-[10px] text-slate-400 font-mono">{product.code}</span>
                )}
                {hasHolding && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-50 text-rose-600">
                    持有中
                  </span>
                )}
                {!hasHolding && myHolding?.status === "closed" && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-500">
                    已清仓
                  </span>
                )}
              </div>
            </div>
          </div>

          {latestNav != null && (
            <div className="grid grid-cols-2 gap-4 py-4 border-t divider">
              <div>
                <div className="text-[10px] text-slate-400 mb-1">最新净值</div>
                <div className="text-[22px] font-bold font-mono text-slate-900 tabular leading-none">
                  {latestNav.toFixed(4)}
                </div>
                {latestDate && (
                  <div className="text-[10px] text-slate-400 mt-1.5 tabular">
                    更新至 {latestDate}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">
                  {RANGES.find(r => r.key === range)?.label}涨跌
                </div>
                <div className={`text-[22px] font-bold font-mono tabular leading-none ${
                  rangeChange == null ? "text-slate-400"
                  : rangeChange > 0 ? "text-rose-500"
                  : rangeChange < 0 ? "text-emerald-500"
                  : "text-slate-700"
                }`}>
                  {rangeChange == null ? "—"
                    : `${rangeChange >= 0 ? "+" : ""}${rangeChange.toFixed(2)}%`}
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5">
                  基于净值
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 我的持仓卡 */}
        {hasHolding && (
          <div className="card-summary p-5 mb-4 animate-fade-in-up delay-2">
            <div className="text-[11px] text-slate-500 tracking-wider mb-3">
              我的持仓
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
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
            <div className="flex gap-2 pt-3 border-t divider">
              <button
                onClick={() => setQuickBuyOpen(true)}
                className="btn-primary flex-1 py-2.5 text-[12px] font-semibold"
              >
                + 加仓
              </button>
              <button
                onClick={() => router.push(`/holdings/${myHolding.id}?action=sell`)}
                className="flex-1 py-2.5 text-[12px] font-semibold rounded-full
                           bg-white text-amber-600 border border-amber-200
                           hover:bg-amber-50 hover:border-amber-300
                           active:scale-[0.98] transition-all duration-200"
              >
                赎回
              </button>
            </div>
          </div>
        )}

        {/* 净值走势 */}
        <div className="card p-5 mb-4 animate-fade-in-up delay-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[15px] font-bold text-slate-900">净值走势</div>
            <div className="text-[11px] text-slate-400 tabular">
              {filteredNav.length} 天
            </div>
          </div>

          <div className="segment-group flex mb-4">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`flex-1 py-1.5 text-[11px] segment-item ${
                  range === r.key ? "segment-item-active" : "hover:text-slate-700"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {filteredNav.length === 0 ? (
            <div className="py-16 text-center text-slate-300 text-xs">
              暂无净值历史数据
            </div>
          ) : (
            <NavChart data={filteredNav} />
          )}
        </div>

        {/* 指标面板 */}
        {navList.length > 0 && (
          <div className="card p-5 mb-4 animate-fade-in-up delay-3">
            <div className="text-[15px] font-bold text-slate-900 mb-3">
              关键指标
            </div>
            <MetricsPanel navList={navList} />
          </div>
        )}

        {/* 监控规则 */}
        {watchRules.length > 0 && (
          <div className="card p-5 mb-4 animate-fade-in-up delay-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-bold text-slate-900">
                🔔 监控规则
              </div>
              <a href="/holdings?view=monitor"
                 className="text-[12px] text-purple-600 font-medium">
                管理
              </a>
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
        )}

        {/* 交易记录 */}
        <div className="card p-5 mb-4 animate-fade-in-up delay-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[15px] font-bold text-slate-900">交易记录</div>
          </div>
          <TransactionList productId={productId} />
        </div>

        <div className="h-8" />
      </div>

      {/* 底部固定栏（Q1 C：滚动收起） */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300
                    ${scrollDir === "down" ? "translate-y-full" : "translate-y-0"}`}
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
                onClick={() => router.push(`/holdings/${myHolding.id}?action=sell`)}
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
    </div>
  );
}