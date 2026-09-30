"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { getBankInfo } from "../../lib/banks";

export default function WatchlistPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  async function load() {
    const userId = localStorage.getItem("user_id");
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from("user_watchlist")
      .select("id, holding_amount, products(id, name, bank, unit_nav, annualized_1m, nav_date)")
      .eq("user_id", userId);
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateAmount(watchId: number, amount: number) {
    await supabase.from("user_watchlist").update({ holding_amount: amount }).eq("id", watchId);
    setItems(prev => prev.map(it => it.id === watchId ? { ...it, holding_amount: amount } : it));
    setEditingId(null);
  }

  async function removeItem(watchId: number) {
    if (!confirm("确定要从自选中删除吗？")) return;
    await supabase.from("user_watchlist").delete().eq("id", watchId);
    setItems(prev => prev.filter(it => it.id !== watchId));
  }

  function startEdit(it: any) {
    setEditingId(it.id);
    setEditValue(String(it.holding_amount || ""));
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="card p-5 h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl
                        bg-gradient-to-br from-amber-400 to-orange-500
                        flex items-center justify-center
                        shadow-lg shadow-orange-500/25">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>
        <div className="text-[16px] font-bold text-slate-900 mb-2">还没有自选</div>
        <div className="text-[12px] text-slate-400 mb-6 leading-relaxed">
          在产品页点 ☆ 收藏感兴趣的产品<br />之后会出现在这里
        </div>
        <Link href="/discover" className="btn-primary inline-block text-xs px-6 py-2.5">
          去发现好产品
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((it, idx) => {
        const p = it.products;
        if (!p) return null;
        const info = getBankInfo(p.bank);
        const annual = Number(p.annualized_1m) || 0;
        const amount = Number(it.holding_amount) || 0;
        const estimate = (amount * annual) / 100;
        const isEditing = editingId === it.id;

        return (
          <div
            key={it.id}
            className="card p-4 animate-fade-in-up"
            style={{ animationDelay: `${0.04 * Math.min(idx, 8)}s` }}
          >
            <div className="flex items-start gap-3 mb-3">
              <span
                className="bank-avatar flex-shrink-0 mt-0.5"
                style={{ background: info.bg, color: info.color }}
              >
                {info.label}
              </span>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/product/${p.id}`}
                  className="text-[13px] text-slate-900 font-semibold leading-snug truncate block
                             hover:text-purple-600 transition-colors"
                >
                  {p.name}
                </Link>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                  <span className="truncate">{p.bank}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono tabular">
                    净值 {p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => removeItem(it.id)}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                           hover:bg-rose-50 active:scale-90 transition-all"
                aria-label="删除"
              >
                <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 py-3 border-t divider">
              <div>
                <div className="text-[10px] text-slate-400 mb-1">持仓金额</div>
                {isEditing ? (
                  <input
                    type="number"
                    value={editValue}
                    autoFocus
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => updateAmount(it.id, Number(editValue) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateAmount(it.id, Number(editValue) || 0);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="input-field w-full px-2 py-1 text-[12px] font-mono tabular"
                  />
                ) : (
                  <button
                    onClick={() => startEdit(it)}
                    className="text-left w-full group"
                  >
                    <div className="text-[14px] font-bold font-mono text-slate-900 tabular truncate
                                    group-hover:text-purple-600 transition-colors">
                      {amount > 0 ? `¥${amount.toLocaleString("zh-CN")}` : "点击设置"}
                    </div>
                  </button>
                )}
              </div>

              <div className="text-center">
                <div className="text-[10px] text-slate-400 mb-1">近1月年化</div>
                <div className={`text-[14px] font-bold font-mono tabular ${
                  annual > 0 ? "text-rose-500"
                  : annual < 0 ? "text-emerald-500"
                  : "text-slate-400"
                }`}>
                  {annual >= 0 ? "+" : ""}{annual.toFixed(2)}%
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] text-slate-400 mb-1">预估年收益</div>
                <div className={`text-[14px] font-bold font-mono tabular ${
                  estimate > 0 ? "text-rose-500"
                  : estimate < 0 ? "text-emerald-500"
                  : "text-slate-400"
                }`}>
                  {estimate >= 0 ? "+" : ""}{estimate.toFixed(2)}
                </div>
              </div>
            </div>

            {p.nav_date && (
              <div className="pt-2 flex items-center gap-1.5">
                <span className="w-1 h-1 bg-emerald-400 rounded-full" />
                <span className="text-[10px] text-slate-400">
                  净值更新至 {p.nav_date}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}