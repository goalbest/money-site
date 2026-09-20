"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import WatchButton from "./WatchButton";

export default function Home() {
  const [products, setProducts] = useState<any[]>([]);
  const [sortKey, setSortKey] = useState("annualized_1m");
  const [asc, setAsc] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [jumpPage, setJumpPage] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const PAGE_SIZE = 20;

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const suggestTimer = useRef<NodeJS.Timeout | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // 输入变化：实时查询备选列表
  function handleSearchChange(value: string) {
    setSearchTerm(value);

    // 清掉之前的备选查询
    if (suggestTimer.current) clearTimeout(suggestTimer.current);

    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // 200ms 后查询备选
    suggestTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, bank, code")
        .or(`name.ilike.%${value}%,bank.ilike.%${value}%,code.ilike.%${value}%`)
        .order("annualized_1m", { ascending: false })
        .limit(8);
      setSuggestions(data || []);
      setShowSuggestions(true);
    }, 200);
  }

  // 点击备选项
  function selectSuggestion(item: any) {
    setSearchTerm(item.name);
    setShowSuggestions(false);
  }

  // 点击页面其他地方关闭备选
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 主列表查询防抖：停止输入 400ms 后才触发
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchTerm]);

  useEffect(() => {
    const savedUsername = localStorage.getItem("username");
    if (savedUsername) setUsername(savedUsername);

    async function fetchData() {
      setSearching(true);

      let countQuery = supabase.from("products").select("*", { count: "exact", head: true });
      if (debouncedSearch.trim()) {
        countQuery = countQuery.or(`name.ilike.%${debouncedSearch}%,bank.ilike.%${debouncedSearch}%,code.ilike.%${debouncedSearch}%`);
      }
      const { count } = await countQuery;
      setTotalCount(count || 0);

      let query = supabase.from("products").select("*");
      if (debouncedSearch.trim()) {
        query = query.or(`name.ilike.%${debouncedSearch}%,bank.ilike.%${debouncedSearch}%,code.ilike.%${debouncedSearch}%`);
      }
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data } = await query
        .order("annualized_1m", { ascending: false })
        .range(from, to);

      if (data) setProducts(data);
      setSearching(false);
      setInitialLoading(false);
    }
    fetchData();
  }, [debouncedSearch, page]);

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

  if (initialLoading) {
    return <div className="p-8 text-center text-gray-500">正在从数据库加载数据...</div>;
  }

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

        {/* 搜索框 + 备选下拉 */}
        <div className="relative" ref={searchBoxRef}>
          <input
            type="text"
            placeholder="搜索产品名称、银行或产品编码..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchTerm.trim() && setShowSuggestions(true)}
            className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              搜索中...
            </span>
          )}

          {/* 备选下拉列表 */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                >
                  <div className="text-sm text-gray-800 truncate">{s.name}</div>
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>{s.bank}</span>
                    {s.code && <span>{s.code}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
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
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-gray-400">
                  没有找到匹配的产品
                </td>
              </tr>
            ) : (
              sorted.map((p) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ==================== 手机端：排序工具栏 ==================== */}
      <div className="md:hidden mb-3 flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => clickSort("annualized_1m")}
          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${sortKey === "annualized_1m" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          近1月年化 {sortKey === "annualized_1m" && (asc ? "▲" : "▼")}
        </button>
        <button
          onClick={() => clickSort("daily_return")}
          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${sortKey === "daily_return" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          今日万收 {sortKey === "daily_return" && (asc ? "▲" : "▼")}
        </button>
        <button
          onClick={() => clickSort("unit_nav")}
          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${sortKey === "unit_nav" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          单位净值 {sortKey === "unit_nav" && (asc ? "▲" : "▼")}
        </button>
        <button
          onClick={() => clickSort("name")}
          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${sortKey === "name" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          名称 {sortKey === "name" && (asc ? "▲" : "▼")}
        </button>
      </div>

      {/* ==================== 手机端：卡片 ==================== */}
      <div className="md:hidden space-y-3">
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">没有找到匹配的产品</div>
        ) : (
          sorted.map((p) => (
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
          ))
        )}
      </div>

      {/* ==================== 分页 ==================== */}
      {totalCount > 0 && (
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
      )}
    </main>
  );
}