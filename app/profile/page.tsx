"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { recalcHoldingFromTransactions } from "../../lib/holdings";

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  /* 数据检查状态 */
  const [checkOpen, setCheckOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ done: 0, total: 0 });
  const [checkResult, setCheckResult] = useState<{
    total: number;
    fixed: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    const u = localStorage.getItem("username");
    const role = localStorage.getItem("role");
    
    setUsername(u);
    if (role === "admin" || u === "18739478938") {
      setIsAdmin(true);
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    localStorage.removeItem("role");
    router.push("/login");
  }

  /* 数据一致性检查：遍历所有持仓，重算 */
  async function runDataCheck() {
    const userId = localStorage.getItem("user_id");
    if (!userId) return;

    setChecking(true);
    setCheckResult(null);
    setCheckProgress({ done: 0, total: 0 });

    const { data: holdings } = await supabase
      .from("user_holdings")
      .select("product_id, status")
      .eq("user_id", userId);

    if (!holdings || holdings.length === 0) {
      setChecking(false);
      setCheckResult({ total: 0, fixed: 0, errors: [] });
      return;
    }

    setCheckProgress({ done: 0, total: holdings.length });

    let fixed = 0;
    const errors: string[] = [];

    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i];
      try {
        await recalcHoldingFromTransactions(userId, h.product_id);
        fixed++;
      } catch (e: any) {
        errors.push(`产品 ${h.product_id}: ${e.message || "未知错误"}`);
      }
      setCheckProgress({ done: i + 1, total: holdings.length });
    }

    localStorage.removeItem("cache_home_cache_v3");
    localStorage.removeItem("cache_home_cache_v4");
    localStorage.removeItem("cache_transactions");
    localStorage.removeItem("cache_holdings");
    localStorage.removeItem("cache");

    setChecking(false);
    setCheckResult({ total: holdings.length, fixed, errors });
  }

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
              登录
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const MENU = [
    { key: "transactions", label: "交易记录", desc: "购买 / 赎回历史", href: "/transactions", icon: "📋", color: "bg-blue-50" },
    { key: "export", label: "数据导出", desc: "导出持仓 / 交易备份", href: "/export", icon: "💾", color: "bg-indigo-50" },
    { key: "check", label: "数据检查", desc: "持仓不一致时一键修复", icon: "🛠️", color: "bg-cyan-50" },
    { key: "settings", label: "设置", desc: "账号和偏好", href: "/settings", icon: "⚙️", color: "bg-slate-50" },
  ];

  const avatarChar = username
    ? /[\u4e00-\u9fa5]/.test(username)
      ? username.slice(-2)
      : username.slice(0, 2).toUpperCase()
    : "";

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">

        <div className="flex items-center gap-3 mb-8 animate-fade-in-up">
          <div className="w-14 h-14 rounded-2xl
                          bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500
                          flex items-center justify-center flex-shrink-0
                          text-white text-[18px] font-bold
                          shadow-lg shadow-purple-500/25">
            {avatarChar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold tracking-tight text-slate-900 truncate">
              {username}
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              个人中心
            </div>
          </div>
        </div>

        <div className="card overflow-hidden mb-5 animate-fade-in-up delay-2">
          {MENU.map((m) => {
            const isCheck = m.key === "check";
            const cls = `flex items-center px-5 py-4 group
                         hover:bg-slate-50 active:bg-slate-100 active:scale-[0.98]
                         transition-all duration-200 ease-out
                         border-b divider`;
            const inner = (
              <>
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
              </>
            );

            if (isCheck) {
              return (
                <button
                  key={m.key}
                  onClick={() => {
                    setCheckOpen(true);
                    setCheckResult(null);
                    setCheckProgress({ done: 0, total: 0 });
                  }}
                  className={`${cls} text-left w-full`}
                >
                  {inner}
                </button>
              );
            }

            return (
              <Link key={m.key} href={m.href!} className={cls}>
                {inner}
              </Link>
            );
          })}

          {/* 超级管理员专属入口 */}
          {isAdmin && (
            <Link 
              href="/admin" 
              className="flex items-center px-5 py-4 group bg-purple-50/50 hover:bg-purple-50 active:bg-purple-100 active:scale-[0.98] transition-all duration-200 ease-out"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center mr-3 flex-shrink-0">
                <span className="text-[16px]">👑</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-purple-700 font-bold">管理员后台</div>
                <div className="text-[11px] text-purple-500 mt-0.5">系统配置与数据管理</div>
              </div>
              <svg className="w-4 h-4 text-purple-300 row-arrow flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="w-full card py-4 text-[13px] text-rose-500 font-semibold
                     hover:bg-rose-50 active:scale-[0.97]
                     transition-all duration-200 ease-out mb-5
                     animate-fade-in-up delay-4"
        >
          退出登录
        </button>

        <div className="text-center text-[10px] text-slate-300 pb-4 animate-fade-in-up delay-4">
          理财净值观察站 v5.0.0
        </div>
      </div>

      {/* 数据检查弹窗 */}
      {checkOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[100] animate-fade-in"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => !checking && setCheckOpen(false)}
          />
          <div className="fixed inset-0 z-[110] flex items-center justify-center px-6 pointer-events-none">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full animate-scale-in pointer-events-auto">
              {!checking && !checkResult && (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan-50 flex items-center justify-center">
                    <span className="text-[28px]">🛠️</span>
                  </div>
                  <div className="text-center mb-6">
                    <div className="text-[17px] font-bold text-slate-900 mb-1">
                      数据检查
                    </div>
                    <div className="text-[12px] text-slate-400 leading-relaxed px-4">
                      会遍历所有持仓产品，按交易记录重算持仓金额、份额、成本。<br />用于修复数据不一致。
                    </div>
                  </div>
                  <div className="space-y-2">
                    <button onClick={runDataCheck} className="btn-primary w-full py-3 text-[14px] font-semibold">
                      开始检查
                    </button>
                    <button onClick={() => setCheckOpen(false)} className="btn-secondary w-full py-3 text-[13px] font-semibold">
                      取消
                    </button>
                  </div>
                </>
              )}

              {checking && (
                <>
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full border-4 border-cyan-100" />
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-cyan-500 animate-spin" />
                  </div>
                  <div className="text-center mb-4">
                    <div className="text-[17px] font-bold text-slate-900 mb-1">检查中...</div>
                    <div className="text-[12px] text-slate-400">{checkProgress.done} / {checkProgress.total}</div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-300" style={{ width: `${checkProgress.total > 0 ? (checkProgress.done / checkProgress.total) * 100 : 0}%` }} />
                  </div>
                </>
              )}

              {!checking && checkResult && (
                <>
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${checkResult.errors.length > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
                    <span className="text-[28px]">{checkResult.errors.length > 0 ? "⚠️" : "✅"}</span>
                  </div>
                  <div className="text-center mb-6">
                    <div className="text-[17px] font-bold text-slate-900 mb-1">
                      {checkResult.errors.length > 0 ? "部分完成" : "检查完成"}
                    </div>
                    <div className="text-[12px] text-slate-400 leading-relaxed px-4">
                      共检查 <span className="font-mono font-semibold text-slate-700">{checkResult.total}</span> 个产品
                      {checkResult.errors.length > 0 && <><br /><span className="text-amber-600">{checkResult.errors.length} 个出错</span></>}
                    </div>
                  </div>
                  <button onClick={() => { setCheckOpen(false); window.location.reload(); }} className="btn-primary w-full py-3 text-[14px] font-semibold">
                    完成并刷新
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}