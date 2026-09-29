"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

type Tx = {
  id: number;
  type: string;
  amount: number;
  shares: number;
  price: number | null;
  trade_date: string;
  note: string | null;
  product_id: number;
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  buy: { label: "买入", color: "text-rose-500 bg-rose-50" },
  sell: { label: "赎回", color: "text-amber-600 bg-amber-50" },
  close: { label: "清仓", color: "text-slate-600 bg-slate-100" },
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function TransactionEditModal({
  tx,
  onClose,
  onSaved,
}: {
  tx: Tx;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState(tx.type);
  const [tradeDate, setTradeDate] = useState(tx.trade_date);
  const [amount, setAmount] = useState(String(tx.amount || ""));
  const [shares, setShares] = useState(String(tx.shares || ""));
  const [price, setPrice] = useState(tx.price != null ? String(tx.price) : "");
  const [note, setNote] = useState(tx.note || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [syncHolding, setSyncHolding] = useState(true);

  function handlePriceChange(v: string) {
    setPrice(v);
    const p = Number(v);
    const a = Number(amount);
    if (p > 0 && a > 0) setShares((a / p).toFixed(4));
  }
  function handleAmountChange(v: string) {
    setAmount(v);
    const a = Number(v);
    const p = Number(price);
    if (a > 0 && p > 0) setShares((a / p).toFixed(4));
  }
  function handleSharesChange(v: string) {
    setShares(v);
    const s = Number(v);
    const p = Number(price);
    if (s > 0 && p > 0) setAmount((s * p).toFixed(2));
  }

  async function handleSave() {
    const a = Number(amount);
    const s = Number(shares);
    if (!tradeDate) return setMsg("请填写交易日期");
    if (!a || a <= 0) return setMsg("请填写有效金额");
    if (!s || s <= 0) return setMsg("请填写有效份额");

    setSaving(true);
    setMsg("");

    try {
      const { error: txErr } = await supabase
        .from("transactions")
        .update({
          type,
          amount: a,
          shares: s,
          price: price ? Number(price) : null,
          trade_date: tradeDate,
          note: note.trim() || null,
        })
        .eq("id", tx.id);

      if (txErr) throw txErr;

      if (syncHolding) {
        await recalcHolding(tx.product_id);
      }

      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");

      onSaved();
    } catch (e: any) {
      setMsg(e.message || "保存失败");
      setSaving(false);
    }
  }

  async function recalcHolding(productId: number) {
    const userId = localStorage.getItem("user_id");
    if (!userId) return;

    const { data: allTx } = await supabase
      .from("transactions")
      .select("id, type, amount, shares, price, trade_date")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .order("trade_date", { ascending: true })
      .order("id", { ascending: true });

    if (!allTx || allTx.length === 0) return;

    let shares = 0;
    let cost = 0;
    let firstBuyDate: string | null = null;
    let closedAmount = 0;

    for (const t of allTx) {
      const sh = Number(t.shares || 0);
      const amt = Number(t.amount || 0);
      if (t.type === "buy") {
        if (!firstBuyDate) firstBuyDate = t.trade_date;
        shares += sh;
        cost += amt;
      } else if (t.type === "sell") {
        if (shares > 0) {
          const sellRatio = Math.min(1, sh / shares);
          cost -= cost * sellRatio;
          shares -= sh;
        }
      } else if (t.type === "close") {
        closedAmount = amt;
        shares = 0;
        cost = 0;
      }
    }

    const { data: prod } = await supabase
      .from("products")
      .select("unit_nav")
      .eq("id", productId)
      .maybeSingle();
    const latestNav = Number(prod?.unit_nav || 0);

    const holdingAmount = latestNav > 0 ? shares * latestNav : cost;
    const isClosed = shares <= 0.01;

    const { data: existing } = await supabase
      .from("user_holdings")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("user_holdings")
        .update({
          shares: isClosed ? 0 : shares,
          holding_amount: isClosed ? 0 : holdingAmount,
          purchase_amount: cost,
          hold_date: firstBuyDate,
          status: isClosed ? "closed" : "active",
          closed_amount: isClosed ? closedAmount : null,
          closed_at: isClosed ? new Date().toISOString() : null,
        })
        .eq("id", existing.id);
    } else if (!isClosed) {
      await supabase.from("user_holdings").insert({
        user_id: userId,
        product_id: productId,
        shares,
        holding_amount: holdingAmount,
        purchase_amount: cost,
        hold_date: firstBuyDate,
        status: "active",
      });
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] animate-fade-in"
        style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[9999] animate-slide-up"
        style={{ animationDuration: "0.3s" }}
      >
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col">
            <div className="px-5 py-4 border-b divider flex items-center justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-slate-900">编辑交易</div>
                <div className="text-[11px] text-slate-400 mt-0.5">修改后保存，会自动同步持仓</div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100
                           flex items-center justify-center active:scale-90 flex-shrink-0 ml-2"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">类型</label>
                <div className="segment-group flex">
                  {(["buy", "sell", "close"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`flex-1 py-2.5 text-[12px] segment-item ${
                        type === t ? "segment-item-active" : "hover:text-slate-700"
                      }`}
                    >
                      {TYPE_LABELS[t].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">交易日期</label>
                <input
                  type="date"
                  value={tradeDate}
                  max={todayStr()}
                  onChange={(e) => setTradeDate(e.target.value)}
                  className="input-field w-full px-4 py-3 text-[13px] tabular"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">净值</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  value={price}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  placeholder="1.0234"
                  className="input-field w-full px-4 py-3 text-[14px] font-mono tabular"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">金额（元）</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="10000"
                    className="input-field w-full px-4 py-3 text-[14px] font-mono tabular"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">份额</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    value={shares}
                    onChange={(e) => handleSharesChange(e.target.value)}
                    placeholder="9881.42"
                    className="input-field w-full px-4 py-3 text-[14px] font-mono tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">备注（选填）</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：定投、加仓、历史数据补录"
                  className="input-field w-full px-4 py-3 text-[13px]"
                />
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer
                                px-3.5 py-3 rounded-xl bg-purple-50/60 border border-purple-100">
                <input
                  type="checkbox"
                  checked={syncHolding}
                  onChange={(e) => setSyncHolding(e.target.checked)}
                  className="mt-0.5 accent-purple-600"
                />
                <div className="flex-1">
                  <div className="text-[12px] text-purple-700 font-medium">
                    同时更新持仓数据
                  </div>
                  <div className="text-[10px] text-purple-500 mt-0.5 leading-relaxed">
                    修改后自动重算该产品的持仓份额、金额、成本
                  </div>
                </div>
              </label>

              {msg && (
                <div className="text-[13px] text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                  {msg}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t divider flex gap-2 flex-shrink-0">
              <button onClick={onClose} className="btn-secondary flex-1 py-3 text-sm">
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}