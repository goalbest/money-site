"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { recalcHoldingFromTransactions, fetchNavByDate } from "../../../lib/holdings";

type Props = {
  open: boolean;
  productId: number;
  productName: string;
  defaultNav?: number;
  existingHolding?: any;
  onClose: () => void;
  onSuccess: () => void;
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function QuickBuyModal({
  open, productId, productName, defaultNav, existingHolding, onClose, onSuccess,
}: Props) {
  const [date, setDate] = useState(todayStr());
  const [nav, setNav] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [navLoading, setNavLoading] = useState(false);

  /* ★ 用户是否手动改过净值输入框 */
  const navTouchedRef = useRef(false);
  /* ★ 上一次已处理的日期（避免重复触发） */
  const prevDateRef = useRef("");

  /* 打开时初始化 + 查一次当日净值 */
  useEffect(() => {
    if (!open) return;
    const t = todayStr();
    setDate(t);
    prevDateRef.current = t;
    navTouchedRef.current = false;
    setNav(defaultNav ? String(defaultNav) : "");
    setAmount("");
    setNote("");
    setMsg("");

    let cancelled = false;
    setNavLoading(true);
    (async () => {
      const n = await fetchNavByDate(productId, t);
      if (!cancelled && n != null) setNav(n.toFixed(4));
      if (!cancelled) setNavLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, productId, defaultNav]);

  /* ★ 日期变化 → 自动查净值（仅当用户未手动编辑过） */
  useEffect(() => {
    if (!open || !date) return;
    if (prevDateRef.current === date) return;   // 已处理过这个日期
    prevDateRef.current = date;
    if (navTouchedRef.current) return;           // 用户手改过 → 不覆盖

    let cancelled = false;
    setNavLoading(true);
    (async () => {
      const n = await fetchNavByDate(productId, date);
      if (!cancelled && n != null) setNav(n.toFixed(4));
      if (!cancelled) setNavLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, date, productId]);

  /* ★ 用户手动改净值 → 打标记，之后不再自动覆盖 */
  function handleNavChange(v: string) {
    navTouchedRef.current = true;
    setNav(v);
  }

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

      await recalcHoldingFromTransactions(userId, productId);

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
                  className="input-field w-full px-4 py-3 text-sm tabular"
                />
                <div className="text-[10px] text-slate-400 mt-1.5">
                  {navLoading ? "正在查该日期净值..." : "修改日期后自动匹配当日净值"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">净值</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={nav}
                    onChange={(e) => handleNavChange(e.target.value)}
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