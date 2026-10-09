"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { recalcHoldingFromTransactions } from "../../../lib/holdings";
import TransactionEditModal from "../../components/TransactionEditModal";
import SwipeToDelete from "../../components/SwipeToDelete";

type Tx = {
  id: number;
  type: string;
  amount: number;
  shares: number;
  price: number | null;
  trade_date: string;
  note: string | null;
  product_id: number;
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  buy: { label: "买入", color: "text-rose-500 bg-rose-50" },
  sell: { label: "赎回", color: "text-amber-600 bg-amber-50" },
  close: { label: "清仓", color: "text-slate-600 bg-slate-100" },
};

export default function TransactionList({
  productId,
  disabled = false,
}: {
  productId: number;
  disabled?: boolean;
}) {
  const [list, setList] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const userId = localStorage.getItem("user_id");
      if (!userId) { setLoading(false); return; }

      const { data } = await supabase
        .from("transactions")
        .select("id, type, amount, shares, price, trade_date, note, product_id")
        .eq("user_id", userId)
        .eq("product_id", productId)
        .order("trade_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(30);

      if (cancelled) return;
      setList(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [productId, refreshKey]);

  async function handleDelete(tx: Tx) {
    const userId = localStorage.getItem("user_id");
    if (!userId) return;
    if (!confirm(`删除这笔交易吗？\n\n${tx.trade_date}  ¥${Number(tx.amount).toLocaleString("zh-CN")}\n\n该产品持仓会根据剩余交易重算。`)) {
      return;
    }

    await supabase.from("transactions").delete().eq("id", tx.id);
    await recalcHoldingFromTransactions(userId, tx.product_id);

    localStorage.removeItem("cache_home_cache_v3");
    localStorage.removeItem("cache_transactions");
    localStorage.removeItem("cache_holdings");

    setRefreshKey(k => k + 1);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tx-updated"));
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="py-8 text-center text-slate-300 text-[12px]">
        还没有交易记录
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {list.map(tx => {
          const info = TYPE_LABELS[tx.type] || { label: tx.type, color: "text-slate-500 bg-slate-100" };
          return (
            <SwipeToDelete
              key={tx.id}
              onDelete={() => handleDelete(tx)}
              disabled={disabled}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  setEditing(tx);
                }}
                disabled={disabled}
                className={`w-full flex items-center gap-3 py-3.5 px-4 rounded-[18px]
                           bg-white
                           shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)]
                           group transition-all duration-200 text-left
                           ${disabled
                             ? "cursor-default"
                             : "hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_8px_20px_rgba(15,23,42,0.07)] active:scale-[0.99]"}`}
              >
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${info.color}`}>
                  {info.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-slate-700 font-medium truncate">
                    {tx.note || info.label}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 tabular">
                    {tx.trade_date}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono font-semibold text-[13px] text-slate-900 tabular">
                    ¥{Number(tx.amount || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular">
                    {Number(tx.shares || 0).toFixed(4)} 份
                  </div>
                </div>
                {!disabled && (
                  <svg
                    className="w-3.5 h-3.5 text-slate-300 group-hover:text-purple-500
                               flex-shrink-0 transition-colors"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </SwipeToDelete>
          );
        })}
      </div>

      {editing && (
        <TransactionEditModal
          tx={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRefreshKey(k => k + 1);
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("tx-updated"));
            }
          }}
        />
      )}
    </>
  );
}