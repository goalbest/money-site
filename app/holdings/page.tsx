"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function HoldingsPage() {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      const { data } = await supabase
        .from("user_holdings")
        .select("id, holding_amount, in_transit_amount, products(id, name, bank, category, unit_nav, annualized_1m, daily_return, nav_date)")
        .eq("user_id", userId);
      if (data) setHoldings(data);
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  // 按银行/平台分组
  const grouped: Record<string, any[]> = {};
  holdings.forEach(h => {
    const key = h.products?.bank || "其他";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(h);
  });

  const groupSummary = Object.entries(grouped).map(([bank, items]) => {
    const total = items.reduce((s, h) => s + Number(h.holding_amount || 0), 0);
    const inTransit = items.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
    const todayProfit = items.reduce((s, h) => {
      const daily = Number(h.products?.daily_return || 0);
      const amount = Number(h.holding_amount || 0);
      return s + (amount * daily / 10000);
    }, 0);
    return { bank, items, total, inTransit, todayProfit };
  }).sort((a, b) => b.total - a.total);

  const totalAssets = holdings.reduce(
    (s, h) => s + Number(h.holding_amount || 0) + Number(h.in_transit_amount || 0),
    0
  );
  const totalProfit = holdings.reduce((s, h) => {
    const daily = Number(h.products?.daily_return || 0);
    const amount = Number(h.holding_amount || 0);
    return s + (amount * daily / 10000);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部汇总 */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 pb-16 rounded-b-3xl shadow-lg">
        <div className="container mx-auto px-4 pt-8 max-w-3xl">
          <h1 className="text-white text-base font-bold mb-5">我的持仓</h1>

          <div className="text-white">
            <div className="text-xs text-blue-100 mb-1">总资产（元）</div>
            <div className="text-3xl font-bold font-mono tracking-tight mb-3">
              {totalAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex gap-6 text-xs">
              <div>
                <div className="text-blue-100">持仓数</div>
                <div className="font-mono font-medium text-sm">{holdings.length}</div>
              </div>
              <div>
                <div className="text-blue-100">今日收益</div>
                <div className={`font-mono font-medium text-sm ${totalProfit > 0 ? "text-red-200" : ""}`}>
                  {totalProfit >= 0 ? "+" : ""}{totalProfit.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-8 max-w-3xl">
        {groupSummary.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="text-gray-400 text-sm mb-4">还没有添加任何产品</div>
            <Link href="/add" className="inline-block bg-blue-600 text-white text-sm px-6 py-2 rounded-full">
              添加第一个产品
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {groupSummary.map(group => (
              <div key={group.bank} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* 分组头 */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{group.bank}</span>
                    <span className="text-[10px] text-gray-400">{group.items.length} 个产品</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-gray-900">
                      {group.total.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className={`text-[10px] font-mono ${group.todayProfit >= 0 ? "text-red-500" : "text-green-600"}`}>
                      {group.todayProfit >= 0 ? "+" : ""}{group.todayProfit.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* 产品列表 */}
                <div className="divide-y divide-gray-50">
                  {group.items.map(h => {
                    const p = h.products;
                    if (!p) return null;
                    const hold = Number(h.holding_amount || 0);
                    const transit = Number(h.in_transit_amount || 0);
                    const daily = Number(p.daily_return || 0);
                    const today = hold * daily / 10000;
                    const annual = Number(p.annualized_1m || 0);

                    return (
                      <Link key={h.id} href={`/holdings/${h.id}`} className="block px-4 py-3 hover:bg-gray-50">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-medium text-gray-900 text-sm leading-snug flex-1 pr-3">
                            {p.name}
                          </h3>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <div className="text-[10px] text-gray-400 mb-0.5">持仓金额</div>
                            <div className="text-sm font-bold font-mono text-gray-900">
                              {hold.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                            </div>
                            {transit > 0 && (
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                在途 {transit.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <div className="text-[10px] text-gray-400 mb-0.5">年化</div>
                              <div className={`text-xs font-mono ${annual > 0 ? "text-red-500" : "text-gray-400"}`}>
                                {annual > 0 ? "+" : ""}{annual.toFixed(2)}%
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400 mb-0.5">今日</div>
                              <div className={`text-sm font-bold font-mono ${today > 0 ? "text-red-500" : today < 0 ? "text-green-600" : "text-gray-400"}`}>
                                {today >= 0 ? "+" : ""}{today.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}