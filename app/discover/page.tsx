"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

function DiscoverContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "profit";
  const q = searchParams.get("q") || "";
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      if (q) {
        // 搜索模式
        const { data } = await supabase
          .from("products")
          .select("id, name, bank, unit_nav, annualized_1m, nav_date")
          .or(`name.ilike.%${q}%,bank.ilike.%${q}%`)
          .limit(50);
        if (data) setItems(data);
      } else if (tab === "profit") {
        // 收益排行榜
        const { data } = await supabase
          .from("products")
          .select("id, name, bank, unit_nav, annualized_1m, nav_date")
          .not("annualized_1m", "is", null)
          .gt("annualized_1m", 0)
          .order("annualized_1m", { ascending: false })
          .limit(50);
        if (data) setItems(data);
      } else if (tab === "new") {
        // 新品榜
        const { data } = await supabase
          .from("products")
          .select("id, name, bank, unit_nav, annualized_1m, nav_date")
          .not("nav_date", "is", null)
          .order("nav_date", { ascending: false })
          .limit(50);
        if (data) setItems(data);
      } else if (tab === "hot") {
        // 热度榜
        const { data } = await supabase
          .from("search_logs")
          .select("keyword")
          .order("created_at", { ascending: false })
          .limit(500);
        if (data) {
          const counts: Record<string, number> = {};
          data.forEach(l => { counts[l.keyword] = (counts[l.keyword] || 0) + 1; });
          setItems(
            Object.entries(counts)
              .map(([keyword, count]) => ({ keyword, count }))
              .sort((a, b) => b.count - a.count)
          );
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [tab, q]);

  const pageTitle = q
    ? `搜索"${q}"`
    : tab === "profit"
    ? "📈 收益排行榜"
    : tab === "new"
    ? "✨ 新品榜"
    : "🔥 热度榜";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 max-w-3xl flex items-center gap-3">
          <Link href="/" className="text-gray-600 hover:text-gray-900">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-bold text-gray-900">{pageTitle}</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 max-w-3xl">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="text-gray-400 text-sm">{q ? "没有找到匹配的产品" : "暂无数据"}</div>
          </div>
        ) : tab === "hot" && !q ? (
          // 热度榜视图
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {items.map((h, i) => (
              <Link
                key={h.keyword}
                href={`/discover?q=${encodeURIComponent(h.keyword)}`}
                className="flex items-center px-4 py-3.5 hover:bg-gray-50 border-b border-gray-50 last:border-b-0"
              >
                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0 ${
                  i === 0 ? "bg-red-500 text-white"
                  : i === 1 ? "bg-orange-400 text-white"
                  : i === 2 ? "bg-yellow-400 text-white"
                  : "bg-gray-100 text-gray-500"
                }`}>{i + 1}</span>
                <span className="flex-1 text-sm text-gray-800 truncate">{h.keyword}</span>
                <span className="text-xs text-gray-400">{h.count} 次</span>
              </Link>
            ))}
          </div>
        ) : (
          // 产品列表视图（收益榜 / 新品榜 / 搜索结果）
          <div className="space-y-2.5">
            {items.map((p, i) => (
              <Link
                key={p.id}
                href={`/product/${p.id}`}
                className="block bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {i < 3 && !q && (
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        i === 0 ? "bg-red-500 text-white"
                        : i === 1 ? "bg-orange-400 text-white"
                        : "bg-yellow-400 text-white"
                      }`}>{i + 1}</span>
                    )}
                    <h3 className="font-medium text-gray-900 text-sm leading-snug">{p.name}</h3>
                  </div>
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md whitespace-nowrap font-medium ml-2 flex-shrink-0">
                    {p.bank}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>净值 {p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—"}</span>
                  <span className={Number(p.annualized_1m) > 0 ? "text-red-500 font-medium" : ""}>
                    {p.annualized_1m != null ? `年化 +${Number(p.annualized_1m).toFixed(2)}%` : ""}
                  </span>
                  <span>{p.nav_date || "—"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">加载中...</div>}>
      <DiscoverContent />
    </Suspense>
  );
}