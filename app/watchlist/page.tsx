"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { getBankInfo } from "../../lib/banks";

export default function WatchlistPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    setUserId(id);
    if (!id) {
      setLoading(false);
      return;
    }
    async function fetchData() {
      const { data } = await supabase
        .from("user_watchlist")
        .select("id, holding_amount, products(id, name, bank, unit_nav, annualized_1m, nav_date)")
        .eq("user_id", id);
      if (data) setItems(data);
      setLoading(false);
    }
    fetchData();
  }, []);

  async function updateAmount(watchId: number, amount: number) {
    await supabase.from("user_watchlist").update({ holding_amount: amount }).eq("id", watchId);
    setItems((prev) => prev.map((it) => (it.id === watchId ? { ...it, holding_amount: amount } : it)));
    setEditingId(null);
  }

  async function removeItem(watchId: number) {
    if (!confirm("确定要从自选中删除吗？")) return;
    await supabase.from("user_watchlist").delete().eq("id", watchId);
    setItems((prev) => prev.filter((it) => it.id !== watchId));
  }

  function startEdit(it: any) {
    setEditingId(it.id);
    setEditValue(String(it.holding_amount || ""));
  }

  /* 未登录 */
  if (!loading && !userId) {
    return (
      <div className="min-h-screen pb-24">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="text-[22px] font-bold tracking-tight text-slate-900 mb-5">
            我的自选
          </div>
        </div>
        <div className="flex items-center justify-center px-5 mt-8">
          <div className="max-w-sm w-full text-center animate-fade-in-up">
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl
                            bg-gradient-to-br from-violet-500 to-purple-600
                            flex items-center justify-center
                            shadow-xl shadow-purple-500/25">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div className="text-[20px] font-bold text-slate-900 mb-2">还没有登录</div>
            <div className="text-[13px] text-slate-400 mb-8 leading-relaxed">
              登录后查看你的自选产品
            </div>
            <Link href="/login" className="btn-primary inline-block text-sm px-8 py-3">
              去登录
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">

        {/* 顶部标题 */}
        <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">
              我的自选
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              {items.length > 0 ? `${items.length} 个关注的产品` : "关注感兴趣的产品"}
            </div>
          </div>
        </div>

        {/* 加载 */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-5 h-32 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          /* 空状态 */
          <div className="flex items-center justify-center px-1 mt-8">
            <div className="max-w-sm w-full text-center animate-fade-in-up">
              <div className="w-20 h-20 mx-auto mb-6 rounded-3xl
                              bg-gradient-to-br from-amber-400 to-orange-500
                              flex items-center justify-center
                              shadow-xl shadow-orange-500/25">
                <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <div className="text-[20px] font-bold text-slate-900 mb-2">还没有自选</div>
              <div className="text-[13px] text-slate-400 mb-8 leading-relaxed">
                在产品页点 ☆ 收藏感兴趣的产品
              </div>
              <Link href="/discover" className="btn-primary inline-block text-sm px-8 py-3">
                去发现好产品
              </Link>
            </div>
          </div>
        ) : (
          /* 列表 */
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
                  {/* 第一行：徽章 + 产品名 + 删除 */}
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
                        className="text-[13px] text-slate-900 font-semibold leading-snug truncate block hover:text-purple-600 transition-colors"
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

                  {/* 第二行：3 格数据 */}
                  <div className="grid grid-cols-3 gap-2 py-3 border-t divider">
                    {/* 持仓金额（可编辑） */}
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

                    {/* 近1月年化 */}
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

                    {/* 预估年收益 */}
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

                  {/* 净值日期（小字） */}
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
        )}
      </div>
    </div>
  );
}