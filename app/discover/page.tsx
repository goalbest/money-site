"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { getBankInfo, BANKS } from "../../lib/banks";

type SortKey = "daily_return" | "annualized_1m" | "unit_nav" | "nav_date" | "steady";

const SORTS: { key: SortKey; label: string; field: string }[] = [
  { key: "daily_return",   label: "万收",   field: "daily_return" },
  { key: "annualized_1m",  label: "年化",   field: "annualized_1m" },
  { key: "unit_nav",       label: "净值",   field: "unit_nav" },
  { key: "nav_date",       label: "最新",   field: "nav_date" },
  { key: "steady",         label: "稳健",   field: "annualized_1m" },
];

const PAGE_SIZE = 30;

const LS_BANK = "discover_bank_v1";
const LS_SORT = "discover_sort_v1";

function ProductRow({
  product,
  index,
  rankBase,
}: {
  product: any;
  index: number;
  rankBase: number;
}) {
  const info = getBankInfo(product.bank);
  const rank = rankBase + index + 1;

  const rankStyle =
    rank === 1
      ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white"
      : rank === 2
      ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
      : rank === 3
      ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white"
      : "bg-slate-100 text-slate-500";

  const daily = Number(product.daily_return || 0);
  const annual = Number(product.annualized_1m || 0);
  const nav = product.unit_nav != null ? Number(product.unit_nav) : null;

  return (
    <Link
      href={`/product/${product.id}`}
      className="flex items-center gap-3 px-5 py-3.5
                 hover:bg-slate-50 active:bg-slate-100
                 border-b divider last:border-b-0
                 transition-colors duration-150"
    >
      <span
        className={`w-7 h-7 rounded-lg flex items-center justify-center
                    text-[11px] font-bold flex-shrink-0 tabular ${rankStyle}`}
      >
        {rank}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="bank-avatar flex-shrink-0"
            style={{ background: info.bg, color: info.color }}
          >
            {info.label}
          </span>
          <span className="text-[13px] text-slate-900 font-medium truncate">
            {product.name}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
          <span className="truncate">{product.bank}</span>
          {nav != null && (
            <>
              <span className="text-slate-300">·</span>
              <span className="font-mono tabular">净值 {nav.toFixed(4)}</span>
            </>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div
          className={`font-mono font-bold text-[14px] tabular ${
            daily > 0
              ? "text-rose-500"
              : daily < 0
              ? "text-emerald-500"
              : "text-slate-400"
          }`}
        >
          {daily > 0 ? "+" : ""}
          {daily.toFixed(2)}
        </div>
        <div
          className={`text-[10px] font-mono tabular mt-0.5 ${
            annual > 0 ? "text-slate-500" : "text-slate-400"
          }`}
        >
          {annual > 0 ? "+" : ""}
          {annual.toFixed(2)}%
        </div>
      </div>
    </Link>
  );
}

function DiscoverInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [bank, setBank] = useState("全部");
  const [sortKey, setSortKey] = useState<SortKey>("daily_return");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const reqIdRef = useRef(0);

  /* ---------- 首帧：读 localStorage + URL 参数 ---------- */
  useEffect(() => {
    try {
      const b = localStorage.getItem(LS_BANK);
      const s = localStorage.getItem(LS_SORT) as SortKey | null;
      if (b) setBank(b);
      if (s && SORTS.some(x => x.key === s)) setSortKey(s);
    } catch {}

    /* ★ 读 URL ?q=xxx 自动搜索 */
    const q = searchParams?.get("q");
    if (q && q.trim()) {
      setSearchTerm(q);
      runSearch(q.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 数据加载 ---------- */
  const loadProducts = useCallback(
    async (reset: boolean) => {
      const myReq = ++reqIdRef.current;
      const offset = reset ? 0 : items.length;

      if (reset) setLoading(true);
      else setLoadingMore(true);

      const sort = SORTS.find(s => s.key === sortKey)!;
      const field = sort.field;

      let query = supabase
        .from("products")
        .select(
          "id, name, bank, code, unit_nav, daily_return, annualized_1m, nav_date"
        )
        .not(field, "is", null);

      if (sortKey === "steady") {
        query = query.gt("annualized_1m", 0).gt("daily_return", 0);
      } else if (sortKey !== "nav_date") {
        query = query.gt(field, 0);
      }

      if (bank !== "全部") {
        query = query.eq("bank", bank);
      }

      const { data } = await query
        .order(field, { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (myReq !== reqIdRef.current) return;

      const list = data || [];
      setItems(prev => (reset ? list : [...prev, ...list]));
      setHasMore(list.length === PAGE_SIZE);
      setLoading(false);
      setLoadingMore(false);
    },
    [bank, sortKey, items.length]
  );

  useEffect(() => {
    loadProducts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, sortKey]);

  function selectBank(b: string) {
    setBank(b);
    try { localStorage.setItem(LS_BANK, b); } catch {}
  }

  function selectSort(k: SortKey) {
    setSortKey(k);
    try { localStorage.setItem(LS_SORT, k); } catch {}
  }

  /* ---------- 搜索 ---------- */
  async function runSearch(term: string) {
    if (!term) return;
    setSearchMode(term);
    setSearchLoading(true);
    let query = supabase
      .from("products")
      .select(
        "id, name, bank, code, unit_nav, daily_return, annualized_1m, nav_date"
      )
      .or(`name.ilike.%${term}%,bank.ilike.%${term}%,code.ilike.%${term}%`)
      .limit(60);

    if (bank !== "全部") {
      query = query.eq("bank", bank);
    }
    const { data } = await query;
    setSearchResults(data || []);
    setSearchLoading(false);
  }

  async function handleSearch() {
    const term = searchTerm.trim();
    if (!term) {
      setSearchMode("");
      setSearchResults([]);
      return;
    }
    await runSearch(term);
  }

  function clearSearch() {
    setSearchTerm("");
    setSearchMode("");
    setSearchResults([]);
    /* 清掉 URL 上的 ?q= */
    router.replace("/discover");
  }

  const bankChips = ["全部", ...BANKS.slice(0, -1).map(b => b.name)];

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">
              发现好产品
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              全库 {items.length > 0 ? `${items.length}+ ` : ""}产品 · 按维度排行
            </div>
          </div>
        </div>

        {/* 搜索框 */}
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
                       active:scale-95 transition-all duration-200"
          >
            搜索
          </button>
        </div>

        {searchMode ? (
          <div className="animate-fade-in-up">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-[14px] font-bold text-slate-900">
                搜索「{searchMode}」
              </div>
              <div className="text-[11px] text-slate-400">
                {searchLoading ? "搜索中..." : `${searchResults.length} 个结果`}
              </div>
            </div>
            {searchLoading ? (
              <div className="card p-6 text-center text-[12px] text-slate-400">
                搜索中...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="text-slate-300 text-sm mb-2">没有找到匹配的产品</div>
                <div className="text-[11px] text-slate-400">试试搜索银行名或产品代码</div>
              </div>
            ) : (
              <div className="card overflow-hidden">
                {searchResults.map((p, i) => (
                  <ProductRow key={p.id} product={p} index={i} rankBase={0} />
                ))}
              </div>
            )}
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
        ) : (
          <>
            <div className="mb-3 animate-fade-in-up">
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
                {bankChips.map((b) => {
                  const isActive = bank === b;
                  const info = b === "全部" ? null : getBankInfo(b);
                  return (
                    <button
                      key={b}
                      onClick={() => selectBank(b)}
                      className={`bank-pill ${isActive ? "bank-pill-active" : ""}`}
                      style={!isActive && info ? { borderColor: info.bg } : undefined}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4 animate-fade-in-up delay-1">
              <div className="segment-group flex">
                {SORTS.map((s) => {
                  const isActive = sortKey === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => selectSort(s.key)}
                      className={`flex-1 py-2.5 text-[12px] segment-item ${
                        isActive ? "segment-item-active" : "hover:text-slate-700"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="animate-fade-in-up delay-2">
              {loading ? (
                <div className="card overflow-hidden">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-5 py-4 border-b divider last:border-b-0"
                    >
                      <div className="w-7 h-7 rounded-lg bg-slate-100 animate-pulse" />
                      <div className="flex-1">
                        <div className="h-4 bg-slate-100 rounded animate-pulse mb-2 w-3/4" />
                        <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
                      </div>
                      <div className="w-12 h-4 bg-slate-100 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="card p-12 text-center">
                  <div className="text-slate-300 text-sm mb-2">
                    {bank === "全部" ? "暂无产品数据" : `${bank} 暂无产品`}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    换个银行或排序看看
                  </div>
                </div>
              ) : (
                <>
                  <div className="card overflow-hidden">
                    {items.map((p, i) => (
                      <ProductRow key={p.id} product={p} index={i} rankBase={0} />
                    ))}
                  </div>

                  {hasMore && (
                    <button
                      onClick={() => loadProducts(false)}
                      disabled={loadingMore}
                      className="w-full mt-4 py-3 rounded-2xl
                                 bg-white border border-slate-200
                                 hover:bg-slate-50 hover:border-slate-300
                                 active:scale-[0.99]
                                 text-[13px] text-slate-600 font-medium
                                 transition-all duration-200
                                 disabled:opacity-50"
                    >
                      {loadingMore ? "加载中..." : "加载更多"}
                    </button>
                  )}

                  {!hasMore && items.length > 0 && (
                    <div className="text-center text-[11px] text-slate-300 mt-4 py-2">
                      已经到底了 · 共 {items.length} 个
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">加载中...</div>
      </div>
    }>
      <DiscoverInner />
    </Suspense>
  );
}