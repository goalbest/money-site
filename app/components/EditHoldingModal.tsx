"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { getBankInfo, normalizeBank } from "../../lib/banks";
import BankSelect from "./BankSelect";

type Props = {
  open: boolean;
  holding: any;
  onClose: () => void;
  onSuccess: () => void;
};

export default function EditHoldingModal({ open, holding, onClose, onSuccess }: Props) {
  const [editAmount, setEditAmount] = useState("");
  const [editShares, setEditShares] = useState("");
  const [editNav, setEditNav] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editBank, setEditBank] = useState("");
  const [bankSelectOpen, setBankSelectOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [navLoading, setNavLoading] = useState(false);

  /* 打开时初始化：份额为 0 则自动算 */
  useEffect(() => {
    if (!open || !holding) return;

    const initAmount = String(holding.holding_amount || 0);
    const initNav = holding.products?.unit_nav
      ? Number(holding.products.unit_nav).toFixed(4)
      : "";

    setEditAmount(initAmount);
    setEditNav(initNav);
    setEditDate(holding.hold_date || "");
    setEditBank(holding.products?.bank || "");
    setMsg("");

    const rawShares = Number(holding.shares || 0);

    if (rawShares > 0) {
      // 有份额 → 直接用
      setEditShares(String(holding.shares));
    } else if (Number(initAmount) > 0 && Number(initNav) > 0) {
      // 没份额，但有金额 + 净值 → 算
      setEditShares((Number(initAmount) / Number(initNav)).toFixed(4));
    } else if (Number(initAmount) > 0 && !initNav && holding.products?.id) {
      // 没份额、没净值 → 异步查最新净值
      setEditShares("");
      (async () => {
        const { data } = await supabase
          .from("nav_history")
          .select("unit_nav")
          .eq("product_id", holding.products.id)
          .order("nav_date", { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          const nav = Number(data[0].unit_nav).toFixed(4);
          setEditNav(nav);
          if (Number(initAmount) > 0) {
            setEditShares((Number(initAmount) / Number(nav)).toFixed(4));
          }
        }
      })();
    } else {
      setEditShares(String(holding.shares || 0));
    }
  }, [open, holding]);

  /* 日期变化时查当日净值 */
  const fetchNavByDate = useCallback(
    async (date: string) => {
      if (!date || !holding?.products?.id) return;
      setNavLoading(true);
      try {
        const { data } = await supabase
          .from("nav_history")
          .select("nav_date, unit_nav")
          .eq("product_id", holding.products.id)
          .lte("nav_date", date)
          .order("nav_date", { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          const nav = Number(data[0].unit_nav).toFixed(4);
          setEditNav(nav);
          const a = Number(editAmount);
          if (a > 0) setEditShares((a / Number(nav)).toFixed(4));
        }
      } catch {}
      setNavLoading(false);
    },
    [holding, editAmount]
  );

  /* 三字段联动 */
  function handleNavChange(v: string) {
    setEditNav(v);
    const n = Number(v);
    const a = Number(editAmount);
    if (n > 0 && a > 0) setEditShares((a / n).toFixed(4));
  }
  function handleAmountChange(v: string) {
    setEditAmount(v);
    const a = Number(v);
    const n = Number(editNav);
    if (a > 0 && n > 0) setEditShares((a / n).toFixed(4));
  }
  function handleSharesChange(v: string) {
    setEditShares(v);
    const s = Number(v);
    const n = Number(editNav);
    if (s > 0 && n > 0) setEditAmount((s * n).toFixed(2));
  }

  if (!open || !holding) return null;

  async function handleSave() {
    setSaving(true);
    setMsg("");
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
      if (normalized && normalized !== holding.products?.bank && holding.products?.id) {
        await supabase
          .from("products")
          .update({ bank: normalized })
          .eq("id", holding.products.id);
      }

      localStorage.removeItem("cache_home_cache_v3");
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
        className="fixed bottom-0 left-0 right-0 z-[110] animate-slide-up"
        style={{ animationDuration: "0.3s" }}
      >
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col">
            {/* 头部 */}
            <div className="px-5 py-4 border-b divider flex items-center justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-slate-900">编辑持仓</div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {holding.products?.name}
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

            {/* 内容 */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* 银行 */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">
                  所属银行
                  <span className="ml-1 text-[10px] text-slate-300">（系统已自动识别，可修改）</span>
                </label>
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

              {/* 持仓日期 */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">持仓日期</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => {
                    setEditDate(e.target.value);
                    fetchNavByDate(e.target.value);
                  }}
                  className="input-field w-full px-4 py-3 text-sm tabular"
                />
                <div className="text-[10px] text-slate-400 mt-1.5">
                  {navLoading ? "正在查该日期净值..." : "修改日期后自动匹配当日净值"}
                </div>
              </div>

              {/* 净值 */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">单位净值</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  value={editNav}
                  onChange={(e) => handleNavChange(e.target.value)}
                  placeholder="1.0234"
                  className="input-field w-full px-4 py-3 text-base font-mono tabular"
                />
              </div>

              {/* 金额 / 份额 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">持仓金额（元）</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    className="input-field w-full px-4 py-3 text-base font-mono tabular"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">份额</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    value={editShares}
                    onChange={(e) => handleSharesChange(e.target.value)}
                    className="input-field w-full px-4 py-3 text-base font-mono tabular"
                  />
                </div>
              </div>

              {/* 联动提示 */}
              {Number(editNav) > 0 && Number(editAmount) > 0 && (
                <div className="px-3.5 py-2.5 rounded-xl bg-slate-50/70 text-[11px] text-slate-500 font-mono tabular">
                  ¥ {Number(editAmount).toLocaleString("zh-CN")} ÷ {Number(editNav).toFixed(4)} = {Number(editShares).toFixed(4)} 份
                </div>
              )}

              {msg && (
                <div className="text-sm text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                  {msg}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="px-5 py-4 border-t divider flex gap-2 flex-shrink-0">
              <button onClick={onClose} className="btn-secondary flex-1 py-3 text-sm">
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 银行选择 */}
      <BankSelect
        open={bankSelectOpen}
        current={editBank}
        onClose={() => setBankSelectOpen(false)}
        onSelect={(b) => setEditBank(b)}
      />
    </>
  );
}