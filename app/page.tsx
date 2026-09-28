"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import { useCountUp } from "../lib/useCountUp";
import { getBankInfo } from "../lib/banks";
import { useHomeMetrics } from "../lib/homeMetrics";
import { useHomeLayout } from "../lib/homeStore";
import HomeTiles from "./components/home/HomeTiles";
import ModuleRenderer from "./components/home/ModuleRenderer";
import HomeDrawer from "./components/home/HomeDrawer";

/* ============ 快捷入口 ============ */
const QUICK_ACTIONS = [
  {
    key: "calendar",
    href: "/calendar",
    label: "日历",
    bg: "from-violet-500 to-purple-600",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
        <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        <circle cx="8" cy="14" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="14" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: "holdings",
    href: "/holdings",
    label: "持仓",
    bg: "from-blue-500 to-indigo-600",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "transactions",
    href: "/transactions",
    label: "交易",
    bg: "from-amber-500 to-orange-600",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M7 8h10M7 8l3-3M7 8l3 3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 16H7M17 16l-3-3M17 16l-3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: "watchlist",
    href: "/watchlist",
    label: "自选",
    bg: "from-rose-500 to-pink-600",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M12 4l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20.6l1-6L3.4 10.4l6-.9L12 4z" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const TABS = [
  { key: "profit" as const, label: "收益榜" },
  { key: "hot" as const, label: "热度榜" },
  { key: "new" as const, label: "新品榜" },
];

export default function Home() {
  /* ============ 基础状态 ============ */
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  /* ============ 新的统一数据层 ============ */
  const { metrics, loading: metricsLoading } = useHomeMetrics();
  const { layout, hydrated, moveWithinZone, moveToZone, reset } = useHomeLayout();

  /* ============ 抽屉 ============ */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressed = useRef(false);

  function handleLongPressStart() {
    longPressed.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setDrawerOpen(true);
      try { (navigator as any).vibrate?.(15); } catch {}
    }, 500);
  }
  function handleLongPressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function handleLinkClick(e: React.MouseEvent) {
    if (longPressed.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressed.current = false;
    }
  }

  /* ============ 榜单数据（发现好产品用） ============ */
  const [activeTab, setActiveTab] = useState<"profit" | "hot" | "new">("profit");
  const [listItems, setListItems] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);

  /* ============ 搜索 ============ */
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  /* ============ 数字滚动 ============ */
  const animatedAssets = useCountUp(metrics.totalAssets, 1000, { startDelay: 150 });
  const animatedHolding = useCountUp(metrics.totalHolding, 1000, { startDelay: 150 });
  const animatedInTransit = useCountUp(metrics.totalInTransit, 1000, { startDelay: 150 });
  const animatedProfit = useCountUp(metrics.todayProfit, 1000, { startDelay: 150 });

  /* ============ 初始化 ============ */
  useEffect(() => {
    const u = localStorage.getItem("username");
    const id = localStorage.getItem("user_id");
    setUsername(u);
    setUserId(id);
    const hh = String(new Date().getHours()).padStart(2, "0");
    const mm = String(new Date().getMinutes()).padStart(2, "0");
    setLastUpdated(`${hh}:${mm}`);
  }, []);

  useEffect(() => {
    fetchListItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function fetchListItems() {
    setListLoading(true);
    if (activeTab === "profit") {
      const { data } = await supabase
        .from("products")
        .select("id, name, bank, unit_nav, annualized_1m, nav_date, code")
        .not("annualized_1m", "is", null)
        .gt("annualized_1m", 0)
        .order("annualized_1m", { ascending: false })
        .limit(20);
      setListItems(data || []);
    } else if (activeTab === "new") {
      const { data } = await supabase
        .from("products")
        .select("id, name, bank, unit_nav, annualized_1m, nav_date, code")
        .not("nav_date", "is", null)
        .order("nav_date", { ascending: false })
        .limit(20);
      setListItems(data || []);
    } else {
      const { data } = await supabase
        .from("search_logs")
        .select("keyword")
        .order("created_at", { ascending: false })
        .limit(500);
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((l: any) => { counts[l.keyword] = (counts[l.keyword] || 0) + 1; });
        setListItems(
          Object.entries(counts)
            .map(([keyword, count]) => ({ keyword, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20)
        );
      }
    }
    setListLoading(false);
  }

  async function handleSearch() {
    const term = searchTerm.trim();
    if (!term) { setSearchMode(""); setSearchResults([]); return; }
    if (userId) {
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/search_logs`, {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keyword: term, user_id: userId ? Number(userId) : null }),
      }).catch(() => {});
    }
    setSearchMode(term);
    setSearchLoading(true);
    const { data } = await supabase
      .from("products")
      .select("id, name, bank, unit_nav, annualized_1m, nav_date, code")
      .or(`name.ilike.%${term}%,bank.ilike.%${term}%,code.ilike.%${term}%`)
      .limit(30);
    setSearchResults(data || []);
    setSearchLoading(false);
  }

  function clearSearch() {
    setSearchTerm(""); setSearchMode(""); setSearchResults([]);
  }

  function fmtMoney(n: number) {
    if (privacy) return "••••••";
    return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtProfit(n: number) {
    if (privacy) return "••••";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
  }

  /* ============ 未登录 ============ */
  if (!metricsLoading && !username) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="flex justify-between items-start mb-5">
            <div>
              <div className="text-[22px] font-bold tracking-tight text-slate-900">理财观察站</div>
              <div className="text-[12px] text-slate-400 mt-0.5">数据每日更新 · 记录你的理财净值</div>
            </div>
          </div>
          <div className="card-hero p-8 mb-5 text-center">
            <div className="dot-pattern" />
            <div className="relative z-10">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/15
                              border border-white/25
                              flex items-center justify-center backdrop-blur-sm">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-white font-bold text-[18px] mb-1.5">开始记录你的理财</div>
              <div className="text-white/70 text-[12px] mb-6">登录后查看持仓、净值、每日收益</div>
              <Link href="/login" className="inline-block bg-white text-purple-700
                                              font-semibold text-[13px]
                                              px-8 py-3 rounded-full
                                              shadow-lg shadow-purple-500/25
                                              hover:scale-105 active:scale-95
                                              transition-transform duration-200">
                立即登录
              </Link>
            </div>
          </div>
          <div className="card-tile p-4 mt-5 mb-8">
            <div className="text-[11px] text-slate-400 leading-relaxed">
              <span className="font-medium text-slate-500">免责声明 · </span>
              本站数据来源于公开渠道，仅供学习参考，不构成投资建议。理财有风险，投资需谨慎。
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ============ 加载中 ============ */
  if (metricsLoading || !hydrated) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="h-7 w-32 bg-slate-200/60 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-48 bg-slate-200/60 rounded animate-pulse mb-6" />
          <div className="p-6 mb-5 h-48 rounded-3xl animate-pulse"
               style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 55%, #ec4899 100%)", opacity: 0.35 }} />
          <div className="flex gap-3 mb-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-[136px] h-[108px] rounded-[18px] bg-slate-100 animate-pulse flex-shrink-0" />
            ))}
          </div>
          <div className="card p-5 h-40 animate-pulse" />
        </div>
      </div>
    );
  }

  /* ============ 主界面 ============ */
  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">

        {/* ============ 顶部账号 ============ */}
        <div className="flex justify-between items-center mb-4 animate-fade-in-up">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0
                            bg-gradient-to-br from-violet-500 to-purple-600
                            shadow-md shadow-purple-500/25">
              <span className="text-white font-bold text-[15px]">
                {username ? username.slice(-2) : "观"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[13px] text-slate-500">
                  {(() => {
                    const h = new Date().getHours();
                    if (h < 6) return "夜深了";
                    if (h < 12) return "早上好";
                    if (h < 14) return "中午好";
                    if (h < 18) return "下午好";
                    return "晚上好";
                  })()}
                </span>
                <span className="text-[16px] font-bold tracking-tight text-slate-900 truncate">
                  {username || "访客"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                数据已同步 · {lastUpdated}
              </div>
            </div>
          </div>
          <Link
            href="/profile"
            className="w-9 h-9 rounded-full bg-white border border-slate-200
                       hover:border-slate-300 hover:bg-slate-50
                       flex items-center justify-center flex-shrink-0
                       transition-all duration-300 active:scale-90"
            aria-label="我的"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        {/* ============ Hero 卡（长按打开抽屉） ============ */}
        <div
          className="card-hero p-6 mb-5 animate-fade-in-up delay-1"
          onTouchStart={handleLongPressStart}
          onTouchEnd={handleLongPressEnd}
          onTouchMove={handleLongPressEnd}
          onMouseDown={handleLongPressStart}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
        >
          <div className="dot-pattern" />
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-white/70 tracking-wider">总资产（元）</span>
                {metrics.count > 0 && (
                  <span className="text-[10px] text-white/60 bg-white/10
                                    border border-white/10
                                    px-1.5 py-0.5 rounded-full">
                    {metrics.count} 个持仓
                  </span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setPrivacy(p => !p); }}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25
                           flex items-center justify-center
                           transition-all duration-300 active:scale-90"
              >
                {privacy ? (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
            <div className="text-[40px] leading-none font-bold tracking-tight mb-6 tabular">
              {privacy
                ? "••••••"
                : animatedAssets.toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "持仓", value: fmtMoney(animatedHolding) },
                { label: "在途", value: fmtMoney(animatedInTransit) },
                { label: "今日", value: fmtProfit(animatedProfit), highlight: true },
              ].map((item) => (
                <div key={item.label} className="chip px-3 py-2.5">
                  <div className="text-[10px] text-white/65 mb-1">{item.label}</div>
                  <div className={`font-semibold text-[13px] tabular ${item.highlight ? "text-white" : "text-white/95"}`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ============ 搜索框 ============ */}
        <div className="relative mb-4 animate-fade-in-up">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="搜索产品、银行、代码"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="input-field w-full pl-11 pr-24 py-3.5 text-sm"
          />
          {searchTerm && (
            <button
              onClick={clearSearch}
              className="absolute inset-y-0 right-16 pr-2 flex items-center"
            >
              <svg className="w-4 h-4 text-slate-400 hover:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            onClick={handleSearch}
            className="absolute inset-y-1.5 right-1.5 px-4 rounded-xl
                       bg-gradient-to-r from-violet-500 to-purple-600
                       text-white text-[12px] font-semibold
                       shadow-md shadow-purple-500/25
                       hover:shadow-lg active:scale-95
                       transition-all duration-200"
          >
            搜索
          </button>
        </div>

        {/* ============ 搜索结果 ============ */}
        {searchMode && (
          <div className="mb-4 animate-fade-in-up">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-[15px] font-bold text-slate-900">
                搜索「{searchMode}」
              </div>
              <div className="text-[11px] text-slate-400">
                {searchLoading ? "搜索中..." : `${searchResults.length} 个结果`}
              </div>
            </div>
            <SearchResultList
              items={searchResults}
              loading={searchLoading}
              onLinkClick={handleLinkClick}
            />
            <button
              onClick={clearSearch}
              className="w-full mt-3 py-2.5 rounded-2xl
                         bg-slate-50 hover:bg-slate-100
                         text-[12px] text-slate-600 font-medium
                         transition-colors"
            >
              清空搜索
            </button>
          </div>
        )}

        {/* ============ 快捷入口 ============ */}
        {!searchMode && (
          <div className="mb-5 animate-fade-in-up delay-2">
            <div className="grid grid-cols-4 gap-3">
              {QUICK_ACTIONS.map((a) => (
                <Link key={a.key} href={a.href}
                      className="card card-hover p-3 flex flex-col items-center gap-2 group">
                  <div className={`w-11 h-11 rounded-2xl icon-hi
                                    bg-gradient-to-br ${a.bg}
                                    flex items-center justify-center
                                    shadow-md shadow-slate-200/50
                                    hover-bounce`}>
                    <span className="w-5 h-5 text-white block relative z-10">{a.icon}</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-700">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ============ 磁贴区 ============ */}
        {!searchMode && (
          <HomeTiles ids={layout.tile} metrics={metrics} />
        )}

        {/* ============ 主模块区 ============ */}
        {!searchMode && (
          <div className="space-y-4">
            {layout.card.map((id) => {
              if (id === "discover") {
                return (
                  <DiscoverModule
                    key={id}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    listItems={listItems}
                    listLoading={listLoading}
                    onLinkClick={handleLinkClick}
                  />
                );
              }
              return (
                <div key={id} className="animate-fade-in-up">
                  <ModuleRenderer id={id} metrics={metrics} />
                </div>
              );
            })}
          </div>
        )}

        {/* ============ 管理全部模块按钮 ============ */}
        {!searchMode && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-full mt-5 py-3.5 rounded-2xl
                       bg-white border border-slate-200
                       hover:bg-slate-50 hover:border-slate-300
                       active:scale-[0.99]
                       flex items-center justify-center gap-2
                       text-[13px] text-slate-600 font-medium
                       transition-all duration-200
                       shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            管理全部模块
            <span className="text-[11px] text-slate-400">
              {layout.tile.length + layout.card.length} 个已启用
            </span>
          </button>
        )}

        {/* ============ 免责声明 ============ */}
        {!searchMode && (
          <div className="card-tile p-4 mt-4 mb-8 animate-fade-in-up delay-5">
            <div className="text-[11px] text-slate-400 leading-relaxed">
              <span className="font-medium text-slate-500">免责声明 · </span>
              本站数据来源于公开渠道，仅供学习参考，不构成投资建议。理财有风险，投资需谨慎。
            </div>
          </div>
        )}
      </div>

      {/* ============ 抽屉 ============ */}
      <HomeDrawer
        open={drawerOpen}
        layout={layout}
        onClose={() => setDrawerOpen(false)}
        onMoveWithinZone={moveWithinZone}
        onMoveToZone={moveToZone}
        onReset={reset}
      />
    </div>
  );
}

/* ============================================================
   发现好产品模块（含 Tab）
   ============================================================ */
function DiscoverModule({
  activeTab,
  setActiveTab,
  listItems,
  listLoading,
  onLinkClick,
}: {
  activeTab: "profit" | "hot" | "new";
  setActiveTab: (t: "profit" | "hot" | "new") => void;
  listItems: any[];
  listLoading: boolean;
  onLinkClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-[15px] font-bold text-slate-900">发现好产品</div>
        <Link href="/discover" onClick={onLinkClick}
              className="text-[12px] text-purple-600 font-medium
                         hover:text-purple-700 flex items-center gap-0.5">
          全部
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
      <div className="segment-group flex mb-3">
        {TABS.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2.5 text-[13px] segment-item ${
                isActive ? "segment-item-active" : "hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <HomeRankingList
        items={listItems.slice(0, 5)}
        loading={listLoading}
        tab={activeTab}
        onLinkClick={onLinkClick}
      />
    </div>
  );
}

/* ============================================================
   榜单列表
   ============================================================ */
function HomeRankingList({
  items,
  loading,
  tab,
  onLinkClick,
}: {
  items: any[];
  loading: boolean;
  tab: "profit" | "hot" | "new";
  onLinkClick?: (e: React.MouseEvent) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4 h-20 animate-pulse" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="text-slate-300 text-sm">暂无数据</div>
      </div>
    );
  }

  if (tab === "hot") {
    return (
      <div className="card overflow-hidden">
        {items.map((h, i) => (
          <div key={`${i}-${h.keyword}`}
               className="flex items-center gap-3 px-5 py-3.5 border-b divider last:border-b-0">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center
                              text-[11px] font-bold flex-shrink-0 ${
              i === 0 ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white"
              : i === 1 ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
              : i === 2 ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white"
              : "bg-slate-100 text-slate-500"
            }`}>{i + 1}</span>
            <span className="flex-1 text-[13px] text-slate-900 font-medium truncate">
              {h.keyword}
            </span>
            <span className="text-[11px] text-slate-400 tabular">{h.count} 次</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((p, i) => {
        const info = getBankInfo(p.bank);
        const isProfit = tab === "profit";
        const mainValue = isProfit
          ? Number(p.annualized_1m) > 0 ? `+${Number(p.annualized_1m).toFixed(2)}%` : "—"
          : p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—";
        const mainLabel = isProfit ? "近 1 月年化" : "最新净值";
        const mainColor = isProfit ? "text-rose-500" : "text-slate-700";

        return (
          <Link key={p.id} href={`/product/${p.id}`} onClick={onLinkClick}
                className="card card-hover p-3.5 block group">
            <div className="flex items-start gap-3">
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center
                                text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                i === 0 ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white"
                : i === 1 ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
                : i === 2 ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white"
                : "bg-slate-100 text-slate-500"
              }`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900 leading-snug truncate">
                  {p.name}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="bank-avatar" style={{ background: info.bg, color: info.color }}>
                    {info.label}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">{p.bank}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <div className={`font-mono font-bold text-[14px] tabular ${mainColor}`}>
                  {mainValue}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">{mainLabel}</div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ============================================================
   搜索结果列表
   ============================================================ */
function SearchResultList({
  items,
  loading,
  onLinkClick,
}: {
  items: any[];
  loading: boolean;
  onLinkClick?: (e: React.MouseEvent) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-3.5 h-20 animate-pulse" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="text-slate-300 text-sm mb-2">没有找到匹配的产品</div>
        <div className="text-[11px] text-slate-400">试试搜索银行名或产品代码</div>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {items.map((p) => {
        const info = getBankInfo(p.bank);
        return (
          <Link key={p.id} href={`/product/${p.id}`} onClick={onLinkClick}
                className="card card-hover p-3.5 block group">
            <div className="flex items-start gap-3">
              <span className="bank-avatar flex-shrink-0 mt-0.5"
                    style={{ background: info.bg, color: info.color }}>
                {info.label}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900 leading-snug truncate">
                  {p.name}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-slate-400 truncate">{p.bank}</span>
                  {p.code && (
                    <span className="text-[10px] text-slate-300 font-mono">{p.code}</span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <div className={`font-mono font-bold text-[14px] tabular ${
                  Number(p.annualized_1m) > 0 ? "text-rose-500" : "text-slate-400"
                }`}>
                  {p.annualized_1m != null ? `+${Number(p.annualized_1m).toFixed(2)}%` : "—"}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">近 1 月年化</div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}