"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { recalcHoldingFromTransactions, fetchNavByDate } from "../../lib/holdings";
import { addTradingDays, ensureTradingDay } from "../../lib/holidays";

type Props = {
  open: boolean;
  holding: any;
  onClose: () => void;
  onSuccess: () => void;
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcRedemption(
  dateStr: string,
  rules: { arrival_days?: number | null; confirm_days?: number | null; cutoff_time?: string | null }
) {
  const arrivalDays = rules.arrival_days ?? 1;
  const confirmDays = rules.confirm_days ?? 1;
  const cutoff = rules.cutoff_time;

  let t = new Date(dateStr + "T12:00:00");
  let note = "";

  const today = todayStr();
  if (dateStr === today && cutoff) {
    const [h, m] = cutoff.split(":").map(Number);
    const now = new Date();
    if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
      t = addTradingDays(t, 1);
      note = `已过 ${cutoff} 截止，顺延到下一个交易日`;
    }
  }

  t = ensureTradingDay(t);
  const confirmDate = addTradingDays(t, confirmDays);
  const arrivalDate = addTradingDays(t, arrivalDays);

  return {
    t: fmtDate(t),
    confirmDate: fmtDate(confirmDate),
    arrivalDate: fmtDate(arrivalDate),
    note,
    arrivalDays,
    confirmDays,
  };
}

export default function QuickSellModal({ open, holding, onClose, onSuccess }: Props) {
  const [shares, setShares] = useState("");
  const [nav, setNav] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [navLoading, setNavLoading] = useState(false);

  const navTouchedRef = useRef(false);
  const prevDateRef = useRef("");

  useEffect(() => {
    if (!open) return;
    const t = todayStr();
    const pid = holding?.products?.id;

    setShares("");
    setDate(t);
    prevDateRef.current = t;
    navTouchedRef.current = false;
    setNav(holding?.products?.unit_nav ? Number(holding.products.unit_nav).toFixed(4) : "");
    setNote("");
    setMsg("");

    if (!pid) return;
    let cancelled = false;
    setNavLoading(true);
    (async () => {
      const n = await fetchNavByDate(pid, t);
      if (!cancelled && n != null) setNav(n.toFixed(4));
      if (!cancelled) setNavLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, holding]);

  useEffect(() => {
    if (!open || !date) return;
    const pid = holding?.products?.id;
    if (!pid) return;
    if (prevDateRef.current === date) return;
    prevDateRef.current = date;
    if (navTouchedRef.current) return;

    let cancelled = false;
    setNavLoading(true);
    (async () => {
      const n = await fetchNavByDate(pid, date);
      if (!cancelled && n != null) setNav(n.toFixed(4));
      if (!cancelled) setNavLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, date, holding?.products?.id]);

  function handleNavChange(v: string) {
    navTouchedRef.current = true;
    setNav(v);
  }

  const currentShares = Number(holding?.shares || 0);
  const currentAmount = Number(holding?.holding_amount || 0);
  const sh = Number(shares);
  const navNum = Number(nav);
  const sellAmt = sh * navNum;

  const redemption = useMemo(() => {
    if (!date || !holding?.products) return null;
    const p = holding.products;
    if (p.redeem_arrival_days == null && p.redeem_confirm_days == null && !p.redeem_cutoff_time) {
      return null;
    }
    return calcRedemption(date, {
      arrival_days: p.redeem_arrival_days,
      confirm_days: p.redeem_confirm_days,
      cutoff_time: p.redeem_cutoff_time,
    });
  }, [date, holding?.products]);

  if (!open || !holding) return null;

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
      const isClosed = remainShares < 0.01;

      // 1. 插入交易记录
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

      // 2. 重算持仓（会把 shares=0 的置为 closed）
      await recalcHoldingFromTransactions(userId, holding.products.id);

      // 3. ★ 全部赎回 → 覆盖为 pending_sell
      if (isClosed) {
        const confirmDateStr = redemption?.confirmDate || (() => {
          const t = ensureTradingDay(new Date(date + "T12:00:00"));
          const c = addTradingDays(t, 1);
          return fmtDate(c);
        })();

        const { error: updErr } = await supabase
          .from("user_holdings")
          .update({
            status: "pending_sell",
            confirm_date: confirmDateStr,
            closed_amount: sellAmt,
            closed_at: null,
          })
          .eq("user_id", userId)
          .eq("product_id", holding.products.id);

        if (updErr) {
          console.error("pending_sell 更新失败:", updErr.message);
        } else {
          console.log(`✅ 已进入 pending_sell，确认日: ${confirmDateStr}`);
        }
      }

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
                <div className="text-[10px] text-slate-400 mt-1.5">
                  {navLoading ? "正在查该日期净值..." : "修改日期后自动匹配当日净值"}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">赎回净值</label>
                <input type="number" step="0.0001" value={nav}
                       onChange={(e) => handleNavChange(e.target.value)}
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
                  预计赎回金额：¥ {sellAmt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </div>
              )}

              {redemption && (
                <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="9" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
                    </svg>
                    <span className="text-[11px] font-semibold text-amber-700">赎回时间预估</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">交易日 T</span>
                    <span className="font-mono font-semibold text-slate-700 tabular">{redemption.t}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      收益截止日
                      <span className="text-[9px] text-slate-400 ml-1">(T+{redemption.confirmDays})</span>
                    </span>
                    <span className="font-mono font-semibold text-rose-600 tabular">{redemption.confirmDate}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      资金到账日
                      <span className="text-[9px] text-slate-400 ml-1">(T+{redemption.arrivalDays})</span>
                    </span>
                    <span className="font-mono font-semibold text-emerald-600 tabular">{redemption.arrivalDate}</span>
                  </div>

                  {redemption.note && (
                    <div className="text-[10px] text-amber-700 bg-amber-100/60 rounded-lg px-2.5 py-1.5 leading-relaxed">
                      ⚠️ {redemption.note}
                    </div>
                  )}

                  <div className="text-[9px] text-amber-600/80 leading-relaxed pt-1 border-t border-amber-100">
                    ⚠️ 到账时间为保守估计，复杂产品以银行公告为准
                  </div>
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