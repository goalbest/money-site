"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useCalendarLogic } from "./calendar/useCalendarLogic";
import { fmtMonthCN, todayStr } from "./calendar/utils";
import CalendarGrid from "./calendar/CalendarGrid";
import CalendarList from "./calendar/CalendarList";

export default function CalendarView() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  const [month, setMonth] = useState(currentMonth);
  const [privacy] = useState(false);
  const [bankFilter, setBankFilter] = useState("全部");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "byProduct">("calendar");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);

  const { 
    holdings, navRows, loading, navLoading, 
    dayMap, productDayMap, productMonthlyMap, productZeroDaysMap 
  } = useCalendarLogic(month);

  const availableBanks = useMemo(() => {
    const set = new Set<string>();
    holdings.forEach((h: any) => { if (h.products?.bank) set.add(h.products.bank); });
    return ["全部", ...Array.from(set)];
  }, [holdings]);

  const maxAbs = useMemo(() => {
    let max = 1;
    Object.values(dayMap).forEach(v => { max = Math.max(max, Math.abs(v)); });
    return max;
  }, [dayMap]);

  const selectedProductHolding = selectedProduct != null ? holdings.find(h => h.product_id === selectedProduct) : null;
  const selectedProductMeta = selectedProductHolding?.products;
  const isProductDetailMode = viewMode === "byProduct" && !!selectedProductMeta;

  const selectedProductMonthly = selectedProduct != null ? productMonthlyMap[selectedProduct] || 0 : 0;

  // ===== 辅助计算函数 =====
  const productMonthlyList = useMemo(() => {
    const rows: any[] = [];
    Object.entries(productMonthlyMap).forEach(([pidStr, profit]) => {
      const pid = Number(pidStr);
      const holding = holdings.find((h: any) => h.product_id === pid);
      const meta = holding?.products;
      if (!meta) return;
      if (bankFilter !== "全部" && meta.bank !== bankFilter) return;

      let days = 0;
      Object.keys(productDayMap).forEach(date => {
        if (productDayMap[date][pid] != null) days++;
      });

      rows.push({
        productId: pid, name: meta.name, bank: meta.bank, profit, days,
        zeroDays: productZeroDaysMap[pid] || 0, holdingId: holding?.id,
      });
    });
    return rows.sort((a, b) => b.profit - a.profit);
  }, [productMonthlyMap, productDayMap, productZeroDaysMap, holdings, bankFilter]);

  const dailyList = useMemo(() => {
    if (viewMode === "byProduct" && selectedProduct != null) {
      const rows: { date: string; profit: number; count: number }[] = [];
      Object.entries(productDayMap).forEach(([date, map]) => {
        const p = map[selectedProduct];
        if (p == null) return;
        rows.push({ date, profit: p, count: 1 });
      });
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    }

    const rows: { date: string; profit: number; count: number }[] = [];
    Object.entries(productDayMap).forEach(([date, map]) => {
      let sum = 0, count = 0;
      Object.entries(map).forEach(([pidStr, profit]) => {
        const meta = holdings.find((h: any) => h.product_id === Number(pidStr))?.products;
        if (!meta || (bankFilter !== "全部" && meta.bank !== bankFilter)) return;
        sum += profit;
        count++;
      });
      if (count > 0) rows.push({ date, profit: sum, count });
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [viewMode, selectedProduct, productDayMap, bankFilter, holdings]);

  const displayTotalProfit = useMemo(() => {
    if (viewMode === "byProduct" && selectedProduct != null) return selectedProductMonthly;
    if (bankFilter === "全部") return Object.values(dayMap).reduce((a, b) => a + b, 0);
    let sum = 0;
    Object.entries(productMonthlyMap).forEach(([pidStr, profit]) => {
      if (holdings.find((h: any) => h.product_id === Number(pidStr))?.products?.bank === bankFilter) sum += profit;
    });
    return sum;
  }, [viewMode, selectedProduct, selectedProductMonthly, bankFilter, productMonthlyMap, dayMap, holdings]);

  function getDayProducts(date: string) {
    const rows: any[] = [];
    Object.entries(productDayMap[date] || {}).forEach(([pidStr, profit]) => {
      const meta = holdings.find((h: any) => h.product_id === Number(pidStr))?.products;
      if (!meta || (bankFilter !== "全部" && meta.bank !== bankFilter)) return;
      rows.push({ productId: Number(pidStr), name: meta.name, bank: meta.bank, profit });
    });
    return rows.sort((a, b) => b.profit - a.profit);
  }

  const selectedProductDayProfit = selectedDate != null && selectedProduct != null 
    ? productDayMap[selectedDate]?.[selectedProduct] ?? 0 
    : 0;

  function fmtProfit(n: number) { return privacy ? "••" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}`; }

  function goPrevMonth() {
    const [y, m] = month.split("-").map(Number);
    const prev = new Date(y, m - 2, 1);
    setMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDate(null);
  }
  function goNextMonth() {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(y, m, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDate(null);
  }

  if (loading) return <div className="py-20 text-center text-slate-400 animate-pulse">正在加载...</div>;

  if (holdings.length === 0) {
    return (
      <div className="py-20 text-center">
        <div className="text-[16px] text-slate-800 font-bold mb-2">还没有持仓</div>
        <Link href="/add" className="text-purple-600 text-sm">去添加第一笔理财 →</Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {!isProductDetailMode && (
        <div className="mb-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {availableBanks.map(b => (
              <button key={b} onClick={() => setBankFilter(b)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all shrink-0 ${bankFilter === b ? "bg-slate-800 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600"}`}>
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 日历网格 */}
      <CalendarGrid 
        month={month} productDayMap={productDayMap} dayMap={dayMap} 
        selectedDate={selectedDate} setSelectedDate={setSelectedDate}
        isProductDetailMode={isProductDetailMode} selectedProduct={selectedProduct}
        bankFilter={bankFilter} holdings={holdings} navRows={navRows}
        maxAbs={maxAbs} privacy={privacy}
      />

      <div className="flex items-center justify-between px-1 mb-3">
        <button onClick={goPrevMonth} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-all active:scale-90">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="text-[15px] font-semibold text-slate-900 tabular">{fmtMonthCN(month)}</div>
          {navLoading && (
            <svg className="w-3.5 h-3.5 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
        </div>
        <button onClick={goNextMonth} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-all active:scale-90">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* 底部列表 */}
      <CalendarList
        viewMode={viewMode} setViewMode={setViewMode}
        selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct}
        selectedDate={selectedDate} setSelectedDate={setSelectedDate}
        holdings={holdings} bankFilter={bankFilter}
        dayMap={dayMap} productDayMap={productDayMap} 
        productMonthlyMap={productMonthlyMap} productZeroDaysMap={productZeroDaysMap}
        isProductDetailMode={isProductDetailMode} selectedProductMeta={selectedProductMeta}
        displayTotalProfit={displayTotalProfit}
        dailyList={dailyList} productMonthlyList={productMonthlyList}
        getDayProducts={getDayProducts} fmtProfit={fmtProfit}
        selectedProductDayProfit={selectedProductDayProfit}
      />
    </div>
  );
}