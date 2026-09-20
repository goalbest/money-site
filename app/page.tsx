"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import WatchButton from "./WatchButton";

export default function Home() {
  const [products, setProducts] = useState<any[]>([]);
  const [sortKey, setSortKey] = useState("annualized_1m");
  const [asc, setAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [jumpPage, setJumpPage] = useState("");
  const PAGE_SIZE = 20;

  useEffect(() => {
    const savedUsername = localStorage.getItem("username");
    if (savedUsername) setUsername(savedUsername);

    async function fetchData() {
      setLoading(true);

      let countQuery = supabase.from("products").select("*", { count: "exact", head: true });
      if (searchTerm.trim()) {
        countQuery = countQuery.or(`name.ilike.%${searchTerm}%,bank.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }
      const { count } = await countQuery;
      setTotalCount(count || 0);

      let query = supabase.from("products").select("*");
      if (searchTerm.trim()) {
        query = query.or(`name.ilike.%${searchTerm}%,bank.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data } = await query
        .order("annualized_1m", { ascending: false })
        .range(from, to);

      if (data) setProducts(data);
      setLoading(false);
    }
    fetchData();
  }, [searchTerm, page]);

  function handleLogout() {
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    setUsername(null);
  }

  const sorted = [...products].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return asc ? av - bv : bv - av;
    }
    return asc
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  function clickSort(key: string) {
    if (sortKey === key) setAsc(!asc);
    else { setSortKey(key); setAsc(false); }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function goToPage(p: number) {
    const target = Math.max(1, Math.min(totalPages, p));
    setPage(target);
  }

  function handleJump() {
    const n = parseInt(jumpPage);
    if (!isNaN(n)) goToPage(n);
    setJumpPage("");
  }

  if (loading) return <div className="p-8 text-center text-gray-500">正在从数据库加载数据...</div>;

  return (
    <main className="container mx-auto p-6">
      <header className="mb-6">
        <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">理财净值观察站</h1>
            <p className="text-sm text-gray-500 mt-1">
              {searchTerm ? (
                <>搜索 "{searchTerm}" 找到 {totalCount} 只产品</>
              ) : (
                <>共 {totalCount} 只产品 · 来自云端数据库</>
              )}
            </p>
          </div>
          <div>
            {username ? (
              <div className="flex items-center gap-3">
                <Link href="/watchlist" className="text-sm text-blue-600 hover:underline">我的自选</Link>
                <span className="text-sm text-gray-600">👤 {username}</span>
                <button onClick={handleLogout} className="text-sm text-red-500 hover:underline">退出登录</button>
              </div>
            ) : (
              <Link href="/login" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                登录 / 注册
              </Link>
            )}
          </div>
        </div>

        <input
          type="text"
          placeholder="搜索产品名称、银行或产品编码..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </header>

      {/* ==================== 电脑端：表格 ==================== */}
      <div className="hidden md:block overflow-x-auto border rounded-lg shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th onClick={() => clickSort("name")} className="px-3 py-3 text-left text-sm font-medium cursor-pointer hover:bg-gray-100">产品名称 {sortKey === "name" && (asc ? "▲" : "▼")}</th>
              <th onClick={() => clickSort("bank")} className="px-3 py-3 text-left text-sm font-medium cursor-pointer hover:bg-gray-100">银行 {sortKey === "bank" && (asc ? "▲" : "▼")}</th>
              <th onClick={() => clickSort("unit_nav")} className="px-3 py-3 text-left text-sm font-medium cursor-pointer hover:bg-gray-100">单位净值 {sortKey === "unit_nav" && (asc ? "▲" : "▼")}</th>
              <th onClick={() => clickSort("annualized_1m")} className="px-3 py-3 text-left text-sm font-medium cursor-pointer hover:bg-gray-100">近1月年化 {sortKey === "annualized_1m" && (asc ? "▲" : "▼")}</th>
              <th onClick={() => clickSort("daily_return")} className="px-3 py-3 text-left text-sm font-medium cursor-pointer hover:bg-gray-100">今日万收 {sortKey === "daily_return" && (asc ? "▲" : "▼")}</th>
              <th className="px-3 py-3 text-left text-sm font-medium">净值日</th>
              <th className="px-3 py-3 text-left text-sm font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50 transition-colors">
                <td className="px-3 py-3 text-sm">{p.name}</td>
                <td className="px-3 py-3 text-sm text-gray-600">{p.bank}</td>
                <td className="px-3 py-3 text-sm font-mono">{p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—"}</td>
                <td className="px-3 py-3 text-sm text-red-500 font-medium">
                  {p.annualized_1m != null && p.annualized_1m != 0 ? `+${Number(p.annualized_1m).toFixed(2)}%` : "—"}
                </td>
                <td className="px-3 py-3 text-sm">{p.daily_return != null ? Number(p.daily_return).toFixed(2) : "—"}</td>
                <td className="px-3 py-3 text-sm text-gray-600">{p.nav_date || "—"}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <WatchButton productId={p.id} />
                    <Link href={`/product/${p.id}`} className="text-blue-600 text-sm hover:underline">走势</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ==================== 手机端：卡片 ==================== */}
      <div className="md:hidden space-y-3">
        {sorted.map((p) => (
          <div key={p.id} className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="flex justify-between items-start mb-2">
            <div className="flex-1 pr-2">
  <h3 className="font-medium text-sm">{p.name}</h3>
</div>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">{p.bank}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div>
                <div className="text-xs text-gray-500 mb-1">单位净值</div>
                <div className="text-sm font-mono">{p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">近1月年化</div>
                <div className="text-sm font-medium text-red-500">
                  {p.annualized_1m != null && p.annualized_1m != 0 ? `+${Number(p.annualized_1m).toFixed(2)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">今日万收</div>
                <div className="text-sm">{p.daily_return != null ? Number(p.daily_return).toFixed(2) : "—"}</div>
              </div>
            </div>
            <div className="flex justify-between items-center mt-4 pt-3 border-t">
              <span className="text-xs text-gray-400">净值日 {p.nav_date || "—"}</span>
              <div className="flex items-center gap-3">
                <WatchButton productId={p.id} />
                <Link href={`/product/${p.id}`} className="text-blue-600 text-sm hover:underline">查看走势 →</Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ==================== 分页 ==================== */}
      <div className="flex justify-center items-center gap-2 mt-6 flex-wrap">
        <button
          onClick={() => goToPage(1)}
          disabled={page === 1}
          className="px-3 py-2 border rounded text-sm disabled:opacity-40 hover:bg-gray-50"
        >
          首页
        </button>
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page === 1}
          className="px-3 py-2 border rounded text-sm disabled:opacity-40 hover:bg-gray-50"
        >
          上一页
        </button>
        <span className="text-sm text-gray-600 mx-2">
          第 {page} / {totalPages} 页
        </span>
        <button
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-2 border rounded text-sm disabled:opacity-40 hover:bg-gray-50"
        >
          下一页
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={page >= totalPages}
          className="px-3 py-2 border rounded text-sm disabled:opacity-40 hover:bg-gray-50"
        >
          末页
        </button>

        <div className="flex items-center gap-1 ml-3">
          <span className="text-sm text-gray-600">跳至</span>
          <input
            type="number"
            value={jumpPage}
            onChange={(e) => setJumpPage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJump()}
            className="w-16 border rounded px-2 py-1 text-sm text-center"
            placeholder={String(page)}
          />
          <span className="text-sm text-gray-600">页</span>
          <button
            onClick={handleJump}
            className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
          >
            确定
          </button>
        </div>
      </div>
    </main>
  );
}