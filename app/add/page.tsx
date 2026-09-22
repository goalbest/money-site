"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import PageHeader from "../PageHeader";

export default function AddPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  // 搜索
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  // 交易信息
  const [nav, setNav] = useState("");
  const [navDate, setNavDate] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().split("T")[0]);
  const [loadingNav, setLoadingNav] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
  }, [router]);

  // 搜索防抖
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchTerm.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, bank, code, t_plus_days")
        .or(`name.ilike.%${searchTerm}%,bank.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
        .limit(20);
      setResults(data || []);
      setSearching(false);
      setShowResults(true);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchTerm]);

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 选中产品 + 日期变化时，自动查净值
  useEffect(() => {
    if (!selected || !buyDate) return;
    let cancelled = false;
    setLoadingNav(true);

    (async () => {
      const { data } = await supabase
        .from("nav_history")
        .select("nav_date, unit_nav")
        .eq("product_id", selected.id)
        .lte("nav_date", buyDate)
        .order("nav_date", { ascending: false })
        .limit(1);

      if (cancelled) return;

      if (data && data.length > 0) {
        const navVal = Number(data[0].unit_nav);
        setNav(navVal.toFixed(4));
        setNavDate(data[0].nav_date);
        if (amount && Number(amount) > 0) {
          setShares((Number(amount) / navVal).toFixed(4));
        }
      } else {
        setNav("");
        setNavDate(null);
      }
      setLoadingNav(false);
    })();

    return () => { cancelled = true; };
  }, [selected, buyDate]);

  // 三字段联动
  function handleNavChange(v: string) {
    setNav(v);
    const n = Number(v);
    if (n > 0 && amount && Number(amount) > 0) {
      setShares((Number(amount) / n).toFixed(4));
    }
  }

  function handleAmountChange(v: string) {
    setAmount(v);
    const n = Number(nav);
    if (n > 0 && Number(v) > 0) {
      setShares((Number(v) / n).toFixed(4));
    }
  }

  function handleSharesChange(v: string) {
    setShares(v);
    const n = Number(nav);
    if (n > 0 && Number(v) > 0) {
      setAmount((Number(v) * n).toFixed(2));
    }
  }

  function selectProduct(p: any) {
    setSelected(p);
    setSearchTerm(p.name);
    setShowResults(false);
    // 保留金额、净值等字段，如果换产品则清空
    setNav("");
    setNavDate(null);
    setShares("");
    setAmount("");
  }

  function clearSelected() {
    setSelected(null);
    setSearchTerm("");
    setNav("");
    setNavDate(null);
    setAmount("");
    setShares("");
    setMsg("");
  }

  async function handleSubmit() {
    if (!selected) return setMsg("请先选择产品");
    if (!nav || Number(nav) <= 0) return setMsg("请填写有效的净值");
    if (!amount || Number(amount) <= 0) return setMsg("请填写有效的购买金额");
    if (!shares || Number(shares) <= 0) return setMsg("请填写有效的份额");
    if (!userId) return;

    setSubmitting(true);
    setMsg("");

    try {
      const buyAmt = Number(amount);
      const shareNum = Number(shares);
      const navNum = Number(nav);

      const { data: existing } = await supabase
        .from("user_holdings")
        .select("id, holding_amount, shares")
        .eq("user_id", userId)
        .eq("product_id", selected.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("user_holdings")
          .update({
            holding_amount: Number(existing.holding_amount || 0) + buyAmt,
            shares: Number(existing.shares || 0) + shareNum,
            status: "active",
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("user_holdings").insert({
          user_id: userId,
          product_id: selected.id,
          holding_amount: buyAmt,
          shares: shareNum,
          hold_date: buyDate,
          status: "active",
        });
      }

      await supabase.from("transactions").insert({
        user_id: userId,
        product_id: selected.id,
        type: "buy",
        amount: buyAmt,
        shares: shareNum,
        price: navNum,
        trade_date: buyDate,
        note: existing ? "追加购买" : "首次购买",
      });

      localStorage.removeItem("cache_home_cache_v2");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");

      router.push("/holdings");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="添加产品" backHref="/" />

      <div className="container mx-auto px-4 -mt-4 max-w-2xl">
        {/* ============== 搜索框（始终显示）============== */}
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            搜索产品
          </label>

          <div ref={searchBoxRef} className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                // 用户改搜索词时，清空已选中的产品
                if (selected && e.target.value !== selected.name) {
                  setSelected(null);
                }
              }}
              onFocus={() => searchTerm.trim() && !selected && setShowResults(true)}
              placeholder="输入产品名称、银行或代码"
              className="w-full border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />

            {showResults && !selected && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 max-h-80 overflow-y-auto">
                {searching ? (
                  <div className="p-4 text-center text-xs text-gray-400">搜索中...</div>
                ) : results.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">没有找到该产品</div>
                ) : (
                  results.map(r => (
                    <button
                      key={r.id}
                      onClick={() => selectProduct(r)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-b-0 transition"
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="text-sm text-gray-800 flex-1 pr-2 leading-snug">{r.name}</div>
                        <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                          {r.bank}
                        </span>
                      </div>
                      {r.code && <div className="text-[10px] text-gray-400 font-mono">{r.code}</div>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============== 已选中产品卡片 ============== */}
        {selected && (
          <div className="bg-blue-50 rounded-2xl p-4 shadow-sm mb-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 mb-1.5 leading-snug">{selected.name}</div>
              <div className="flex flex-wrap gap-3 text-[10px] text-gray-500">
                <span>{selected.bank}</span>
                {selected.code && <span className="font-mono">{selected.code}</span>}
              </div>
            </div>
            <button onClick={clearSelected} className="text-blue-600 text-xs hover:underline whitespace-nowrap flex-shrink-0">
              重选
            </button>
          </div>
        )}

        {/* ============== 交易信息 ============== */}
        {selected && (
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <div className="text-sm font-medium text-gray-700 mb-4">交易信息</div>

            <div className="space-y-4">
              {/* 购买日期 */}
              <div>
                <label className="block text-xs text-gray-500 mb-2">购买日期</label>
                <input
                  type="date"
                  value={buyDate}
                  onChange={(e) => setBuyDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {loadingNav && <div className="text-[10px] text-gray-400 mt-1.5">正在查当日净值...</div>}
                {!loadingNav && navDate && (
                  <div className="text-[10px] text-gray-400 mt-1.5">
                    已匹配净值日 <span className="text-gray-600">{navDate}</span>
                  </div>
                )}
              </div>

              {/* 净值 */}
              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  净值 <span className="text-gray-400 ml-1">自动填充，可修改</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={nav}
                  onChange={(e) => handleNavChange(e.target.value)}
                  placeholder="如 1.0556"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 金额 */}
              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  购买金额（元）<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="如 50000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {Number(amount) > 0 && (
                  <div className="text-[10px] text-gray-400 mt-1.5 font-mono">
                    ¥ {Number(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>

              {/* 份额 */}
              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  份额（份）<span className="text-gray-400 ml-1">自动计算，可修改</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={shares}
                  onChange={(e) => handleSharesChange(e.target.value)}
                  placeholder="自动计算"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {nav && Number(nav) > 0 && (
                <div className="bg-gray-50 rounded-xl px-3 py-2 text-[10px] text-gray-400 leading-relaxed">
                  净值 × 份额 = 金额
                </div>
              )}
            </div>

            {msg && (
              <div className="mt-4 text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{msg}</div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full mt-5 bg-blue-600 text-white py-3.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {submitting ? "保存中..." : "确认添加"}
            </button>
          </div>
        )}

        {!selected && (
          <div className="text-xs text-gray-400 text-center py-6 leading-relaxed">
            从搜索结果中选择一个产品
          </div>
        )}
      </div>
    </div>
  );
}