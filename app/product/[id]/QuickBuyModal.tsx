"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

type Props = {
  open: boolean;
  productId: number;
  productName: string;
  defaultNav?: number;
  existingHolding?: any;
  onClose: () => void;
  onSuccess: () => void;
};

export default function QuickBuyModal({
  open, productId, productName, defaultNav, existingHolding, onClose, onSuccess,
}: Props) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [nav, setNav] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setDate(new Date().toISOString().split("T")[0]);
    setNav(defaultNav ? String(defaultNav) : "");
    setAmount("");
    setNote("");
    setMsg("");
  }, [open, defaultNav]);

  if (!open) return null;

  async function handleSubmit() {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setMsg("请先登录");
      return;
    }
    const amt = Number(amount);
    const navNum = Number(nav);
    if (!amt || amt <= 0) return setMsg("请填写金额");
    if (!navNum || navNum <= 0) return setMsg("请填写净值");

    setSaving(true);
    try {
      const addShares = amt / navNum;

      if (existingHolding) {
        await supabase
          .from("user_holdings")
          .update({
            holding_amount: Number(existingHolding.holding_amount || 0) + amt,
            shares: Number(existingHolding.shares || 0) + addShares,
            status: "active",
          })
          .eq("id", existingHolding.id);
      } else {
        await supabase.from("user_holdings").insert({
          user_id: Number(userId),
          product_id: productId,
          holding_amount: amt,
          shares: addShares,
          hold_date: date,
          status: "active",
        });
      }

      await supabase.from("transactions").insert({
        user_id: Number(userId),
        product_id: productId,
        type: "buy",
        amount: amt,
        shares: addShares,
        price: navNum,
        trade_date: date,
        note: note || (existingHolding ? "追加购买" : "购买"),
      });

      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_home_cache_v4");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");

      onSuccess();
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[100] animate-fade-in"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[110] animate-fade-in-up"
        style={{ animationDuration: "0.3s" }}
      >
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b divider flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-slate-900">
                  {existingHolding ? "继续购买" : "记录购买"}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {productName}
                </div>
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

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">购买日期</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input-field w-full px-4 py-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">净值</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={nav}
                    onChange={(e) => setNav(e.target.value)}
                    placeholder="1.0234"
                    className="input-field w-full px-4 py-3 text-base font-mono tabular"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">金额（元）</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="10000"
                    className="input-field w-full px-4 py-3 text-base font-mono tabular"
                  />
                </div>
              </div>

              {Number(amount) > 0 && Number(nav) > 0 && (
                <div className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 font-mono tabular">
                  ≈ {(Number(amount) / Number(nav)).toFixed(4)} 份
                </div>
              )}

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">备注（选填）</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：定投、加仓"
                  className="input-field w-full px-4 py-3 text-sm"
                />
              </div>

              {msg && (
                <div className="text-sm text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                  {msg}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t divider flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1 py-3 text-sm">
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
              >
                {saving ? "保存中..." : "确认"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}