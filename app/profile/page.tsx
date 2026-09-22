"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalAssets: 0, totalProfit: 0, holdingsCount: 0 });

  useEffect(() => {
    const u = localStorage.getItem("username");
    const id = localStorage.getItem("user_id");
    setUsername(u);
    if (!id) return;

    async function fetchStats() {
      const { data } = await supabase
        .from("user_holdings")
        .select("holding_amount, in_transit_amount, products(daily_return)")
        .eq("user_id", id);
      if (data) {
        const total = data.reduce((s, h) => s + Number(h.holding_amount || 0) + Number(h.in_transit_amount || 0), 0);
        const profit = data.reduce((s, h) => s + (Number(h.holding_amount || 0) * Number(h.products?.daily_return || 0) / 10000), 0);
        setStats({ totalAssets: total, totalProfit: profit, holdingsCount: data.length });
      }
    }
    fetchStats();
  }, []);

  function handleLogout() {
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    router.push("/login");
  }

  // 未登录
  if (!username) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="text-gray-600 text-sm mb-1">还没有登录</div>
          <div className="text-gray-400 text-xs mb-6">登录后管理你的个人资产</div>
          <Link href="/login" className="inline-block bg-blue-600 text-white text-sm px-8 py-2.5 rounded-full hover:bg-blue-700 transition">
            登录 / 注册
          </Link>
        </div>
      </div>
    );
  }

  // 菜单项
  const MENU = [
    { key: "transactions", label: "交易记录", desc: "购买 / 赎回历史", href: "/transactions", icon: "📋", color: "bg-blue-50" },
    { key: "watchlist", label: "我的自选", desc: "关注的产品", href: "/watchlist", icon: "⭐", color: "bg-yellow-50" },
    { key: "analysis", label: "收益分析", desc: "收益趋势和图表", href: "/analysis", icon: "📊", color: "bg-green-50" },
    { key: "compare", label: "产品对比", desc: "对比多个产品", href: "/compare", icon: "⚖️", color: "bg-purple-50" },
    { key: "settings", label: "设置", desc: "账号和偏好", href: "/settings", icon: "⚙️", color: "bg-gray-50" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部用户卡 */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 pb-14 rounded-b-3xl">
        <div className="container mx-auto px-4 pt-8 max-w-3xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              {username[0]?.toUpperCase()}
            </div>
            <div className="text-white flex-1">
              <div className="text-lg font-bold">{username}</div>
              <div className="text-xs text-blue-100 mt-0.5">已管理 {stats.holdingsCount} 个产品</div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-8 max-w-3xl">
        {/* 资产统计卡 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="text-center">
              <div className="text-[10px] text-gray-400 mb-1">总资产</div>
              <div className="text-base font-bold font-mono text-gray-900">
                {stats.totalAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-400 mb-1">今日收益</div>
              <div className={`text-base font-bold font-mono ${stats.totalProfit >= 0 ? "text-red-500" : "text-green-600"}`}>
                {stats.totalProfit >= 0 ? "+" : ""}{stats.totalProfit.toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-400 mb-1">持仓数</div>
              <div className="text-base font-bold font-mono text-gray-900">{stats.holdingsCount}</div>
            </div>
          </div>
        </div>

        {/* 菜单 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
          {MENU.map((m, i) => (
            <Link
              key={m.key}
              href={m.href}
              className={`flex items-center px-4 py-3.5 hover:bg-gray-50 transition ${i !== MENU.length - 1 ? "border-b border-gray-50" : ""}`}
            >
              <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center mr-3 flex-shrink-0`}>
                <span className="text-base">{m.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 font-medium">{m.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{m.desc}</div>
              </div>
              <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        {/* 退出登录 */}
        <button
          onClick={handleLogout}
          className="w-full bg-white rounded-2xl py-3.5 text-sm text-red-500 font-medium shadow-sm hover:bg-red-50 transition mb-4"
        >
          退出登录
        </button>

        {/* 版本信息 */}
        <div className="text-center text-[10px] text-gray-300 pb-4">
          理财净值观察站 v1.0
        </div>
      </div>
    </div>
  );
}