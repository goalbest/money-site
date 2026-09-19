"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link"; // 导入 Link 组件

export default function Home() {
  const [products, setProducts] = useState<any[]>([]);
  const [sortKey, setSortKey] = useState("annualized_1m");
  const [asc, setAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null); // 用来存当前登录的账号

  useEffect(() => {
    // 1. 检查有没有登录
    const savedUsername = localStorage.getItem("username");
    if (savedUsername) setUsername(savedUsername);

    // 2. 从数据库拉取产品数据
    async function fetchData() {
      const { data } = await supabase
        .from("products")
        .select("*")
        .order("annualized_1m", { ascending: false });
      if (data) setProducts(data);
      setLoading(false);
    }
    fetchData();
  }, []);

  // 退出登录
  function handleLogout() {
    localStorage.removeItem("username");
    setUsername(null);
  }

  // 排序逻辑
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

  if (loading) return <div className="p-8 text-center text-gray-500">正在从数据库加载数据...</div>;

  return (
    <main className="container mx-auto p-6">
      {/* 这里是顶部区域，加入登录按钮 */}
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">理财净值观察站</h1>
          <p className="text-sm text-gray-500 mt-1">
            共 {products.length} 只产品 · 来自云端数据库
          </p>
        </div>
        
        {/* 根据登录状态显示不同按钮 */}
        <div>
          {username ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">👤 {username}</span>
              <button onClick={handleLogout} className="text-sm text-red-500 hover:underline">退出登录</button>
            </div>
          ) : (
            <Link href="/login" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
              登录 / 注册
            </Link>
          )}
        </div>
      </header>

      <div className="overflow-x-auto border rounded-lg shadow-sm">
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
                <td className="px-3 py-3 text-sm font-mono">{Number(p.unit_nav).toFixed(4)}</td>
                <td className="px-3 py-3 text-sm text-red-500 font-medium">+{Number(p.annualized_1m).toFixed(2)}%</td>
                <td className="px-3 py-3 text-sm">{Number(p.daily_return).toFixed(2)}</td>
                <td className="px-3 py-3 text-sm text-gray-600">{p.nav_date}</td>
                {/* 这里把走势变成一个真正的链接 */}
                <td className="px-3 py-3">
                  <Link href={`/product/${p.id}`} className="text-blue-600 text-sm hover:underline">
                    走势
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}