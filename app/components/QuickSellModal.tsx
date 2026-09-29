"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

type Props = {
  open: boolean;
  holding: any;
  onClose: () => void;
  onSuccess: () => void;
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function QuickSellModal({ open, holding, onClose, onSuccess }: Props) {
  const [shares, setShares] = useState("");
  const [nav, setNav] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setShares("");
    setNav(holding?.products?.unit_nav ? Number(holding.products.unit_nav).toFixed(4) : "");
    setDate(todayStr());
    setNote("");
    setMsg("");
  }, [open, holding]);

  if (!open || !holding) return null;

  const currentShares = Number(holding.shares || 0);
  const currentAmount = Number(holding.holding_amount || 0);
  const sh = Number(shares);
  const navNum = Number(nav);
  const sellAmt = sh * navNum;

  async function handleSubmit() {
    if (!navNum || navNum <= 0) return setMsg("请填写净值");
    if (!sh || sh <= 0) return setMsg("请填写份额");
    if (sh > currentShares) return setMsg("赎回份额超过持仓");

    setSaving(true);
    setMsg("");

    try {
      const userId = localStorage.getItem("user_id");
      if (!userId) throw new Error("请先登录");

      const remainShares = currentShares - sh;
      const remainAmount = currentAmount - currentAmount * (sh / currentShares);
      const isClosed = remainShares < 0.01;

      if (isClosed) {
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
        type: isClosed ? "close" : "sell",
        amount: sellAmt,
        shares: sh,
        price: navNum,
        trade_date: date,
        note: note || (isClosed ? "清仓" : "部分赎回"),
      });

      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");

      onSuccess();
    } catch (e: any) {
      setMsg(e.message || "失败");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[100] animate-fade-in"
           style={{ backdropFilter: "blur(4px)" }}
           onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[110] animate-slide-up"
           style={{ animationDuration: "0.3s" }}>
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col">
            <div className="px-5 py-4 border-b divider flex items-center justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-slate-900">赎回</div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {holding.products?.name}
                </div>
              </div>
              <button type="button" onClick={onClose}
                      className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100
                                 flex items-center justify-center active:scale-90 flex-shrink-0 ml-2">
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="text-[11px] text-slate-400 bg-slate-50 rounded-xl px-3.5 py-2.5">
                可赎回 <span className="font-mono font-semibold text-slate-700">{currentShares.toFixed(4)}</span> 份
                {" · "}
                约 <span className="font-mono font-semibold text-slate-700">{currentAmount.toFixed(2)}</span> 元
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">赎回日期</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                       className="input-field w-full px-4 py-3 text-[13px] tabular" />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">赎回净值</label>
                <input type="number" step="0.0001" value={nav}
                       onChange={(e) => setNav(e.target.value)}
                       className="input-field w-full px-4 py-3 text-[14px] font-mono tabular" />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">赎回份额</label>
                <input type="number" step="0.0001" value={shares}
                       onChange={(e) => setShares(e.target.value)}
                       placeholder="如 1000"
                       className="input-field w-full px-4 py-3 text-[14px] font-mono tabular" />
                <div className="flex gap-2 mt-2">
                  <button type="button"
                          onClick={() => setShares(currentShares.toFixed(4))}
                          className="text-[10px] text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full font-medium">
                    全部赎回
                  </button>
                  <button type="button"
                          onClick={() => setShares((currentShares / 2).toFixed(4))}
                          className="text-[10px] text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full font-medium">
                    赎回一半
                  </button>
                </div>
              </div>

              {sellAmt > 0 && (
                <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-[11px] text-slate-600 font-mono">
                  预计到账：¥ {sellAmt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </div>
              )}

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">备注（选填）</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                       placeholder="如：急用钱"
                       className="input-field w-full px-4 py-3 text-[13px]" />
              </div>

              {msg && (
                <div className="text-[13px] text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                  {msg}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t divider flex gap-2 flex-shrink-0">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 py-3 text-sm">取消</button>
              <button type="button" onClick={handleSubmit} disabled={saving}
                      className="flex-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white
                                 py-3 rounded-full text-sm font-semibold
                                 hover:shadow-lg transition disabled:opacity-50">
                {saving ? "提交中..." : "确认赎回"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}