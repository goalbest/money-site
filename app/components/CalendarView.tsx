"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import CalendarGrid from "./calendar/CalendarGrid";
import CalendarList from "./calendar/CalendarList";

const fmtMonthCN = (monthStr: string) => {
  const [y, m] = monthStr.split("-");
  return `${y} 年 ${parseInt(m, 10)} 月`;
};

const fmtW = (num: number) => {
  if (num >= 10000) return `${(num / 10000).toFixed(1)}W`;
  return num.toFixed(0);
};

export default function CalendarView({ allHoldings = [], navHistory = {} }: any) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  const [month, setMonth] = useState(currentMonth);
  const [privacy] = useState(false);
  const [bankFilter, setBankFilter] = useState("全部");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "byProduct">("calendar");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);

  const holdings = useMemo(() => {
    return allHoldings.filter((h: any) => h.status === "active");
  }, [allHoldings]);

  const availableBanks = useMemo(() => {
    const set = new Set<string>();
    holdings.forEach((h: any) => { if (h.products?.bank) set.add(h.products.bank); });
    return ["全部", ...Array.from(set)];
  }, [holdings]);

  // 1. 基础收益计算
  const { dayMap, productDayMap, productMonthlyMap } = useMemo(() => {
    const dMap: Record<string, number> = {};
    const pDayMap: Record<string, Record<number, number>> = {};
    const pMonthMap: Record<number, number> = {};

    holdings.forEach((h: any) => {
      const p = h.products;
      if (!p) return;
      if (bankFilter !== "全部" && p.bank !== bankFilter) return;

      const shares = Number(h.shares || 0);
      if (shares <= 0) return;

      const navs = navHistory[p.id] || [];
      if (navs.length < 2) return;

      const sorted = [...navs].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (let i = 1; i < sorted.length; i++) {
        const today = sorted[i];
        const prev = sorted[i - 1];
        
        if (!today.date.startsWith(month)) continue;
        if (h.hold_date && today.date < h.hold_date) continue;

        const profit = shares * (Number(today.nav) - Number(prev.nav));
        
        dMap[today.date] = (dMap[today.date] || 0) + profit;
        
        if (!pDayMap[today.date]) pDayMap[today.date] = {};
        pDayMap[today.date][p.id] = (pDayMap[today.date][p.id] || 0) + profit;
        
        pMonthMap[p.id] = (pMonthMap[p.id] || 0) + profit;
      }
    });

    return { dayMap: dMap, productDayMap: pDayMap, productMonthlyMap: pMonthMap };
  }, [holdings, navHistory, month, bankFilter]);

  // 2. 计算高级统计
  const monthlyStats = useMemo(() => {
    const dates = Object.keys(dayMap);
    if (dates.length === 0) return null;

    let totalProfit = 0;
    let maxDay = { date: "", profit: -Infinity };
    let minDay = { date: "", profit: Infinity };
    let totalMarketValue = 0;
    let validDays = 0;
    let minMarketValue = Infinity;
    let maxMarketValue = -Infinity;

    const dailyMarketValues: Record<string, number> = {};
    holdings.forEach((h: any) => {
      const p = h.products;
      if (!p) return;
      if (bankFilter !== "全部" && p.bank !== bankFilter) return;
      const shares = Number(h.shares || 0);
      if (shares <= 0) return;

      const navs = navHistory[p.id] || [];
      navs.forEach((nav: any) => {
        if (nav.date.startsWith(month) && (!h.hold_date || nav.date >= h.hold_date)) {
          if (!dailyMarketValues[nav.date]) dailyMarketValues[nav.date] = 0;
          dailyMarketValues[nav.date] += shares * Number(nav.nav);
        }
      });
    });

    dates.forEach(date => {
      const p = dayMap[date];
      totalProfit += p;
      if (p > maxDay.profit) maxDay = { date, profit: p };
      if (p < minDay.profit) minDay = { date, profit: p };
      
      if (dailyMarketValues[date]) {
        const mv = dailyMarketValues[date];
        totalMarketValue += mv;
        validDays++;
        if (mv < minMarketValue) minMarketValue = mv;
        if (mv > maxMarketValue) maxMarketValue = mv;
      }
    });

    const avgMarketValue = validDays > 0 ? totalMarketValue / validDays : 0;
    const wanfen = avgMarketValue > 0 ? (totalProfit / avgMarketValue) * 10000 : 0;
    
    // ★ 核心修复：区分当月和历史月
    const [y, m] = month.split("-").map(Number);
    const isCurrentMonth = (y === now.getFullYear() && m === now.getMonth() + 1);
    // 当月就是已过天数，历史月就是整月天数
    const calcDays = isCurrentMonth ? now.getDate() : new Date(y, m, 0).getDate();

    // 年化公式：用总收益 ÷ 资金 × (365 ÷ 实际持有天数)
    const annualized = avgMarketValue > 0 && calcDays > 0 ? (totalProfit / avgMarketValue) * (365 / calcDays) * 100 : 0;

    return {
      totalProfit, maxDay, minDay, avgMarketValue, wanfen, annualized, 
      minMarketValue: minMarketValue === Infinity ? 0 : minMarketValue,
      maxMarketValue: maxMarketValue === -Infinity ? 0 : maxMarketValue,
      calcDays
    };
  }, [dayMap, month, holdings, navHistory, bankFilter, now]);

  const maxAbs = useMemo(() => {
    let max = 1;
    Object.values(dayMap).forEach(v => { max = Math.max(max, Math.abs(v)); });
    return max;
  }, [dayMap]);

  const selectedProductHolding = selectedProduct != null ? holdings.find(h => h.products?.id === selectedProduct) : null;
  const selectedProductMeta = selectedProductHolding?.products;
  const isProductDetailMode = viewMode === "byProduct" && !!selectedProductMeta;
  const selectedProductMonthly = selectedProduct != null ? productMonthlyMap[selectedProduct] || 0 : 0;

  const productMonthlyList = useMemo(() => {
    const rows: any[] = [];
    Object.entries(productMonthlyMap).forEach(([pidStr, profit]) => {
      const pid = Number(pidStr);
      const holding = holdings.find((h: any) => h.products?.id === pid);
      const meta = holding?.products;
      if (!meta) return;
      if (bankFilter !== "全部" && meta.bank !== bankFilter) return;

      let days = 0;
      Object.keys(productDayMap).forEach(date => {
        if (productDayMap[date][pid] != null) days++;
      });

      rows.push({
        productId: pid, name: meta.name, bank: meta.bank, profit, days,
        zeroDays: 0, holdingId: holding?.id,
      });
    });
    return rows.sort((a, b) => b.profit - a.profit);
  }, [productMonthlyMap, productDayMap, holdings, bankFilter]);

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
        const meta = holdings.find((h: any) => h.products?.id === Number(pidStr))?.products;
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
      if (holdings.find((h: any) => h.products?.id === Number(pidStr))?.products?.bank === bankFilter) sum += profit;
    });
    return sum;
  }, [viewMode, selectedProduct, selectedProductMonthly, bankFilter, productMonthlyMap, dayMap, holdings]);

  function getDayProducts(date: string) {
    const rows: any[] = [];
    Object.entries(productDayMap[date] || {}).forEach(([pidStr, profit]) => {
      const meta = holdings.find((h: any) => h.products?.id === Number(pidStr))?.products;
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

      {/* 月份切换 */}
      <div className="flex items-center justify-between px-1 mb-4">
        <button onClick={goPrevMonth} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-all active:scale-90">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="text-[16px] font-bold text-slate-900 tabular">{fmtMonthCN(month)}</div>
        </div>
        <button onClick={goNextMonth} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-all active:scale-90">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* 数据看板 */}
      {monthlyStats && (
        <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100 mb-2">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">当月收益</div>
              <div className={`font-mono font-bold text-[28px] tracking-tight ${monthlyStats.totalProfit >= 0 ? "text-red-500" : "text-green-500"}`}>
                {monthlyStats.totalProfit > 0 ? "+" : ""}{monthlyStats.totalProfit.toFixed(2)}
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">有效资金</span>
                <span className="text-[10px] text-slate-400">日均</span>
                <span className="font-mono font-bold text-[14px] text-slate-800">{fmtW(monthlyStats.avgMarketValue)}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md">
                <span className="text-[9px] text-slate-400">区间</span>
                <span className="font-mono text-[11px] text-slate-500 font-medium">
                  {fmtW(monthlyStats.minMarketValue)} <span className="text-slate-300">~</span> {fmtW(monthlyStats.maxMarketValue)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {/* ★ 万收框布局优化：左侧万收、右侧日均，上下对齐 */}
            <div className="bg-slate-50 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[10px] text-slate-400">万收</span>
                <span className="text-[10px] text-slate-400">日均</span>
              </div>
              <div className="flex justify-between items-baseline">
                <div className="font-mono font-bold text-[13px] text-slate-800">{monthlyStats.wanfen.toFixed(2)}</div>
                <div className="font-mono font-bold text-[11px] text-slate-500">
                  {(monthlyStats.wanfen / monthlyStats.calcDays).toFixed(2)}
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-2 flex flex-col justify-center">
              <div className="text-[10px] text-slate-400 mb-0.5">年化</div>
              <div className="font-mono font-bold text-[13px] text-slate-800">{monthlyStats.annualized.toFixed(2)}%</div>
            </div>

            <div className="bg-rose-50/60 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-rose-400">最高</span>
                <span className="text-[8px] text-rose-300 font-mono">{monthlyStats.maxDay.date.slice(5)}</span>
              </div>
              <div className="font-mono font-bold text-[13px] text-rose-500">
                +{monthlyStats.maxDay.profit.toFixed(2)}
              </div>
            </div>

            <div className="bg-emerald-50/60 rounded-xl p-2 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-emerald-500">最差</span>
                <span className="text-[8px] text-emerald-400 font-mono">{monthlyStats.minDay.date.slice(5)}</span>
              </div>
              <div className={`font-mono font-bold text-[13px] ${monthlyStats.minDay.profit >= 0 ? "text-red-500" : "text-emerald-600"}`}>
                {monthlyStats.minDay.profit > 0 ? "+" : ""}{monthlyStats.minDay.profit.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-0">
        <CalendarGrid 
          month={month} productDayMap={productDayMap} dayMap={dayMap} 
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          isProductDetailMode={isProductDetailMode} selectedProduct={selectedProduct}
          bankFilter={bankFilter} holdings={holdings} navRows={[]}
          maxAbs={maxAbs} privacy={privacy}
        />
      </div>

      <CalendarList
        viewMode={viewMode} setViewMode={setViewMode}
        selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct}
        selectedDate={selectedDate} setSelectedDate={setSelectedDate}
        holdings={holdings} bankFilter={bankFilter}
        dayMap={dayMap} productDayMap={productDayMap} 
        productMonthlyMap={productMonthlyMap} productZeroDaysMap={{}}
        isProductDetailMode={isProductDetailMode} selectedProductMeta={selectedProductMeta}
        displayTotalProfit={displayTotalProfit}
        dailyList={dailyList} productMonthlyList={productMonthlyList}
        getDayProducts={getDayProducts} fmtProfit={fmtProfit}
        selectedProductDayProfit={selectedProductDayProfit}
      />
    </div>
  );
}