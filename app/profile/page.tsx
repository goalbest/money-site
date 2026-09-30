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
      <div className="min-h-screen pb-24">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="text-[22px] font-bold tracking-tight text-slate-900 mb-5">
            我的
          </div>
        </div>
        <div className="flex items-center justify-center px-5 mt-8">
          <div className="max-w-sm w-full text-center animate-fade-in-up">
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl
                            bg-gradient-to-br from-violet-500 to-purple-600
                            flex items-center justify-center
                            shadow-xl shadow-purple-500/25">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="text-[20px] font-bold text-slate-900 mb-2">还没有登录</div>
            <div className="text-[13px] text-slate-400 mb-8 leading-relaxed">
              登录后管理你的个人资产
            </div>
            <Link href="/login" className="btn-primary inline-block text-sm px-8 py-3">
              登录 / 注册
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 菜单项
  const MENU = [
    { key: "transactions", label: "交易记录", desc: "购买 / 赎回历史", href: "/transactions", icon: "📋", color: "bg-blue-50" },
    { key: "watchlist", label: "我的自选", desc: "关注的产品", href: "/watchlist", icon: "⭐", color: "bg-amber-50" },
    { key: "analysis", label: "收益分析", desc: "收益趋势和图表", href: "/analysis", icon: "📊", color: "bg-emerald-50" },
    { key: "compare", label: "产品对比", desc: "对比多个产品", href: "/compare", icon: "⚖️", color: "bg-purple-50" },
    { key: "export", label: "数据导出", desc: "导出持仓 / 交易备份", href: "/export", icon: "💾", color: "bg-indigo-50" },
    { key: "settings", label: "设置", desc: "账号和偏好", href: "/settings", icon: "⚙️", color: "bg-slate-50" },
  ];

  // 头像：中文取后 2 字，英文取前 2 字大写（对齐首页问候区规范）
  const avatarChar = username
    ? /[\u4e00-\u9fa5]/.test(username)
      ? username.slice(-2)
      : username.slice(0, 2).toUpperCase()
    : "";

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">

        {/* ============ 顶部用户区（不吸顶，对齐首页问候区） ============ */}
        <div className="flex items-center gap-3 mb-6 animate-fade-in-up">
          <div className="w-12 h-12 rounded-2xl
                          bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500
                          flex items-center justify-center flex-shrink-0
                          text-white text-[15px] font-bold
                          shadow-lg shadow-purple-500/25">
            {avatarChar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-bold tracking-tight text-slate-900 truncate">
              {username}
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              已管理 {stats.holdingsCount} 个产品
            </div>
          </div>
        </div>

        {/* ============ 资产统计卡 ============ */}
        <div className="card-summary p-5 mb-5 animate-fade-in-up delay-1">
          <div className="grid grid-cols-3 divide-x divide-slate-100">
            <div className="text-center">
              <div className="text-[10px] text-slate-400 mb-1.5">总资产</div>
              <div className="font-mono font-bold text-[15px] text-slate-900 tabular">
                {stats.totalAssets.toLocaleString("zh-CN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-400 mb-1.5">今日收益</div>
              <div className={`font-mono font-bold text-[15px] tabular ${
                stats.totalProfit > 0 ? "text-rose-500"
                : stats.totalProfit < 0 ? "text-emerald-500"
                : "text-slate-700"
              }`}>
                {stats.totalProfit >= 0 ? "+" : ""}{stats.totalProfit.toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-400 mb-1.5">持仓数</div>
              <div className="font-mono font-bold text-[15px] text-slate-900 tabular">
                {stats.holdingsCount}
              </div>
            </div>
          </div>
        </div>

        {/* ============ 菜单 ============ */}
        <div className="card overflow-hidden mb-5 animate-fade-in-up delay-2">
          {MENU.map((m, i) => (
            <Link
              key={m.key}
              href={m.href}
              className={`flex items-center px-5 py-4 group
                         hover:bg-slate-50 active:bg-slate-100
                         transition-colors duration-150
                         ${i !== MENU.length - 1 ? "border-b divider" : ""}`}
            >
              <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center mr-3 flex-shrink-0`}>
                <span className="text-[16px]">{m.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-slate-900 font-medium">{m.label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{m.desc}</div>
              </div>
              <svg
                className="w-4 h-4 text-slate-300 row-arrow flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        {/* ============ 退出登录 ============ */}
        <button
          onClick={handleLogout}
          className="w-full card py-4 text-[13px] text-rose-500 font-semibold
                     hover:bg-rose-50 active:scale-[0.99]
                     transition-all duration-200 mb-5
                     animate-fade-in-up delay-3"
        >
          退出登录
        </button>

        {/* ============ 版本信息 ============ */}
        <div className="text-center text-[10px] text-slate-300 pb-4 animate-fade-in-up delay-4">
          理财净值观察站 v1.0
        </div>
      </div>
    </div>
  );
}