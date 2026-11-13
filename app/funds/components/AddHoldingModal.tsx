"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

export default function AddHoldingModal({ 
  isOpen, onClose, userId, onSuccess, existingHolding
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  userId: string | null; 
  onSuccess: () => void;
  existingHolding?: any; 
}) {
  
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formShares, setFormShares] = useState("");
  const [formPrice, setFormPrice] = useState(""); 
  const [formFee, setFormFee] = useState(""); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (existingHolding) {
        setFormCode(existingHolding.code || "");
        setFormName(existingHolding.name || "");
        setFormPrice(existingHolding.current_price?.toString() || "");
      } else {
        setFormCode(""); setFormName(""); setFormShares(""); setFormPrice(""); setFormFee("");
      }
    }
  }, [isOpen, existingHolding]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!formCode || !formName || !formShares || !formPrice) {
      alert("请填写股票代码、名称、股数和价格"); return;
    }
    if (!userId) { alert("请先登录"); return; }

    setIsSubmitting(true);
    try {
      const price = Number(formPrice);
      const shares = Number(formShares);
      const fee = Number(formFee || 0);
      const amount = price * shares;

      let { data: prod } = await supabase.from("fund_stocks").select("id").eq("code", formCode).maybeSingle();
      
      if (!prod) {
        const { data: newProd, error: createErr } = await supabase.from("fund_stocks").insert({
          code: formCode, name: formName, type: "stock", current_price: price, prev_price: price, nav_date: new Date().toISOString().split("T")[0]
        }).select("id").single();
        if (createErr) throw new Error("创建产品失败: " + createErr.message);
        prod = newProd;
      }

      const { data: currentHold } = await supabase
        .from("fund_stock_holdings")
        .select("*")
        .eq("user_id", userId)
        .eq("product_id", prod!.id)
        .maybeSingle();

      let newShares = Number(currentHold?.shares || 0);
      let newAvgCost = Number(currentHold?.avg_cost || currentHold?.cost_price || 0);
      
      if (tradeType === "buy") {
        const totalCostBefore = newShares * newAvgCost;
        const totalCostAfter = totalCostBefore + amount + fee;
        newShares += shares;
        newAvgCost = newShares > 0 ? totalCostAfter / newShares : 0;
      } else {
        if (newShares < shares) throw new Error("持仓股数不足，无法卖出");
        const totalCostBefore = newShares * newAvgCost;
        const totalCostAfter = totalCostBefore - amount + fee;
        newShares -= shares;
        newAvgCost = newShares > 0 ? totalCostAfter / newShares : 0;
        if (newAvgCost < 0) newAvgCost = 0; 
      }

      await supabase.from("fund_stock_holdings").upsert({
        user_id: userId,
        product_id: prod!.id,
        shares: newShares,
        cost_price: newAvgCost,
        avg_cost: newAvgCost,
        status: newShares > 0 ? "active" : "closed"
      }, { onConflict: "user_id,product_id" });

      await supabase.from("fund_stock_transactions").insert({
        user_id: userId,
        product_id: prod!.id,
        type: tradeType,
        shares: shares,
        price: price,
        amount: amount,
        trade_date: new Date().toISOString().split("T")[0]
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 animate-slide-up border border-white/50 shadow-2xl">
        <h3 className="text-[17px] font-bold text-slate-900 mb-5">交易记录</h3>
        <div className="space-y-4">
          
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setTradeType("buy")} className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${tradeType === "buy" ? "bg-white shadow-sm text-rose-500" : "text-slate-500"}`}>买入</button>
            <button onClick={() => setTradeType("sell")} className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${tradeType === "sell" ? "bg-white shadow-sm text-emerald-500" : "text-slate-500"}`}>卖出</button>
          </div>

          {!existingHolding && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-[11px] text-slate-500 mb-1.5">代码</label><input type="text" value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="如 600673" className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none outline-none" /></div>
              <div><label className="block text-[11px] text-slate-500 mb-1.5">名称</label><input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="如 东阳光" className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none outline-none" /></div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1.5">交易股数</label><input type="number" value={formShares} onChange={e => setFormShares(e.target.value)} placeholder="100" className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none outline-none" /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1.5">成交价格</label><input type="number" value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="23.50" className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none outline-none" /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1.5">手续费</label><input type="number" value={formFee} onChange={e => setFormFee(e.target.value)} placeholder="5.00" className="w-full px-3 py-2.5 text-[13px] rounded-xl bg-slate-50 border-none outline-none" /></div>
          </div>
          
          <div className="bg-slate-50 rounded-xl p-3 text-[12px] text-slate-500 flex justify-between">
            <span>预计发生金额：</span>
            <span className="font-mono font-bold text-slate-900">¥{(Number(formShares) * Number(formPrice) || 0).toFixed(2)}</span>
          </div>
        </div>
        
        <div className="flex gap-2 mt-8">
          <button disabled={isSubmitting} onClick={onClose} className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-medium rounded-2xl active:scale-95 transition-all">取消</button>
          <button disabled={isSubmitting} onClick={handleSubmit} className={`flex-[2] py-3.5 text-white rounded-2xl font-bold active:scale-95 transition-all ${tradeType === "buy" ? "bg-rose-500" : "bg-emerald-500"}`}>{isSubmitting ? "保存中..." : (tradeType === "buy" ? "确认买入" : "确认卖出")}</button>
        </div>
      </div>
    </div>
  );
}