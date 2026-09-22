"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import PageHeader from "../../PageHeader";

export default function HoldingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const holdingId = params.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [holding, setHolding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"view" | "buy" | "sell" | "edit">("view");

  const [buyAmount, setBuyAmount] = useState("");
  const [sellShares, setSellShares] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [nav, setNav] = useState("");
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
    fetchHolding();
  }, [holdingId]);

  async function fetchHolding() {
    const { data } = await supabase
      .from("user_holdings")
      .select("id, holding_amount, in_transit_amount, shares, hold_date, status, products(id, name, bank, code, unit_nav, annualized_1m, daily_return, nav_date)")
      .eq("id", Number(holdingId))
      .single();
    if (data) {
      setHolding(data);
      setNav(data.products?.unit_nav ? Number(data.products.unit_nav).toFixed(4) : "");
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

      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");

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
      const remainAmount = currentAmount - (currentAmount * (sh / currentShares));

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

      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");

      router.push("/holdings");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!holding) return;
    const confirmed = window.confirm("确定删除这个持仓吗？\n（删除后，相关交易记录也会一起删除）");
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await supabase
        .from("transactions")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", holding.products.id);
      await supabase.from("user_holdings").delete().eq("id", holding.id);
      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");
      router.push("/holdings");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  if (loading || !holding) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  const p = holding.products;
  const currentShares = Number(holding.shares || 0);
  const currentAmount = Number(holding.holding_amount || 0);
  const todayProfit = currentAmount * Number(p.daily_return || 0) / 10000;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="持仓详情" backHref="/holdings" />

      <div className="container mx-auto px-4 -mt-4 max-w-2xl">
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex items-start gap-3 mb-3">
            <h1 className="font-semibold text-gray-900 text-base leading-snug flex-1">{p.name}</h1>
            <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md whitespace-nowrap font-medium flex-shrink-0">
              {p.bank}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-50">
            <div>
              <div className="text-[10px] text-gray-400 mb-1">持仓金额</div>
              <div className="text-base font-bold font-mono text-gray-900">
                {currentAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-1">份额</div>
              <div className="text-base font-bold font-mono text-gray-900">
                {currentShares.toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-1">今日收益</div>
              <div className={`text-base font-bold font-mono ${todayProfit > 0 ? "text-red-500" : todayProfit < 0 ? "text-green-600" : "text-gray-400"}`}>
                {todayProfit >= 0 ? "+" : ""}{todayProfit.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex gap-4 mt-3 text-[10px] text-gray-400">
            <span>净值 {p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—"}</span>
            <span>年化 {p.annualized_1m != null && Number(p.annualized_1m) > 0 ? `+${Number(p.annualized_1m).toFixed(2)}%` : "—"}</span>
            <span>净值日 {p.nav_date || "—"}</span>
          </div>
        </div>

        {mode === "view" && (
          <div className="space-y-3">
            <button onClick={() => { setMode("buy"); setBuyAmount(""); setNote(""); setMsg(""); }}
              className="w-full bg-blue-600 text-white py-3.5 rounded-2xl text-sm font-medium hover:bg-blue-700 transition shadow-sm">
              + 继续购买
            </button>
            <button onClick={() => { setMode("sell"); setSellShares(""); setSellAmount(""); setNote(""); setMsg(""); }}
              className="w-full bg-white text-orange-500 py-3.5 rounded-2xl text-sm font-medium hover:bg-orange-50 transition shadow-sm border border-orange-100">
              赎回
            </button>
            <button onClick={() => { setMode("edit"); setMsg(""); }}
              className="w-full bg-white text-gray-700 py-3.5 rounded-2xl text-sm font-medium hover:bg-gray-50 transition shadow-sm">
              编辑持仓
            </button>
            <button onClick={handleDelete} disabled={submitting}
              className="w-full bg-white text-red-500 py-3.5 rounded-2xl text-sm font-medium hover:bg-red-50 transition shadow-sm disabled:opacity-50">
              删除持仓
            </button>
          </div>
        )}

        {mode === "buy" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="text-sm font-medium text-gray-700 mb-4">继续购买</div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">购买日期</label>
                <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">净值</label>
                <input type="number" step="0.0001" value={nav} onChange={(e) => setNav(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">购买金额（元）</label>
                <input type="number" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)}
                  placeholder="如 10000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {Number(buyAmount) > 0 && Number(nav) > 0 && (
                  <div className="text-[10px] text-gray-400 mt-1.5 font-mono">
                    = {(Number(buyAmount) / Number(nav)).toFixed(4)} 份
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">备注（选填）</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="如：加仓、定投"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {msg && <div className="mt-4 text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{msg}</div>}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setMode("view")} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-200 transition">取消</button>
              <button onClick={handleBuy} disabled={submitting} className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                {submitting ? "保存中..." : "确认购买"}
              </button>
            </div>
          </div>
        )}

        {mode === "sell" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="text-sm font-medium text-gray-700 mb-4">赎回</div>
            <div className="text-[10px] text-gray-400 mb-3">可赎回 {currentShares.toFixed(4)} 份 / 约 {currentAmount.toFixed(2)} 元</div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">赎回日期</label>
                <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">赎回净值</label>
                <input type="number" step="0.0001" value={nav} onChange={(e) => setNav(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">赎回份额</label>
                <input type="number" step="0.0001" value={sellShares} onChange={(e) => {
                  setSellShares(e.target.value);
                  if (Number(e.target.value) && Number(nav)) {
                    setSellAmount((Number(e.target.value) * Number(nav)).toFixed(2));
                  }
                }}
                  placeholder="如 1000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => {
                    setSellShares(currentShares.toFixed(4));
                    setSellAmount((currentShares * Number(nav)).toFixed(2));
                  }} className="text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded">全部赎回</button>
                  <button onClick={() => {
                    const half = currentShares / 2;
                    setSellShares(half.toFixed(4));
                    setSellAmount((half * Number(nav)).toFixed(2));
                  }} className="text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded">赎回一半</button>
                </div>
              </div>
              {Number(sellAmount) > 0 && (
                <div className="bg-gray-50 rounded-xl px-3 py-2 text-[11px] text-gray-600 font-mono">
                  预计到账：¥ {Number(sellAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-2">备注（选填）</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="如：急用钱、调整仓位"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {msg && <div className="mt-4 text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{msg}</div>}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setMode("view")} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-200 transition">取消</button>
              <button onClick={handleSell} disabled={submitting} className="flex-1 bg-orange-500 text-white py-3 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition">
                {submitting ? "提交中..." : "确认赎回"}
              </button>
            </div>
          </div>
        )}

        {mode === "edit" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="text-sm font-medium text-gray-700 mb-4">编辑持仓</div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">持仓金额（元）</label>
                <input type="number" defaultValue={currentAmount} id="edit-amount"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">份额</label>
                <input type="number" step="0.0001" defaultValue={currentShares} id="edit-shares"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">持仓日期</label>
                <input type="date" defaultValue={holding.hold_date} id="edit-date"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {msg && <div className="mt-4 text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{msg}</div>}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setMode("view")} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-200 transition">取消</button>
              <button onClick={async () => {
                const a = (document.getElementById("edit-amount") as HTMLInputElement).value;
                const s = (document.getElementById("edit-shares") as HTMLInputElement).value;
                const d = (document.getElementById("edit-date") as HTMLInputElement).value;
                setSubmitting(true);
                try {
                  await supabase.from("user_holdings").update({
                    holding_amount: Number(a),
                    shares: Number(s),
                    hold_date: d,
                  }).eq("id", holding.id);
                  localStorage.removeItem("cache_home_cache_v3");
                  localStorage.removeItem("cache_holdings");
                  router.push("/holdings");
                } catch (e: any) {
                  setMsg("出错：" + e.message);
                  setSubmitting(false);
                }
              }} disabled={submitting} className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                {submitting ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}