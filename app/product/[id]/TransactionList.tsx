"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

export default function TransactionList({ productId }: { productId: number }) {
  const [records, setRecords] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      const [txRes, hdRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .eq("product_id", productId)
          .order("trade_date", { ascending: false })
          .order("id", { ascending: false }),
        supabase
          .from("user_holdings")
          .select("id, holding_amount, shares, status, hold_date, closed_at")
          .eq("user_id", userId)
          .eq("product_id", productId)
          .maybeSingle(),
      ]);

      setRecords(txRes.data || []);
      setHoldings(hdRes.data || null);
      setLoading(false);
    }
    fetchData();
  }, [productId]);

  if (loading) {
    return <div className="text-gray-400 text-sm py-8 text-center">加载中...</div>;
  }

  // 未登录
  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
  if (!userId) {
    return (
      <div className="text-gray-400 text-sm py-8 text-center">
        登录后查看交易记录
      </div>
    );
  }

  // 无记录
  if (records.length === 0 && !holdings) {
    return (
      <div className="text-gray-400 text-sm py-8 text-center">
        还没有交易记录
      </div>
    );
  }

  // 汇总
  const totalBuy = records.filter(r => r.type === "buy").reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSell = records.filter(r => r.type === "sell" || r.type === "close").reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSharesBought = records.filter(r => r.type === "buy").reduce((s, r) => s + Number(r.shares || 0), 0);
  const totalSharesSold = records.filter(r => r.type === "sell" || r.type === "close").reduce((s, r) => s + Number(r.shares || 0), 0);

  const typeMeta: Record<string, { text: string; cls: string; sign: string }> = {
    buy:   { text: "买入", cls: "text-blue-600 bg-blue-50",     sign: "+" },
    sell:  { text: "赎回", cls: "text-orange-600 bg-orange-50", sign: "-" },
    close: { text: "清仓", cls: "text-gray-600 bg-gray-100",    sign: "" },
  };

  return (
    <div>
      {/* 当前持仓 */}
      {holdings && (
        <div className={`rounded-xl p-3.5 mb-4 ${
          holdings.status === "closed" ? "bg-gray-50" : "bg-gradient-to-r from-blue-50 to-indigo-50"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-gray-500">当前状态</div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
              holdings.status === "closed" ? "bg-gray-200 text-gray-600" : "bg-green-100 text-green-700"
            }`}>
              {holdings.status === "closed" ? "已清仓" : "持有中"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-base font-bold font-mono text-gray-900">
                {Number(holdings.holding_amount || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">持仓金额</div>
            </div>
            <div>
              <div className="text-base font-bold font-mono text-gray-900">
                {Number(holdings.shares || 0).toFixed(4)}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">份额</div>
            </div>
            <div>
              <div className="text-sm font-mono text-gray-700">
                {holdings.status === "closed" && holdings.closed_at
                  ? holdings.closed_at.split("T")[0]
                  : holdings.hold_date || "—"}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {holdings.status === "closed" ? "清仓日" : "买入日"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 累计统计 */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-[10px] text-gray-400 mb-1">累计买入</div>
            <div className="text-sm font-bold font-mono text-gray-800">
              ¥{totalBuy.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">{totalSharesBought.toFixed(2)} 份</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-[10px] text-gray-400 mb-1">累计赎回</div>
            <div className="text-sm font-bold font-mono text-gray-800">
              ¥{totalSell.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">{totalSharesSold.toFixed(2)} 份</div>
          </div>
        </div>
      )}

      {/* 交易记录列表 */}
      <div className="space-y-0">
        {records.map(r => {
          const meta = typeMeta[r.type] || typeMeta.buy;
          return (
            <div key={r.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-b-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-[10px] font-medium px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0 ${meta.cls}`}>
                  {meta.text}
                </span>
                <div className="min-w-0">
                  <div className="text-xs text-gray-600 font-mono">{r.trade_date}</div>
                  {r.note && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{r.note}</div>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold font-mono text-gray-900">
                  {meta.sign}{Number(r.amount || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {r.shares ? `${Number(r.shares).toFixed(2)} 份` : ""}
                  {r.price ? ` · ${Number(r.price).toFixed(4)}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}