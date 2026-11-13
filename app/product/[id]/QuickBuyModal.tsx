"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

export default function QuickBuyModal({
  open, onClose, productId, productName, defaultNav, existingHolding, onSuccess
}: {
  open: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
  defaultNav?: number;
  existingHolding?: any;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nav = defaultNav || 1;

  useEffect(() => {
    if (open) {
      setAmount(""); setShares("");
      setDate(new Date().toISOString().split("T")[0]);
    }
  }, [open]);

  // 金额和份额联动计算
  const handleAmountChange = (val: string) => {
    setAmount(val);
    const num = Number(val);
    if (num > 0 && nav > 0) {
      setShares((num / nav).toFixed(4));
    } else {
      setShares("");
    }
  };

  const handleSharesChange = (val: string) => {
    setShares(val);
    const num = Number(val);
    if (num > 0 && nav > 0) {
      setAmount((num * nav).toFixed(2));
    } else {
      setAmount("");
    }
  };

  const handleSave = async () => {
    if (!amount || !shares) { alert("请输入金额或份额"); return; }
    const userId = localStorage.getItem("user_id");
    if (!userId) return;

    setIsSubmitting(true);
    try {
      const buyAmount = Number(amount);
      const buyShares = Number(shares);

      // 1. 记录交易流水
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: userId,
        product_id: productId,
        type: "buy",
        amount: buyAmount,
        shares: buyShares,
        price: nav,
        trade_date: date,
        note: "加仓"
      });
      if (txErr) throw txErr;

      // 2. 更新或插入持仓表
      const { data: current } = await supabase
        .from("user_holdings")
        .select("*")
        .eq("user_id", userId)
        .eq("product_id", productId)
        .maybeSingle();

      if (current) {
        // 已有持仓，累加
        await supabase.from("user_holdings").update({
          shares: Number(current.shares || 0) + buyShares,
          purchase_amount: Number(current.purchase_amount || 0) + buyAmount,
          holding_amount: Number(current.holding_amount || 0) + buyAmount,
          status: "active"
        }).eq("id", current.id);
      } else {
        // 首次买入
        await supabase.from("user_holdings").insert({
          user_id: userId,
          product_id: productId,
          shares: buyShares,
          purchase_amount: buyAmount,
          holding_amount: buyAmount,
          hold_date: date,
          status: "active"
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      alert("保存失败: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 animate-slide-up border border-white/50 shadow-2xl">
        <h3 className="text-[17px] font-bold text-slate-900 mb-1">加仓 / 买入</h3>
        <p className="text-[12px] text-slate-500 mb-5 truncate">{productName}</p>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">买入金额（元）</label>
              <input type="number" value={amount} onChange={e => handleAmountChange(e.target.value)} placeholder="0.00" className="w-full px-3 py-2.5 text-[15px] font-bold font-mono rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">确认份额</label>
              <input type="number" value={shares} onChange={e => handleSharesChange(e.target.value)} placeholder="0.0000" className="w-full px-3 py-2.5 text-[15px] font-bold font-mono rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">成交净值</label>
              <div className="w-full px-3 py-2.5 text-[15px] font-mono text-slate-500 rounded-xl bg-slate-100 border-none">
                {nav.toFixed(4)}
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">买入日期</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-8">
          <button disabled={isSubmitting} onClick={onClose} className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-medium rounded-2xl active:scale-95 transition-all">取消</button>
          <button disabled={isSubmitting} onClick={handleSave} className="flex-[2] py-3.5 bg-purple-600 text-white rounded-2xl font-bold active:scale-95 transition-all shadow-md shadow-purple-500/20">
            {isSubmitting ? "提交中..." : "确认买入"}
          </button>
        </div>
      </div>
    </div>
  );
}