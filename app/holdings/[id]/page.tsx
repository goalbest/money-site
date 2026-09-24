"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { getBankInfo, normalizeBank } from "../../../lib/banks";
import BankSelect from "../../components/BankSelect";

/* ============ 迷你走势图 ============ */
function MiniNavChart({ points, w = 320, h = 90 }: { points: { date: string; nav: number }[]; w?: number; h?: number }) {
  if (points.length < 2) return null;
  const navs = points.map(p => p.nav);
  const min = Math.min(...navs);
  const max = Math.max(...navs);
  const range = max - min || 1;
  const padding = 8;
  const stepX = (w - padding * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: h - padding - ((p.nav - min) / range) * (h - padding * 2),
  }));
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${h} L ${coords[0].x.toFixed(1)} ${h} Z`;
  const positive = points[points.length - 1].nav >= points[0].nav;
  const stroke = positive ? "#f43f5e" : "#10b981";
  const fill = positive ? "rgba(244, 63, 94, 0.08)" : "rgba(16, 185, 129, 0.08)";

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: h }}
    >
      <defs>
        <linearGradient id={`grad-${positive ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={positive ? "#f43f5e" : "#10b981"} stopOpacity="0.15" />
          <stop offset="100%" stopColor={positive ? "#f43f5e" : "#10b981"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${positive ? "up" : "down"})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r="3"
        fill={stroke}
        stroke="#ffffff"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function HoldingDetailContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const holdingId = params.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [holding, setHolding] = useState<any>(null);
  const [navHistory, setNavHistory] = useState<{ date: string; nav: number }[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"view" | "buy" | "sell" | "edit">("view");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const [buyAmount, setBuyAmount] = useState("");
  const [sellShares, setSellShares] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [nav, setNav] = useState("");
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");

  const [editAmount, setEditAmount] = useState("");
  const [editShares, setEditShares] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editBank, setEditBank] = useState("");
  const [bankSelectOpen, setBankSelectOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) {
      router.push("/login");
      return;
    }
    setUserId(id);
    fetchHolding();

    const action = searchParams.get("action");
    if (action === "buy" || action === "sell" || action === "edit") {
      setMode(action);
    }
  }, [holdingId]);

  async function fetchHolding() {
    const { data } = await supabase
      .from("user_holdings")
      .select(
        "id, holding_amount, in_transit_amount, shares, hold_date, status, products(id, name, bank, code, unit_nav, annualized_1m, daily_return, nav_date)"
      )
      .eq("id", Number(holdingId))
      .single();
    if (data) {
      setHolding(data);
      setNav(data.products?.unit_nav ? Number(data.products.unit_nav).toFixed(4) : "");
      setEditAmount(String(data.holding_amount || 0));
      setEditShares(String(data.shares || 0));
      setEditDate(data.hold_date || "");
      setEditBank(data.products?.bank || "");

      /* 拉最近 30 天净值 */
      const { data: navs } = await supabase
        .from("nav_history")
        .select("nav_date, unit_nav")
        .eq("product_id", data.products.id)
        .order("nav_date", { ascending: false })
        .limit(30);
      if (navs) {
        const sorted = [...navs]
          .reverse()
          .map((n: any) => ({ date: n.nav_date, nav: Number(n.unit_nav) }));
        setNavHistory(sorted);
      }

      /* 拉最近 5 条交易 */
      const { data: txs } = await supabase
        .from("transactions")
        .select("id, type, amount, shares, price, trade_date, note")
        .eq("user_id", localStorage.getItem("user_id"))
        .eq("product_id", data.products.id)
        .order("trade_date", { ascending: false })
        .limit(5);
      if (txs) setTransactions(txs);
    }
    setLoading(false);
  }

  async function fetchNavByDate(date: string) {
    if (!holding) return;
    const { data } = await supabase
      .from("nav_history")
      .select("nav_date, unit_nav")
      .eq("product_id", holding.products.id)
      .lte("nav_date", date)
      .order("nav_date", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setNav(Number(data[0].unit_nav).toFixed(4));
    }
  }

  useEffect(() => {
    if ((mode === "buy" || mode === "sell") && tradeDate) {
      fetchNavByDate(tradeDate);
    }
  }, [tradeDate, mode]);

  function clearCache() {
    localStorage.removeItem("cache_home_cache_v3");
    localStorage.removeItem("cache_home_cache_v4");
    localStorage.removeItem("cache_transactions");
    localStorage.removeItem("cache_holdings");
  }

  async function handleBuy() {
    if (!buyAmount || Number(buyAmount) <= 0) return setMsg("请填写金额");
    if (!nav || Number(nav) <= 0) return setMsg("请填写净值");
    if (!userId || !holding) return;

    setSubmitting(true);
    try {
      const amt = Number(buyAmount);
      const navNum = Number(nav);
      const addShares = amt / navNum;

      await supabase
        .from("user_holdings")
        .update({
          holding_amount: Number(holding.holding_amount || 0) + amt,
          shares: Number(holding.shares || 0) + addShares,
          status: "active",
        })
        .eq("id", holding.id);

      await supabase.from("transactions").insert({
        user_id: userId,
        product_id: holding.products.id,
        type: "buy",
        amount: amt,
        shares: addShares,
        price: navNum,
        trade_date: tradeDate,
        note: note || "追加购买",
      });

      clearCache();
      router.push("/holdings");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  async function handleSell() {
    if (!holding) return;
    const navNum = Number(nav);
    const sh = Number(sellShares);

    if (!navNum || navNum <= 0) return setMsg("请填写净值");
    if (!sh || sh <= 0) return setMsg("请填写赎回份额");

    const currentShares = Number(holding.shares || 0);
    const currentAmount = Number(holding.holding_amount || 0);

    if (sh > currentShares) return setMsg("赎回份额超过持仓");

    setSubmitting(true);
    try {
      const sellAmt = sh * navNum;
      const remainShares = currentShares - sh;
      const remainAmount = currentAmount - currentAmount * (sh / currentShares);

      if (remainShares < 0.01) {
        await supabase
          .from("user_holdings")
          .update({
            status: "closed",
            closed_at: new Date().toISOString(),
            closed_amount: sellAmt,
            shares: 0,
            holding_amount: 0,
          })
          .eq("id", holding.id);
      } else {
        await supabase
          .from("user_holdings")
          .update({
            shares: remainShares,
            holding_amount: remainAmount,
          })
          .eq("id", holding.id);
      }

      await supabase.from("transactions").insert({
        user_id: userId,
        product_id: holding.products.id,
        type: remainShares < 0.01 ? "close" : "sell",
        amount: sellAmt,
        shares: sh,
        price: navNum,
        trade_date: tradeDate,
        note: note || (remainShares < 0.01 ? "清仓" : "部分赎回"),
      });

      clearCache();
      router.push("/holdings");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  async function handleSaveEdit() {
    if (!holding) return;
    setSubmitting(true);
    try {
      await supabase
        .from("user_holdings")
        .update({
          holding_amount: Number(editAmount),
          shares: Number(editShares),
          hold_date: editDate || null,
        })
        .eq("id", holding.id);

      const normalized = normalizeBank(editBank);
      if (normalized && normalized !== holding.products.bank) {
        await supabase
          .from("products")
          .update({ bank: normalized })
          .eq("id", holding.products.id);
      }

      clearCache();
      router.push("/holdings");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!holding) return;
    const confirmed = window.confirm(
      "确定删除这个持仓吗？\n（删除后，相关交易记录也会一起删除）"
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await supabase
        .from("transactions")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", holding.products.id);
      await supabase.from("user_holdings").delete().eq("id", holding.id);
      clearCache();
      router.push("/holdings");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  if (loading || !holding) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">加载中...</div>
      </div>
    );
  }

  const p = holding.products;
  const currentShares = Number(holding.shares || 0);
  const currentAmount = Number(holding.holding_amount || 0);
  const todayProfit = (currentAmount * Number(p.daily_return || 0)) / 10000;
  const hasNav = p.unit_nav != null;
  const bankInfo = getBankInfo(p.bank);

  /* 30 天涨跌 */
  let navChange30d: number | null = null;
  if (navHistory.length >= 2) {
    const first = navHistory[0].nav;
    const last = navHistory[navHistory.length - 1].nav;
    if (first > 0) navChange30d = ((last - first) / first) * 100;
  }

  /* 持有天数 */
  const days = holding.hold_date
    ? Math.max(0, Math.floor((Date.now() - new Date(holding.hold_date).getTime()) / 86400000))
    : 0;

  const TX_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    buy: { label: "买入", color: "text-rose-500 bg-rose-50" },
    sell: { label: "赎回", color: "text-amber-600 bg-amber-50" },
    close: { label: "清仓", color: "text-slate-600 bg-slate-100" },
  };

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-6 max-w-2xl">

        {/* 顶部 */}
        <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
          <button
            onClick={() => router.push("/holdings")}
            className="w-9 h-9 rounded-full bg-white border border-slate-200
                       hover:border-slate-300 hover:bg-slate-50
                       flex items-center justify-center flex-shrink-0
                       transition-all duration-300 active:scale-90"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-[18px] font-bold text-slate-900 flex-1">
            持仓详情
          </div>
          <button
            onClick={() => setMoreMenuOpen(true)}
            className="w-9 h-9 rounded-full bg-white border border-slate-200
                       hover:border-slate-300 hover:bg-slate-50
                       flex items-center justify-center flex-shrink-0
                       transition-all duration-300 active:scale-90"
          >
            <svg className="w-4 h-4 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
        </div>

        {/* 主信息卡 */}
        <div className="card p-5 mb-4 animate-fade-in-up delay-1">
          <div className="flex items-start gap-3 mb-4">
            <span
              className="bank-avatar flex-shrink-0 mt-0.5"
              style={{ background: bankInfo.bg, color: bankInfo.color }}
            >
              {bankInfo.label}
            </span>
            <h1 className="font-semibold text-slate-900 text-[15px] leading-snug flex-1">
              {p.name}
            </h1>
          </div>

          <div className="grid grid-cols-3 gap-3 py-4 border-t divider">
            <div>
              <div className="text-[10px] text-slate-400 mb-1">持仓金额</div>
              <div className="text-[16px] font-bold font-mono text-slate-900 tabular">
                {currentAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">份额</div>
              <div className="text-[16px] font-bold font-mono text-slate-900 tabular">
                {currentShares.toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">今日收益</div>
              <div className={`text-[16px] font-bold font-mono tabular ${
                todayProfit > 0 ? "text-rose-500"
                : todayProfit < 0 ? "text-emerald-500"
                : "text-slate-400"
              }`}>
                {todayProfit >= 0 ? "+" : ""}{todayProfit.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-3 border-t divider">
            <span>净值 {p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—"}</span>
            <span>年化 {p.annualized_1m != null && Number(p.annualized_1m) > 0 ? `+${Number(p.annualized_1m).toFixed(2)}%` : "—"}</span>
            {days > 0 && <span>持有 {days} 天</span>}
          </div>

          {!hasNav && (
            <div className="bg-orange-50 rounded-xl p-3 mt-4">
              <div className="text-[10px] text-orange-700 leading-relaxed">
                ⚠️ 该产品暂未抓到净值数据
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮区 */}
        {mode === "view" && (
          <div className="animate-fade-in-up delay-2 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setMode("buy");
                  setBuyAmount("");
                  setNote("");
                  setMsg("");
                }}
                className="btn-primary py-4 text-[14px] font-semibold
                           flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                加仓
              </button>
              <button
                onClick={() => {
                  setMode("sell");
                  setSellShares("");
                  setSellAmount("");
                  setNote("");
                  setMsg("");
                }}
                className="py-4 text-[14px] font-semibold rounded-full
                           bg-white text-amber-600
                           border border-amber-200
                           hover:bg-amber-50 hover:border-amber-300
                           active:scale-[0.98]
                           transition-all duration-200
                           flex items-center justify-center gap-1.5"
                style={{ boxShadow: "0 2px 8px rgba(251, 146, 60, 0.12)" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
                赎回
              </button>
            </div>
          </div>
        )}

        {/* 净值走势卡 */}
        {navHistory.length >= 2 && mode === "view" && (
          <div className="card p-5 mb-4 animate-fade-in-up delay-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-bold text-slate-900">
                近 30 天走势
              </div>
              {navChange30d !== null && (
                <div className={`font-mono font-bold text-[13px] tabular ${
                  navChange30d > 0 ? "text-rose-500"
                  : navChange30d < 0 ? "text-emerald-500"
                  : "text-slate-400"
                }`}>
                  {navChange30d >= 0 ? "+" : ""}{navChange30d.toFixed(2)}%
                </div>
              )}
            </div>

            <div className="-mx-1">
              <MiniNavChart points={navHistory} />
            </div>

            <div className="flex justify-between mt-2 text-[10px] text-slate-400 tabular">
              <span>{navHistory[0].date}</span>
              <span>{navHistory[navHistory.length - 1].date}</span>
            </div>
          </div>
        )}

        {/* 最近交易 */}
        {mode === "view" && (
          <div className="card overflow-hidden mb-4 animate-fade-in-up delay-4">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between">
              <div className="text-[15px] font-bold text-slate-900">
                最近交易
              </div>
              <Link
                href="/transactions"
                className="text-[12px] text-purple-600 font-medium
                           hover:text-purple-700 flex items-center gap-0.5"
              >
                全部
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {transactions.length === 0 ? (
              <div className="px-5 pb-5 pt-2 text-center text-slate-300 text-[11px]">
                暂无交易记录
              </div>
            ) : (
              <div>
                {transactions.map((tx) => {
                  const typeInfo = TX_TYPE_LABELS[tx.type] || { label: tx.type, color: "text-slate-500 bg-slate-100" };
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-5 py-3
                                 border-t divider"
                    >
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-slate-700 font-medium truncate">
                          {tx.note || typeInfo.label}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 tabular">
                          {tx.trade_date}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono font-semibold text-[13px] text-slate-900 tabular">
                          ¥{Number(tx.amount || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular">
                          {Number(tx.shares || 0).toFixed(4)} 份
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* BUY 模式 */}
        {mode === "buy" && (
          <div className="card p-5 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[15px] font-semibold text-slate-900">继续购买</div>
              <button
                onClick={() => setMode("view")}
                className="text-[12px] text-slate-400 hover:text-slate-600"
              >
                取消
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">购买日期</label>
                <input
                  type="date"
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  className="input-field w-full px-4 py-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">净值</label>
                <input
                  type="number"
                  step="0.0001"
                  value={nav}
                  onChange={(e) => setNav(e.target.value)}
                  className="input-field w-full px-4 py-3 text-base font-mono tabular"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">购买金额（元）</label>
                <input
                  type="number"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  placeholder="如 10000"
                  className="input-field w-full px-4 py-3 text-base font-mono tabular"
                />
                {Number(buyAmount) > 0 && Number(nav) > 0 && (
                  <div className="text-[10px] text-slate-400 mt-1.5 font-mono">
                    = {(Number(buyAmount) / Number(nav)).toFixed(4)} 份
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">备注（选填）</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：加仓、定投"
                  className="input-field w-full px-4 py-3 text-sm"
                />
              </div>
            </div>
            {msg && (
              <div className="mt-4 text-sm text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                {msg}
              </div>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setMode("view")} className="btn-secondary flex-1 py-3 text-sm">
                取消
              </button>
              <button onClick={handleBuy} disabled={submitting} className="btn-primary flex-1 py-3 text-sm">
                {submitting ? "保存中..." : "确认购买"}
              </button>
            </div>
          </div>
        )}

        {/* SELL 模式 */}
        {mode === "sell" && (
          <div className="card p-5 animate-fade-in-up">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[15px] font-semibold text-slate-900">赎回</div>
              <button
                onClick={() => setMode("view")}
                className="text-[12px] text-slate-400 hover:text-slate-600"
              >
                取消
              </button>
            </div>
            <div className="text-[11px] text-slate-400 mb-4">
              可赎回 {currentShares.toFixed(4)} 份 / 约 {currentAmount.toFixed(2)} 元
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">赎回日期</label>
                <input
                  type="date"
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  className="input-field w-full px-4 py-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">赎回净值</label>
                <input
                  type="number"
                  step="0.0001"
                  value={nav}
                  onChange={(e) => setNav(e.target.value)}
                  className="input-field w-full px-4 py-3 text-base font-mono tabular"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">赎回份额</label>
                <input
                  type="number"
                  step="0.0001"
                  value={sellShares}
                  onChange={(e) => {
                    setSellShares(e.target.value);
                    if (Number(e.target.value) && Number(nav)) {
                      setSellAmount((Number(e.target.value) * Number(nav)).toFixed(2));
                    }
                  }}
                  placeholder="如 1000"
                  className="input-field w-full px-4 py-3 text-base font-mono tabular"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      setSellShares(currentShares.toFixed(4));
                      setSellAmount((currentShares * Number(nav)).toFixed(2));
                    }}
                    className="text-[10px] text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full font-medium"
                  >
                    全部赎回
                  </button>
                  <button
                    onClick={() => {
                      const half = currentShares / 2;
                      setSellShares(half.toFixed(4));
                      setSellAmount((half * Number(nav)).toFixed(2));
                    }}
                    className="text-[10px] text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full font-medium"
                  >
                    赎回一半
                  </button>
                </div>
              </div>
              {Number(sellAmount) > 0 && (
                <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-[11px] text-slate-600 font-mono">
                  预计到账：¥ {Number(sellAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </div>
              )}
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">备注（选填）</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：急用钱、调整仓位"
                  className="input-field w-full px-4 py-3 text-sm"
                />
              </div>
            </div>
            {msg && (
              <div className="mt-4 text-sm text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                {msg}
              </div>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setMode("view")} className="btn-secondary flex-1 py-3 text-sm">
                取消
              </button>
              <button
                onClick={handleSell}
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white py-3 rounded-full
                           text-sm font-semibold hover:shadow-lg transition disabled:opacity-50"
              >
                {submitting ? "提交中..." : "确认赎回"}
              </button>
            </div>
          </div>
        )}

        {/* EDIT 模式 */}
        {mode === "edit" && (
          <div className="card p-5 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[15px] font-semibold text-slate-900">编辑持仓</div>
              <button
                onClick={() => setMode("view")}
                className="text-[12px] text-slate-400 hover:text-slate-600"
              >
                取消
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">所属银行</label>
                <button
                  type="button"
                  onClick={() => setBankSelectOpen(true)}
                  className="input-field w-full px-4 py-3 text-sm
                             flex items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2.5">
                    {editBank ? (
                      <>
                        <span
                          className="bank-avatar"
                          style={{
                            background: getBankInfo(editBank).bg,
                            color: getBankInfo(editBank).color,
                          }}
                        >
                          {getBankInfo(editBank).label}
                        </span>
                        <span className="text-slate-900">{editBank}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">点击选择</span>
                    )}
                  </span>
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">持仓金额（元）</label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="input-field w-full px-4 py-3 text-base font-mono tabular"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">份额</label>
                <input
                  type="number"
                  step="0.0001"
                  value={editShares}
                  onChange={(e) => setEditShares(e.target.value)}
                  className="input-field w-full px-4 py-3 text-base font-mono tabular"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">持仓日期</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="input-field w-full px-4 py-3 text-sm"
                />
              </div>
            </div>
            {msg && (
              <div className="mt-4 text-sm text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                {msg}
              </div>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setMode("view")} className="btn-secondary flex-1 py-3 text-sm">
                取消
              </button>
              <button onClick={handleSaveEdit} disabled={submitting} className="btn-primary flex-1 py-3 text-sm">
                {submitting ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>
        )}
      </div>

      <BankSelect
        open={bankSelectOpen}
        current={editBank}
        onClose={() => setBankSelectOpen(false)}
        onSelect={(b) => setEditBank(b)}
      />

      {/* ⋯ 更多操作菜单 */}
      {moreMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[80] animate-fade-in"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => setMoreMenuOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[90] animate-fade-in-up"
            style={{ animationDuration: "0.3s" }}
          >
            <div className="max-w-2xl mx-auto px-4 pb-4">
              <div className="bg-white rounded-3xl overflow-hidden shadow-2xl mb-2">
                <button
                  onClick={() => {
                    setMode("edit");
                    setMsg("");
                    setMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-5 py-4
                             hover:bg-slate-50 active:bg-slate-100
                             transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[14px] text-slate-800 font-medium">编辑持仓</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">修改金额、份额、银行</div>
                  </div>
                </button>

                <Link
                  href={`/product/${p.id}`}
                  onClick={() => setMoreMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-5 py-4
                             hover:bg-slate-50 active:bg-slate-100
                             transition-colors text-left
                             border-t divider"
                >
                  <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[14px] text-slate-800 font-medium">完整产品页</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">查看全部净值明细、完整交易</div>
                  </div>
                </Link>

                <button
                  onClick={() => {
                    setMoreMenuOpen(false);
                    handleDelete();
                  }}
                  className="w-full flex items-center gap-3 px-5 py-4
                             hover:bg-rose-50 active:bg-rose-100
                             transition-colors text-left
                             border-t divider"
                >
                  <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[14px] text-rose-600 font-medium">删除持仓</div>
                    <div className="text-[11px] text-rose-400 mt-0.5">同时删除交易记录</div>
                  </div>
                </button>
              </div>

              <button
                onClick={() => setMoreMenuOpen(false)}
                className="w-full bg-white rounded-2xl py-4 text-[15px] font-semibold
                           text-slate-700 shadow-2xl active:bg-slate-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function HoldingDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
          加载中...
        </div>
      }
    >
      <HoldingDetailContent />
    </Suspense>
  );
}