"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { recalcHoldingFromTransactions } from "../../lib/holdings";
import PageHeader from "../PageHeader";
import { useCachedFetch, SkeletonPage } from "../useCachedFetch";
import SwipeToDelete from "../components/SwipeToDelete";

export default function TransactionsPage() {
  const [filter, setFilter] = useState<"all" | "buy" | "sell" | "close">("all");
  const [localRemoved, setLocalRemoved] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading } = useCachedFetch(`transactions-${refreshKey}`, async () => {
    const userId = localStorage.getItem("user_id");
    if (!userId) return { records: [] };

    const [txsRes, closedRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, type, amount, shares, price, trade_date, note, created_at, products(id, name, bank)")
        .eq("user_id", userId)
        .order("trade_date", { ascending: false })
        .order("id", { ascending: false }),
      supabase
        .from("user_holdings")
        .select("id, holding_amount, closed_amount, closed_at, products(id, name, bank)")
        .eq("user_id", userId)
        .eq("status", "closed"),
    ]);

    const merged: any[] = [];

    (txsRes.data || []).forEach(t => {
      merged.push({
        kind: "transaction",
        txId: t.id,
        id: `tx-${t.id}`,
        type: t.type,
        name: t.products?.name || "未知产品",
        bank: t.products?.bank || "",
        productId: t.products?.id,
        amount: Number(t.amount || 0),
        date: t.trade_date || t.created_at?.split("T")[0],
        note: t.note,
      });
    });

    (closedRes.data || []).forEach(c => {
      merged.push({
        kind: "close",
        id: `close-${c.id}`,
        type: "close",
        name: c.products?.name || "未知产品",
        bank: c.products?.bank || "",
        productId: c.products?.id,
        amount: Number(c.closed_amount || c.holding_amount || 0),
        date: c.closed_at?.split("T")[0] || "",
        note: "已清仓",
      });
    });

    merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return { records: merged };
  });

  if (loading || !data) return <SkeletonPage />;

  const records = data.records.filter((r: any) => !localRemoved.has(r.id));
  const totalBuy = records.filter((r: any) => r.type === "buy").reduce((s: number, r: any) => s + r.amount, 0);
  const totalSell = records.filter((r: any) => r.type === "sell" || r.type === "close").reduce((s: number, r: any) => s + r.amount, 0);
  const filtered = filter === "all" ? records : records.filter((r: any) => r.type === filter);

  const typeMeta: Record<string, { text: string; cls: string; sign: string }> = {
    buy:   { text: "买入", cls: "text-rose-500 bg-rose-50",       sign: "+" },
    sell:  { text: "赎回", cls: "text-amber-600 bg-amber-50",     sign: "-" },
    close: { text: "清仓", cls: "text-slate-500 bg-slate-100",    sign: "" },
  };

  const TABS = [
    { key: "all",   label: "全部" },
    { key: "buy",   label: "买入" },
    { key: "sell",  label: "赎回" },
    { key: "close", label: "清仓" },
  ];

  async function handleDelete(r: any) {
    // 只有真实交易能删（合成清仓记录不能）
    if (r.kind !== "transaction") {
      alert("这是清仓记录，请到产品详情页操作");
      return;
    }

    const userId = localStorage.getItem("user_id");
    if (!userId) return;
    if (!confirm(`删除这笔交易吗？\n\n${r.date}  ¥${r.amount.toLocaleString("zh-CN")}\n\n${r.name}\n\n该产品持仓会根据剩余交易重算。`)) {
      return;
    }

    await supabase.from("transactions").delete().eq("id", r.txId);
    await recalcHoldingFromTransactions(userId, r.productId);

    localStorage.removeItem("cache_home_cache_v3");
    localStorage.removeItem("cache_transactions");
    localStorage.removeItem("cache_holdings");

    setLocalRemoved(prev => new Set(prev).add(r.id));
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        <PageHeader title="交易记录" backHref="/profile" />

        {/* 汇总 Hero */}
        {records.length > 0 && (
          <div className="card-hero p-6 mb-5 animate-fade-in-up">
            <div className="dot-pattern" />
            <div className="relative z-10">
              <div className="text-[11px] text-white/70 tracking-wider mb-4">
                累计
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-white/65 mb-1.5">累计买入</div>
                  <div className="font-mono font-bold text-[20px] text-white tabular leading-none">
                    {totalBuy.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-white/65 mb-1.5">累计赎回/清仓</div>
                  <div className="font-mono font-bold text-[20px] text-white tabular leading-none">
                    {totalSell.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[10px] text-white/60">
                <span>共 {records.length} 笔</span>
                <span className="font-mono tabular">
                  净流入 {totalBuy - totalSell >= 0 ? "+" : "-"}
                  {Math.abs(totalBuy - totalSell).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 筛选 chips */}
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar -mx-5 px-5 animate-fade-in-up delay-1">
          {TABS.map(t => {
            const isActive = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key as any)}
                className={`px-4 py-1.5 rounded-full text-[12px] font-medium flex-shrink-0
                            transition-all active:scale-95
                            ${isActive
                              ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md shadow-purple-500/25"
                              : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* 列表 */}
        {filtered.length === 0 ? (
          <div className="card p-12 text-center animate-fade-in-up delay-2">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-50 flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="text-slate-400 text-[13px] mb-4">
              {records.length === 0 ? "还没有交易记录" : "没有此类记录"}
            </div>
            {records.length === 0 && (
              <Link href="/add" className="btn-primary inline-block text-[13px] px-6 py-2.5">
                去添加第一个产品
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in-up delay-2">
            {filtered.map((r: any) => {
              const meta = typeMeta[r.type] || typeMeta.buy;
              const canDelete = r.kind === "transaction";
              const href = canDelete
                ? `/transactions/${r.txId}`
                : (r.productId ? `/product/${r.productId}` : "#");

              const row = (
                <Link
                  href={href}
                  className="block bg-white rounded-[18px] p-4
                             shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)]
                             hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_8px_20px_rgba(15,23,42,0.07)]
                             active:scale-[0.99]
                             transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}>
                      {meta.text}
                    </span>
                    <h3 className="font-medium text-slate-900 text-[13px] leading-snug truncate flex-1">
                      {r.name}
                    </h3>
                  </div>

                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-slate-400 mb-0.5">金额（元）</div>
                      <div className="text-[15px] font-mono font-bold text-slate-900 tabular">
                        {meta.sign}{r.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {r.bank && <div className="text-[10px] text-slate-400 mt-1">{r.bank}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 font-mono tabular">{r.date}</div>
                      {r.note && <div className="text-[10px] text-slate-300 mt-0.5 truncate max-w-[120px]">{r.note}</div>}
                    </div>
                  </div>
                </Link>
              );

              return canDelete ? (
                <SwipeToDelete key={r.id} onDelete={() => handleDelete(r)}>
                  {row}
                </SwipeToDelete>
              ) : (
                <div key={r.id}>{row}</div>
              );
            })}
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}