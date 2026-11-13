"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

export default function UpdateCashModal({
  isOpen, onClose, userId, currentAmount, onSuccess
}: {
  isOpen: boolean; onClose: () => void; userId: string | null; currentAmount: number; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 初始化时保留两位小数
      setAmount(currentAmount > 0 ? currentAmount.toFixed(2) : "");
    }
  }, [isOpen, currentAmount]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!userId) return;
    const val = Number(amount || 0);
    
    if (isNaN(val) || val < 0) { 
      alert("请输入正确的金额"); 
      return; 
    }

    setIsSubmitting(true);
    try {
      // 1. 检查是否有现金账户
      let { data: prod } = await supabase.from("fund_stocks").select("id").eq("code", "CASH_ACCOUNT").maybeSingle();
      
      if (!prod) {
        const { data: newProd, error } = await supabase.from("fund_stocks").insert({
          code: "CASH_ACCOUNT", name: "可用余额", type: "cash", current_price: val, prev_price: val, nav_date: new Date().toISOString().split("T")[0]
        }).select("id").single();
        if (error) throw error;
        prod = newProd;
      } else {
        await supabase.from("fund_stocks").update({ current_price: val }).eq("id", prod.id);
      }

      // 2. 更新持仓表
      await supabase.from("fund_stock_holdings").upsert({
        user_id: userId,
        product_id: prod.id,
        shares: 1,
        cost_price: 0,
        avg_cost: 0,
        status: "active"
      }, { onConflict: "user_id,product_id" });

      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative bg-white w-full max-w-xs rounded-[28px] p-6 animate-slide-up shadow-2xl">
        <h3 className="text-[16px] font-bold text-slate-900 mb-4 text-center">更新可用余额</h3>
        <div className="relative mb-6">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-sans text-[20px]">¥</span>
          <input 
            type="text" 
            inputMode="decimal" 
            value={amount} 
            onChange={e => {
              // ★ 核心修复：限制只能输入数字和一个小数点，且最多两位小数
              const val = e.target.value;
              if (/^\d*\.?\d{0,2}$/.test(val) || val === "") {
                setAmount(val);
              }
            }} 
            className="w-full pl-10 pr-4 py-3 text-[24px] font-mono font-bold text-slate-900 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-purple-200 transition-all placeholder:text-slate-300"
            placeholder="0.00"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <button disabled={isSubmitting} onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-medium rounded-xl active:scale-95 transition-all">取消</button>
          <button disabled={isSubmitting} onClick={handleSave} className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl active:scale-95 transition-all">保存</button>
        </div>
      </div>
    </div>
  );
}