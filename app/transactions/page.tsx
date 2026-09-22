"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import PageHeader from "../PageHeader";
import { useCachedFetch, SkeletonPage } from "../useCachedFetch";

export default function TransactionsPage() {
  const [filter, setFilter] = useState<"all" | "buy" | "sell" | "close">("all");

  const { data, loading } = useCachedFetch("transactions", async () => {
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

  const records = data.records;
  const totalBuy = records.filter(r => r.type === "buy").reduce((s, r) => s + r.amount, 0);
  const totalSell = records.filter(r => r.type === "sell" || r.type === "close").reduce((s, r) => s + r.amount, 0);
  const filtered = filter === "all" ? records : records.filter(r => r.type === filter);

  const typeMeta: Record<string, { text: string; cls: string; sign: string }> = {
    buy:   { text: "买入", cls: "text-blue-600 bg-blue-50",     sign: "+" },
    sell:  { text: "赎回", cls: "text-orange-600 bg-orange-50", sign: "-" },
    close: { text: "清仓", cls: "text-gray-600 bg-gray-100",    sign: "" },
  };

  const TABS = [
    { key: "all",   label: "全部" },
    { key: "buy",   label: "买入" },
    { key: "sell",  label: "赎回" },
    { key: "close", label: "清仓" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="交易记录" backHref="/profile" />

      <div className="container mx-auto px-4 -mt-4 max-w-3xl">
        {/* 汇总 */}
        {records.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-[10px] text-gray-400 mb-1">累计买入</div>
              <div className="text-lg font-bold font-mono text-gray-900">
                {totalBuy.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-[10px] text-gray-400 mb-1">累计赎回/清仓</div>
              <div className="text-lg font-bold font-mono text-gray-900">
                {totalSell.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}

        {/* 筛选 */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key as any)}
              className={`px-4 py-1.5 text-xs rounded-full whitespace-nowrap transition ${
                filter === t.key
                  ? "bg-blue-600 text-white font-medium shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 列表 */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto rounded-full bg-gray-50 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="text-gray-400 text-sm">
              {records.length === 0 ? "还没有交易记录" : "没有此类记录"}
            </div>
            {records.length === 0 && (
              <Link href="/add" className="inline-block mt-4 text-blue-600 text-sm hover:underline">
                去添加第一个产品 →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(r => {
              const meta = typeMeta[r.type] || typeMeta.buy;
              return (
                <Link
                  key={r.id}
                  href={r.productId ? `/product/${r.productId}` : "#"}
                  className="block bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${meta.cls}`}>
                      {meta.text}
                    </span>
                    <h3 className="font-medium text-gray-900 text-sm leading-snug truncate flex-1">{r.name}</h3>
                  </div>

                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-gray-400 mb-0.5">金额（元）</div>
                      <div className="text-base font-bold font-mono text-gray-900">
                        {meta.sign}{r.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {r.bank && <div className="text-[10px] text-gray-400 mt-1">{r.bank}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 font-mono">{r.date}</div>
                      {r.note && <div className="text-[10px] text-gray-300 mt-0.5">{r.note}</div>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}