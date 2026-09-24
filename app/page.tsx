"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import { useCountUp } from "../lib/useCountUp";
import { getBankInfo } from "../lib/banks";

const CACHE_KEY = "home_cache_v7";
const CACHE_TTL = 10 * 60 * 1000;
const LAYOUT_KEY = "home_layout_v2";

/* ============ 模块定义 ============ */
const DEFAULT_ORDER = ["holdings", "topToday", "ranking"] as const;
type ModuleId = typeof DEFAULT_ORDER[number];

const MODULE_LABELS: Record<ModuleId, string> = {
  holdings: "我的持仓",
  topToday: "今日收益榜",
  ranking: "发现好产品",
};

const MAX_PER_MODULE = 5;

/* ============ 布局 Hook ============ */
function useLayoutOrder() {
  const [order, setOrder] = useState<string[]>([...DEFAULT_ORDER]);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.order) && parsed.order.length === DEFAULT_ORDER.length) {
          setOrder(parsed.order);
        }
        if (Array.isArray(parsed.hidden)) setHidden(parsed.hidden);
      }
    } catch {}
  }, []);

  function save(newOrder: string[], newHidden: string[]) {
    setOrder(newOrder);
    setHidden(newHidden);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ order: newOrder, hidden: newHidden }));
    } catch {}
  }

  function moveUp(id: string) {
    const visible = order.filter(k => !hidden.includes(k));
    const idx = visible.indexOf(id);
    if (idx <= 0) return;
    const prevId = visible[idx - 1];
    const next = [...order];
    const a = next.indexOf(id);
    const b = next.indexOf(prevId);
    [next[a], next[b]] = [next[b], next[a]];
    save(next, hidden);
  }

  function moveDown(id: string) {
    const visible = order.filter(k => !hidden.includes(k));
    const idx = visible.indexOf(id);
    if (idx < 0 || idx >= visible.length - 1) return;
    const nextId = visible[idx + 1];
    const next = [...order];
    const a = next.indexOf(id);
    const b = next.indexOf(nextId);
    [next[a], next[b]] = [next[b], next[a]];
    save(next, hidden);
  }

  function toggleHidden(id: string) {
    const isHidden = hidden.includes(id);
    const newHidden = isHidden ? hidden.filter(x => x !== id) : [...hidden, id];
    save(order, newHidden);
  }

  function reset() {
    save([...DEFAULT_ORDER], []);
  }

  return { order, hidden, moveUp, moveDown, toggleHidden, reset };
}

/* ============ 缓存 ============ */
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
  } catch { return null; }
}
function setCache(p: any) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), p })); } catch {}
}

/* ============ 快捷入口 ============ */
const QUICK_ACTIONS = [
  { key: "calendar", href: "/calendar", label: "日历", bg: "from-violet-500 to-purple-600", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
      <circle cx="8" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14" r="1" fill="currentColor" stroke="none" />
    </svg>
  )},
  { key: "holdings", href: "/holdings", label: "持仓", bg: "from-blue-500 to-indigo-600", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
    </svg>
  )},
  { key: "transactions", href: "/transactions", label: "交易", bg: "from-amber-500 to-orange-600", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M7 8h10M7 8l3-3M7 8l3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 16H7M17 16l-3-3M17 16l-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )},
  { key: "watchlist", href: "/watchlist", label: "自选", bg: "from-rose-500 to-pink-600", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 4l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20.6l1-6L3.4 10.4l6-.9L12 4z" strokeLinejoin="round" />
    </svg>
  )},
];

const TABS = [
  { key: "profit" as const, label: "收益榜" },
  { key: "hot" as const, label: "热度榜" },
  { key: "new" as const, label: "新品榜" },
];

/* ============ 编辑模式下的操作按钮 ============ */
function EditControls({
  canUp,
  canDown,
  onMoveUp,
  onMoveDown,
  onHide,
}: {
  canUp: boolean;
  canDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHide: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoveUp(); }}
        disabled={!canUp}
        className={`w-7 h-7 rounded-full flex items-center justify-center
                    transition-all active:scale-90
                    ${canUp ? "bg-white shadow-sm border border-slate-200 hover:bg-slate-50" : "bg-slate-100 opacity-40"}`}
      >
        <svg className={`w-3.5 h-3.5 ${canUp ? "text-slate-700" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoveDown(); }}
        disabled={!canDown}
        className={`w-7 h-7 rounded-full flex items-center justify-center
                    transition-all active:scale-90
                    ${canDown ? "bg-white shadow-sm border border-slate-200 hover:bg-slate-50" : "bg-slate-100 opacity-40"}`}
      >
        <svg className={`w-3.5 h-3.5 ${canDown ? "text-slate-700" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
        className="w-7 h-7 rounded-full flex items-center justify-center
                   bg-rose-50 hover:bg-rose-100 active:scale-90
                   transition-all"
      >
        <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/* ============ 隐藏模块恢复条 ============ */
function HiddenModulesBar({
  hidden,
  onRestore,
  onReset,
}: {
  hidden: string[];
  onRestore: (id: string) => void;
  onReset: () => void;
}) {
  if (hidden.length === 0) return null;
  return (
    <div className="card p-3 mb-4">
      <div className="flex items-center justify-between mb-2.5 px-1">
        <div className="text-[11px] text-slate-500 font-medium">
          已隐藏 {hidden.length} 个卡片
        </div>
        <button
          onClick={onReset}
          className="text-[11px] text-purple-600 font-medium hover:text-purple-700"
        >
          恢复默认
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {hidden.map(id => (
          <button
            key={id}
            onClick={() => onRestore(id)}
            className="flex items-center gap-1 px-3 py-1.5
                       rounded-full bg-slate-50 border border-slate-100
                       text-[11px] text-slate-600 font-medium
                       hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700
                       transition-all duration-200"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {MODULE_LABELS[id as ModuleId] || id}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const { order, hidden, moveUp, moveDown, toggleHidden, reset } = useLayoutOrder();

  /* ============ 编辑模式 ============ */
  const [editMode, setEditMode] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressed = useRef(false);

  function handleLongPressStart() {
    if (editMode) return;
    longPressed.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setEditMode(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { (navigator as any).vibrate(15); } catch {}
      }
    }, 500);
  }

  function handleLongPressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleLinkClick(e: React.MouseEvent) {
    if (longPressed.current || editMode) {
      e.preventDefault();
      e.stopPropagation();
      longPressed.current = false;
    }
  }

  /* ============ 榜单数据 ============ */
  const [activeTab, setActiveTab] = useState<"profit" | "hot" | "new">("profit");
  const [listItems, setListItems] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<string>("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [stats, setStats] = useState({ totalAssets: 0, totalHolding: 0, totalInTransit: 0, todayProfit: 0, count: 0 });
  const animatedAssets = useCountUp(stats.totalAssets, 1200);
  const animatedHolding = useCountUp(stats.totalHolding, 1200);
  const animatedInTransit = useCountUp(stats.totalInTransit, 1200);
  const animatedProfit = useCountUp(stats.todayProfit, 1200);

  useEffect(() => {
    const u = localStorage.getItem("username");
    const id = localStorage.getItem("user_id");
    setUsername(u);
    setUserId(id);

    const hh = String(new Date().getHours()).padStart(2, "0");
    const mm = String(new Date().getMinutes()).padStart(2, "0");
    setLastUpdated(`${hh}:${mm}`);

    if (!id) {
      setLoading(false);
    } else {
      const cached = getCache();
      if (cached && cached.holdings) {
        setHoldings(cached.holdings);
        computeStats(cached.holdings);
        setLoading(false);
      }
      fetchHoldings(id);
    }
    fetchListItems();
  }, []);

  async function fetchHoldings(id: string) {
    const { data } = await supabase
      .from("user_holdings")
      .select("id, product_id, holding_amount, in_transit_amount, shares, hold_date, products(id, name, bank, unit_nav, annualized_1m, daily_return, nav_date)")
      .eq("user_id", id)
      .eq("status", "active");
    const list = data || [];
    setHoldings(list);
    computeStats(list);
    setCache({ holdings: list });
    setLoading(false);
  }

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
      if (data) setListItems(data);
    } else if (activeTab === "new") {
      const { data } = await supabase
        .from("products")
        .select("id, name, bank, unit_nav, annualized_1m, nav_date, code")
        .not("nav_date", "is", null)
        .order("nav_date", { ascending: false })
        .limit(20);
      if (data) setListItems(data);
    } else {
      const { data } = await supabase
        .from("search_logs")
        .select("keyword")
        .order("created_at", { ascending: false })
        .limit(500);
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((l) => { counts[l.keyword] = (counts[l.keyword] || 0) + 1; });
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

  useEffect(() => { if (!searchMode) fetchListItems(); }, [activeTab]);

  function computeStats(list: any[]) {
    const totalHolding = list.reduce((s, h) => s + Number(h.holding_amount || 0), 0);
    const totalInTransit = list.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
    const todayProfit = list.reduce((s, h) => {
      const daily = Number(h.products?.daily_return || 0);
      return s + (Number(h.holding_amount || 0) * daily) / 10000;
    }, 0);
    setStats({ totalAssets: totalHolding + totalInTransit, totalHolding, totalInTransit, todayProfit, count: list.length });
  }

  const topHoldings = useMemo(() => {
    return [...holdings]
      .sort((a, b) => Number(b.holding_amount || 0) - Number(a.holding_amount || 0));
  }, [holdings]);

  const topToday = useMemo(() => {
    return holdings
      .map(h => ({
        id: h.id,
        productId: h.products?.id,
        name: h.products?.name || "",
        bank: h.products?.bank || "",
        profit: (Number(h.holding_amount || 0) * Number(h.products?.daily_return || 0)) / 10000,
        rate: Number(h.products?.daily_return || 0),
      }))
      .filter(x => x.profit !== 0)
      .sort((a, b) => b.profit - a.profit);
  }, [holdings]);

  /* ============ 搜索 ============ */
  async function handleSearch() {
    const term = searchTerm.trim();
    if (!term) {
      setSearchMode("");
      setSearchResults([]);
      return;
    }
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
    setSearchTerm("");
    setSearchMode("");
    setSearchResults([]);
  }

  function fmtMoney(n: number) {
    if (privacy) return "••••••";
    return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtProfit(n: number) {
    if (privacy) return "••••";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
  }

  const visibleOrder = order.filter(k => !hidden.includes(k));

  /* ============ 模块渲染 ============ */
  function renderHoldingsModule() {
    const id = "holdings";
    const idx = visibleOrder.indexOf(id);
    const total = topHoldings.length;
    const display = topHoldings.slice(0, MAX_PER_MODULE);

    return (
      <div className={`card overflow-hidden mb-4 ${editMode ? "animate-wiggle" : ""}`}>
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="text-[15px] font-bold text-slate-900">我的持仓</div>
            <span className="text-[11px] text-slate-400 tabular">{total} 个</span>
          </div>
          {editMode ? (
            <EditControls
              canUp={idx > 0}
              canDown={idx < visibleOrder.length - 1}
              onMoveUp={() => moveUp(id)}
              onMoveDown={() => moveDown(id)}
              onHide={() => toggleHidden(id)}
            />
          ) : (
            <Link href="/holdings" onClick={handleLinkClick}
                  className="text-[12px] text-purple-600 font-medium
                             hover:text-purple-700 flex items-center gap-0.5">
              全部
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>

        {total === 0 ? (
          <div className="px-5 py-8 text-center">
            <div className="text-slate-300 text-xs mb-3">还没有持仓</div>
            <Link href="/add" className="btn-primary inline-block text-xs px-5 py-2">添加第一笔</Link>
          </div>
        ) : (
          <div>
            {display.map((h: any) => {
              const p = h.products;
              if (!p) return null;
              const info = getBankInfo(p.bank);
              const hold = Number(h.holding_amount || 0);
              const daily = Number(p.daily_return || 0);
              const today = (hold * daily) / 10000;

              return (
                <Link key={h.id} href={`/holdings/${h.id}`} onClick={handleLinkClick}
                      className="flex items-center gap-3 px-5 py-3.5
                                 hover:bg-slate-50 border-t divider
                                 transition-colors duration-200 group">
                  <span className="bank-avatar flex-shrink-0" style={{ background: info.bg, color: info.color }}>
                    {info.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-slate-900 font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{p.bank}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono font-bold text-[14px] text-slate-900 tabular">
                      {privacy ? "••••" : hold.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className={`text-[11px] font-mono tabular mt-0.5 ${
                      today > 0 ? "text-rose-500" : today < 0 ? "text-emerald-500" : "text-slate-400"
                    }`}>
                      {today >= 0 ? "+" : ""}{privacy ? "••" : today.toFixed(2)}
                    </div>
                  </div>
                </Link>
              );
            })}
            {total > MAX_PER_MODULE && !editMode && (
              <Link href="/holdings" onClick={handleLinkClick}
                    className="block text-center py-3 text-[12px] text-purple-600 font-medium
                               hover:bg-purple-50 border-t divider transition-colors">
                查看全部 {total} 个 →
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderTopTodayModule() {
    if (topToday.length === 0) return null;
    const id = "topToday";
    const idx = visibleOrder.indexOf(id);
    const total = topToday.length;
    const display = topToday.slice(0, MAX_PER_MODULE);

    return (
      <div className={`card overflow-hidden mb-4 ${editMode ? "animate-wiggle" : ""}`}>
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="text-[15px] font-bold text-slate-900">今日收益榜</div>
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          </div>
          {editMode ? (
            <EditControls
              canUp={idx > 0}
              canDown={idx < visibleOrder.length - 1}
              onMoveUp={() => moveUp(id)}
              onMoveDown={() => moveDown(id)}
              onHide={() => toggleHidden(id)}
            />
          ) : (
            <Link href="/holdings" onClick={handleLinkClick}
                  className="text-[12px] text-purple-600 font-medium
                             hover:text-purple-700 flex items-center gap-0.5">
              全部
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>

        <div>
          {display.map((row, i) => {
            const info = getBankInfo(row.bank);
            return (
              <Link key={row.id} href={`/holdings/${row.id}`} onClick={handleLinkClick}
                    className="flex items-center gap-3 px-5 py-3.5
                               hover:bg-slate-50 border-t divider
                               transition-colors duration-200 group">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center
                                  text-[11px] font-bold flex-shrink-0 ${
                  i === 0 ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white rank-glow-1"
                  : i === 1 ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white rank-glow-2"
                  : i === 2 ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white rank-glow-3"
                  : "bg-slate-100 text-slate-500"
                }`}>
                  {i + 1}
                </span>
                <span className="bank-avatar flex-shrink-0" style={{ background: info.bg, color: info.color }}>
                  {info.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-900 font-medium truncate">{row.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{row.bank}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`font-mono font-bold text-[14px] tabular ${
                    row.profit > 0 ? "text-rose-500" : "text-emerald-500"
                  }`}>
                    {row.profit >= 0 ? "+" : ""}{privacy ? "••" : row.profit.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {row.rate >= 0 ? "+" : ""}{row.rate.toFixed(2)}%
                  </div>
                </div>
              </Link>
            );
          })}
          {total > MAX_PER_MODULE && !editMode && (
            <Link href="/holdings" onClick={handleLinkClick}
                  className="block text-center py-3 text-[12px] text-purple-600 font-medium
                             hover:bg-purple-50 border-t divider transition-colors">
              查看全部 {total} 个 →
            </Link>
          )}
        </div>
      </div>
    );
  }

  function renderRankingModule() {
    const id = "ranking";
    const idx = visibleOrder.indexOf(id);

    /* 搜索模式：显示搜索结果 */
    if (searchMode) {
      return (
        <div className={`mb-4 ${editMode ? "animate-wiggle" : ""}`}>
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="text-[15px] font-bold text-slate-900">
              搜索「{searchMode}」
            </div>
            {editMode ? (
              <EditControls
                canUp={idx > 0}
                canDown={idx < visibleOrder.length - 1}
                onMoveUp={() => moveUp(id)}
                onMoveDown={() => moveDown(id)}
                onHide={() => toggleHidden(id)}
              />
            ) : (
              <div className="text-[11px] text-slate-400">
                {searchLoading ? "搜索中..." : `${searchResults.length} 个结果`}
              </div>
            )}
          </div>
          <SearchResultList items={searchResults} loading={searchLoading} onLinkClick={handleLinkClick} />
        </div>
      );
    }

    const display = listItems.slice(0, MAX_PER_MODULE);
    const total = listItems.length;

    return (
      <div className={`mb-4 ${editMode ? "animate-wiggle" : ""}`}>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-[15px] font-bold text-slate-900">发现好产品</div>
          {editMode && (
            <EditControls
              canUp={idx > 0}
              canDown={idx < visibleOrder.length - 1}
              onMoveUp={() => moveUp(id)}
              onMoveDown={() => moveDown(id)}
              onHide={() => toggleHidden(id)}
            />
          )}
        </div>

        {!editMode && (
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
        )}

        <HomeRankingList
          items={display}
          loading={listLoading}
          tab={activeTab}
          onLinkClick={handleLinkClick}
        />

        {total > MAX_PER_MODULE && !editMode && (
          <Link href={`/discover?tab=${activeTab}`} onClick={handleLinkClick}
                className="block text-center py-3 mt-3 rounded-2xl
                           bg-slate-50 hover:bg-slate-100
                           text-[12px] text-purple-600 font-medium
                           transition-colors">
            查看更多 →
          </Link>
        )}
      </div>
    );
  }

  const renderModule = (moduleId: string) => {
    switch (moduleId) {
      case "holdings": return renderHoldingsModule();
      case "topToday": return renderTopTodayModule();
      case "ranking": return renderRankingModule();
      default: return null;
    }
  };

  /* ============ 未登录 ============ */
  if (!loading && !username) {
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

          <div className="segment-group flex mb-4">
            {TABS.map((t) => {
              const isActive = activeTab === t.key;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className={`flex-1 py-2.5 text-[13px] segment-item ${
                          isActive ? "segment-item-active" : "hover:text-slate-700"
                        }`}>
                  {t.label}
                </button>
              );
            })}
          </div>

          <HomeRankingList items={listItems} loading={listLoading} tab={activeTab} onLinkClick={handleLinkClick} />

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
  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="h-7 w-32 bg-slate-200/60 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-48 bg-slate-200/60 rounded animate-pulse mb-6" />
          <div className="p-6 mb-5 h-48 rounded-3xl animate-pulse"
               style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 55%, #ec4899 100%)", opacity: 0.35 }} />
        </div>
      </div>
    );
  }

  /* ============ 主界面 ============ */
  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">

              {/* 顶部账号 */}
        <div className="flex justify-between items-center mb-4 animate-fade-in-up">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* 头像 */}
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0
                            bg-gradient-to-br from-violet-500 to-purple-600
                            shadow-md shadow-purple-500/25">
              <span className="text-white font-bold text-[15px]">
                {username ? username.slice(-2) : "观"}
              </span>
            </div>

            {/* 问候 + 时间 */}
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

          {/* 右侧：编辑按钮 或 圆形快捷按钮 */}
          {editMode ? (
            <button
              onClick={() => setEditMode(false)}
              className="px-4 py-2 rounded-full
                         bg-gradient-to-r from-violet-500 to-purple-600
                         text-white text-[12px] font-semibold
                         shadow-md shadow-purple-500/25
                         active:scale-95 transition-all
                         flex-shrink-0"
            >
              完成
            </button>
          ) : (
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
          )}
        </div>


        {/* 编辑模式提示 */}
        {editMode && (
          <div className="card p-3 mb-4 bg-purple-50 border border-purple-100 animate-fade-in">
            <div className="text-[12px] text-purple-700 leading-relaxed px-1">
              <span className="font-semibold">编辑模式</span> · 用 ↑↓ 调整卡片顺序，点 × 隐藏卡片，完成后点右上角"完成"
            </div>
          </div>
        )}

        {/* Hero 卡 */}
        {!editMode && (
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
                  {stats.count > 0 && (
                    <span className="text-[10px] text-white/60 bg-white/10
                                      border border-white/10
                                      px-1.5 py-0.5 rounded-full">
                      {stats.count} 个持仓
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
        )}

        {/* ============ 搜索框 ============ */}
        {!editMode && (
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
        )}

        {/* 快捷入口 */}
        {!editMode && (
          <div className="mb-5 animate-fade-in-up delay-2">
            <div className="grid grid-cols-4 gap-3">
              {QUICK_ACTIONS.map((a) => (
                <Link key={a.key} href={a.href}
                      className="card card-hover p-3 flex flex-col items-center gap-2 group
                                 transition-all duration-300">
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

        {/* 隐藏模块提示 */}
        {!editMode && (
          <HiddenModulesBar
            hidden={hidden}
            onRestore={(id) => toggleHidden(id)}
            onReset={reset}
          />
        )}

        {/* 动态模块 */}
        <div className="animate-fade-in-up delay-3">
          {visibleOrder.map((moduleId) => (
            <div
              key={moduleId}
              onTouchStart={handleLongPressStart}
              onTouchEnd={handleLongPressEnd}
              onTouchMove={handleLongPressEnd}
              onMouseDown={handleLongPressStart}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
            >
              {renderModule(moduleId)}
            </div>
          ))}
        </div>

        {/* 免责声明 */}
        {!editMode && (
          <div className="card-tile p-4 mt-2 mb-8 animate-fade-in-up delay-5">
            <div className="text-[11px] text-slate-400 leading-relaxed">
              <span className="font-medium text-slate-500">免责声明 · </span>
              本站数据来源于公开渠道，仅供学习参考，不构成投资建议。理财有风险，投资需谨慎。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ 榜单列表 ============ */
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
              {i < 3 && (
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center
                                  text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                  i === 0 ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white"
                  : i === 1 ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
                  : "bg-gradient-to-br from-yellow-400 to-amber-400 text-white"
                }`}>{i + 1}</span>
              )}
              {i >= 3 && (
                <span className="w-6 h-6 rounded-lg flex items-center justify-center
                                 text-[10px] font-bold flex-shrink-0 mt-0.5
                                 bg-slate-100 text-slate-500">{i + 1}</span>
              )}
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

/* ============ 搜索结果列表 ============ */
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