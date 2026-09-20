"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [hotSearches, setHotSearches] = useState<{ keyword: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUsername = localStorage.getItem("username");
    const savedUserId = localStorage.getItem("user_id");
    setUsername(savedUsername);
    setUserId(savedUserId);

    async function fetchData() {
      setLoading(true);

      if (savedUserId) {
        const { data, error } = await supabase
          .from("user_holdings")
          .select("id, holding_amount, in_transit_amount, hold_date, products(id, name, bank, unit_nav, annualized_1m, daily_return, nav_date)")
          .eq("user_id", savedUserId);
        if (!error && data) setHoldings(data);
      }

      const { data: logs } = await supabase
        .from("search_logs")
        .select("keyword")
        .order("created_at", { ascending: false })
        .limit(500);

      if (logs) {
        const counts: Record<string, number> = {};
        logs.forEach((l) => { counts[l.keyword] = (counts[l.keyword] || 0) + 1; });
        const sorted = Object.entries(counts)
          .map(([keyword, count]) => ({ keyword, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        setHotSearches(sorted);
      }

      setLoading(false);
    }
    fetchData();
  }, []);

  function handleLogout() {
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    setUsername(null);
    setUserId(null);
    setHoldings([]);
  }

  const totalHolding = holdings.reduce((s, h) => s + Number(h.holding_amount || 0), 0);
  const totalInTransit = holdings.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
  const totalAssets = totalHolding + totalInTransit;
  const todayProfit = holdings.reduce((s, h) => {
    const daily = Number(h.products?.daily_return || 0);
    const amount = Number(h.holding_amount || 0);
    return s + (amount * daily / 10000);
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部渐变 */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 pb-14 rounded-b-3xl shadow-lg">
        <div className="container mx-auto px-4 pt-5 max-w-3xl">
          <div className="flex justify-between items-center mb-5">
            <h1 className="text-white text-base font-bold">我的理财</h1>
            {username ? (
              <div className="flex items-center gap-3">
                <span className="text-blue-100 text-xs">👤 {username}</span>
                <button onClick={handleLogout} className="text-blue-100 text-xs hover:text-white">退出</button>
              </div>
            ) : (
              <Link href="/login" className="bg-white text-blue-600 text-xs font-medium px-4 py-2 rounded-full">
                登录 / 注册
              </Link>
            )}
          </div>

          {username ? (
            <div className="text-white">
              <div className="text-xs text-blue-100 mb-1">总资产（元）</div>
              <div className="text-3xl font-bold font-mono tracking-tight mb-4">
                {totalAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <div className="text-blue-100 text-xs">持仓</div>
                  <div className="font-mono font-medium text-sm">
                    {totalHolding.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-blue-100 text-xs">在途</div>
                  <div className="font-mono font-medium text-sm">
                    {totalInTransit.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-blue-100 text-xs">今日收益</div>
                  <div className={`font-mono font-medium text-sm ${todayProfit > 0 ? "text-red-200" : ""}`}>
                    {todayProfit >= 0 ? "+" : ""}{todayProfit.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-white">
              <div className="text-lg font-bold mb-1">理财净值观察站</div>
              <div className="text-xs text-blue-100">登录后管理你的持仓，自动追踪每日收益</div>
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-6 max-w-3xl">
        {username && (
          <div className="flex gap-2 mb-4">
            <Link href="/add" className="flex-1 bg-white rounded-xl py-2.5 text-center text-blue-600 text-sm font-medium shadow-sm hover:shadow-md transition">
              + 添加产品
            </Link>
            <Link href="/hot" className="bg-white rounded-xl px-5 py-2.5 text-gray-600 text-sm font-medium shadow-sm hover:shadow-md transition">
              🔥 热搜
            </Link>
          </div>
        )}

        {username && (
          <div>
            <div className="flex justify-between items-center mb-3 mt-4">
              <h2 className="text-base font-semibold text-gray-800">
                我的持仓 <span className="text-gray-400 text-sm font-normal">({holdings.length})</span>
              </h2>
            </div>

            {holdings.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
                <div className="text-gray-400 text-sm mb-4">还没有添加任何产品</div>
                <Link href="/add" className="inline-block bg-blue-600 text-white text-sm px-6 py-2 rounded-full hover:bg-blue-700 transition">
                  去添加第一个产品
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {holdings.map((h) => {
                  const p = h.products;
                  if (!p) return null;
                  const hold = Number(h.holding_amount || 0);
                  const transit = Number(h.in_transit_amount || 0);
                  const daily = Number(p.daily_return || 0);
                  const today = hold * daily / 10000;
                  const annual = Number(p.annualized_1m || 0);

                  return (
                    <Link key={h.id} href={`/product/${p.id}`} className="block bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition">
                      {/* 产品名 + 银行 */}
                      <div className="flex justify-between items-start mb-2.5">
                        <h3 className="font-medium text-gray-900 text-sm leading-snug flex-1 pr-3">
                          {p.name}
                        </h3>
                        <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md whitespace-nowrap font-medium">
                          {p.bank}
                        </span>
                      </div>

                      {/* 主数据：左持仓金额，右今日收益 */}
                      <div className="flex justify-between items-end mb-2">
                        <div>
                          <div className="text-[10px] text-gray-400 mb-0.5">持仓金额（元）</div>
                          <div className="text-base font-bold font-mono text-gray-900">
                            {hold.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                          </div>
                          {transit > 0 && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              在途 {transit.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-gray-400 mb-0.5">今日收益（元）</div>
                          <div className={`text-base font-bold font-mono ${today > 0 ? "text-red-500" : today < 0 ? "text-green-600" : "text-gray-400"}`}>
                            {today >= 0 ? "+" : ""}{today.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* 底部：净值 + 年化 + 净值日 */}
                      <div className="flex justify-between items-center pt-2 border-t border-gray-50 text-[11px]">
                        <div className="flex gap-3 text-gray-500">
                          <span>净值 <span className="font-mono text-gray-700">{p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—"}</span></span>
                          <span className={annual > 0 ? "text-red-500" : "text-gray-400"}>
                            年化 {annual > 0 ? "+" : ""}{annual.toFixed(2)}%
                          </span>
                        </div>
                        <span className="text-gray-400">{p.nav_date || "—"}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 热搜榜 */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base font-semibold text-gray-800">🔥 热搜榜</h2>
            <Link href="/hot" className="text-xs text-blue-600 hover:underline">查看完整</Link>
          </div>

          {hotSearches.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <div className="text-gray-400 text-sm">暂无搜索记录</div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {hotSearches.map((h, i) => (
                <Link key={h.keyword} href={`/search?q=${encodeURIComponent(h.keyword)}`} className="flex items-center px-5 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-b-0 transition">
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold mr-3 ${
                    i === 0 ? "bg-red-500 text-white" :
                    i === 1 ? "bg-orange-500 text-white" :
                    i === 2 ? "bg-yellow-500 text-white" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{h.keyword}</span>
                  <span className="text-xs text-gray-400">{h.count} 次</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {!username && (
          <div className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 text-center">
            <div className="text-gray-700 font-medium mb-2">登录后体验完整功能</div>
            <div className="text-xs text-gray-500 mb-4">添加持仓 · 自动追踪收益 · 净值日历</div>
            <Link href="/login" className="inline-block bg-blue-600 text-white text-sm px-6 py-2 rounded-full hover:bg-blue-700 transition">
              立即登录
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}