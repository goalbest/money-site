"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";

const CACHE_KEY = "home_cache_v3";
const CACHE_TTL = 10 * 60 * 1000;

function getCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.t > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data.p;
  } catch {
    return null;
  }
}

function setCache(p: any) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), p }));
  } catch {}
}

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalAssets: 0, totalHolding: 0, totalInTransit: 0, todayProfit: 0, count: 0 });
  const [hotSearches, setHotSearches] = useState<{ keyword: string; count: number }[]>([]);
  const [topProfit, setTopProfit] = useState<any[]>([]);
  const [newProducts, setNewProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"profit" | "hot" | "new">("profit");

  useEffect(() => {
    const u = localStorage.getItem("username");
    const id = localStorage.getItem("user_id");
    setUsername(u);
    setUserId(id);

    const cached = getCache();
    if (cached) {
      setHotSearches(cached.hotSearches || []);
      setTopProfit(cached.topProfit || []);
      setNewProducts(cached.newProducts || []);
      setLoading(false);
    }

    async function fetchData() {
      if (!cached) setLoading(true);

      const [holdingsRes, logsRes, topRes, newRes] = await Promise.all([
        id
          ? supabase
              .from("user_holdings")
              .select("holding_amount, in_transit_amount, products(daily_return)")
              .eq("user_id", id)
              .eq("status", "active")
          : Promise.resolve({ data: [] }),
        supabase
          .from("search_logs")
          .select("keyword")
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("products")
          .select("id, name, bank, annualized_1m, unit_nav, nav_date")
          .not("annualized_1m", "is", null)
          .gt("annualized_1m", 0)
          .order("annualized_1m", { ascending: false })
          .limit(5),
        supabase
          .from("products")
          .select("id, name, bank, annualized_1m, unit_nav, nav_date")
          .not("nav_date", "is", null)
          .order("nav_date", { ascending: false })
          .limit(5),
      ]);

      const hd = holdingsRes.data || [];
      const totalHolding = hd.reduce((s, h) => s + Number(h.holding_amount || 0), 0);
      const totalInTransit = hd.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
      const todayProfit = hd.reduce((s, h) => {
        const daily = Number(h.products?.daily_return || 0);
        const amount = Number(h.holding_amount || 0);
        return s + (amount * daily) / 10000;
      }, 0);
      setStats({
        totalAssets: totalHolding + totalInTransit,
        totalHolding,
        totalInTransit,
        todayProfit,
        count: hd.length,
      });

      let hotList: any[] = [];
      if (logsRes.data) {
        const counts: Record<string, number> = {};
        logsRes.data.forEach((l: any) => { counts[l.keyword] = (counts[l.keyword] || 0) + 1; });
        hotList = Object.entries(counts)
          .map(([keyword, count]) => ({ keyword, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        setHotSearches(hotList);
      }

      if (topRes.data) setTopProfit(topRes.data);
      if (newRes.data) setNewProducts(newRes.data);

      setCache({
        hotSearches: hotList,
        topProfit: topRes.data || [],
        newProducts: newRes.data || [],
      });

      setLoading(false);
    }
    fetchData();
  }, []);

  function handleSearch() {
    if (!searchTerm.trim()) return;
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/search_logs`, {
      method: "POST",
      headers: {
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keyword: searchTerm.trim(), user_id: userId ? Number(userId) : null }),
    }).catch(() => {});
    window.location.href = `/discover?q=${encodeURIComponent(searchTerm.trim())}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 pb-16 rounded-b-3xl">
          <div className="container mx-auto px-4 pt-8 max-w-3xl">
            <div className="h-4 w-24 bg-white/20 rounded animate-pulse mb-4" />
            <div className="h-8 w-40 bg-white/20 rounded animate-pulse mb-5" />
            <div className="h-12 w-full bg-white/20 rounded-2xl animate-pulse" />
          </div>
        </div>
        <div className="container mx-auto px-4 -mt-10 max-w-3xl">
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
            <div className="h-5 w-20 bg-gray-100 rounded animate-pulse mb-4" />
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-gray-50 rounded mb-2 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Tab 配置（含选中阴影）
  const TABS = [
    { key: "profit" as const, label: "收益榜", icon: "📈" },
    { key: "hot" as const, label: "热度榜", icon: "🔥" },
    { key: "new" as const, label: "新品榜", icon: "✨" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部渐变 */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 pb-16 rounded-b-3xl shadow-lg">
        <div className="container mx-auto px-4 pt-8 max-w-3xl">
          <div className="flex justify-between items-center mb-4">
            <div className="text-white text-base font-bold">
              {username ? `Hi, ${username}` : "理财净值观察站"}
            </div>
            {!username && (
              <Link href="/login" className="bg-white/20 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full">
                登录 / 注册
              </Link>
            )}
          </div>

          {username ? (
            <div className="text-white mb-5">
              <div className="text-xs text-blue-100 mb-1">总资产（元）</div>
              <div className="text-3xl font-bold font-mono tracking-tight mb-3">
                {stats.totalAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex gap-6 text-xs">
                <div>
                  <div className="text-blue-100">持仓</div>
                  <div className="font-mono font-medium text-sm">
                    {stats.totalHolding.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-blue-100">在途</div>
                  <div className="font-mono font-medium text-sm">
                    {stats.totalInTransit.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-blue-100">今日收益</div>
                  <div className={`font-mono font-medium text-sm ${stats.todayProfit > 0 ? "text-red-200" : ""}`}>
                    {stats.todayProfit >= 0 ? "+" : ""}{stats.todayProfit.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-white mb-5">
              <div className="text-xs text-blue-100 mb-1">理财净值 · 数据每日更新</div>
              <div className="text-xl font-bold">登录后查看我的持仓</div>
            </div>
          )}

          {/* 搜索框 */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="搜索产品、银行、基金代码"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full bg-white border-0 rounded-2xl pl-11 pr-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-10 max-w-3xl">
        {/* ★ 榜单：Tab 卡片化 + 选中阴影 */}
        <div className="mb-4">
          {/* Tab 头：三个独立小卡片 */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {TABS.map(t => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                    isActive
                      ? "bg-white text-blue-600 shadow-md ring-2 ring-blue-500/20 scale-105"
                      : "bg-white/60 text-gray-500 shadow-sm hover:bg-white/80"
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab 内容 */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="min-h-[260px]">
              {/* 收益榜 */}
              {activeTab === "profit" && (
                <div>
                  {topProfit.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-xs">暂无数据</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {topProfit.map((p, i) => (
                        <Link key={p.id} href={`/product/${p.id}`} className="flex items-center px-4 py-3 hover:bg-gray-50">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold mr-3 flex-shrink-0 ${
                            i === 0 ? "bg-red-500 text-white"
                            : i === 1 ? "bg-orange-400 text-white"
                            : i === 2 ? "bg-yellow-400 text-white"
                            : "bg-gray-100 text-gray-500"
                          }`}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-800 truncate">{p.name}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">{p.bank}</div>
                          </div>
                          <div className="text-sm font-bold text-red-500 font-mono ml-2 flex-shrink-0">
                            +{Number(p.annualized_1m).toFixed(2)}%
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link href="/discover?tab=profit" className="block text-center py-2.5 text-xs text-blue-600 hover:bg-blue-50 border-t border-gray-50">
                    查看完整收益榜 ›
                  </Link>
                </div>
              )}

              {/* 热度榜 */}
              {activeTab === "hot" && (
                <div>
                  {hotSearches.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-xs">暂无搜索记录</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {hotSearches.map((h, i) => (
                        <Link key={h.keyword} href={`/discover?q=${encodeURIComponent(h.keyword)}`} className="flex items-center px-4 py-3 hover:bg-gray-50">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold mr-3 ${
                            i === 0 ? "bg-red-500 text-white"
                            : i === 1 ? "bg-orange-400 text-white"
                            : i === 2 ? "bg-yellow-400 text-white"
                            : "bg-gray-100 text-gray-500"
                          }`}>{i + 1}</span>
                          <span className="flex-1 text-sm text-gray-800 truncate">{h.keyword}</span>
                          <span className="text-xs text-gray-400 mr-2">{h.count} 次</span>
                          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link href="/discover?tab=hot" className="block text-center py-2.5 text-xs text-blue-600 hover:bg-blue-50 border-t border-gray-50">
                    查看完整热度榜 ›
                  </Link>
                </div>
              )}

              {/* 新品榜 */}
              {activeTab === "new" && (
                <div>
                  {newProducts.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-xs">暂无数据</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {newProducts.map((p) => (
                        <Link key={p.id} href={`/product/${p.id}`} className="flex items-center px-4 py-3 hover:bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-800 truncate">{p.name}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">{p.bank} · {p.nav_date}</div>
                          </div>
                          <div className="text-sm font-mono text-gray-600 ml-2 flex-shrink-0">
                            {p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—"}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link href="/discover?tab=new" className="block text-center py-2.5 text-xs text-blue-600 hover:bg-blue-50 border-t border-gray-50">
                    查看完整新品榜 ›
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ★ 免责声明 */}
        <div className="bg-gray-100/60 rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-[11px] text-gray-400 leading-relaxed">
              <div className="font-medium text-gray-500 mb-1">免责声明</div>
              <p>本站数据来源于公开渠道，仅供学习分享参考，不构成任何投资建议。理财产品过往业绩不代表未来表现，投资有风险，购买需谨慎。请以银行官方披露信息为准。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}