"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import CalendarList from "./calendar/CalendarList";

const fmtMonthCN = (monthStr: string) => {
  const [y, m] = monthStr.split("-");
  return `${y} 年 ${parseInt(m, 10)} 月`;
};

const fmtW = (num: number) => {
  if (num >= 10000) return `${(num / 10000).toFixed(1)}W`;
  return num.toFixed(0);
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export default function CalendarView({ allHoldings = [], navHistory = {}, transactions = [] }: any) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  const [month, setMonth] = useState(currentMonth);
  const [privacy] = useState(false);
  const [bankFilter, setBankFilter] = useState("全部");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "byProduct">("calendar");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);

  const holdings = useMemo(() => {
    return allHoldings.filter((h: any) => h.status === "active" && h.products);
  }, [allHoldings]);

  const availableBanks = useMemo(() => {
    const set = new Set<string>();
    holdings.forEach((h: any) => { if (h.products?.bank) set.add(h.products.bank); });
    return ["全部", ...Array.from(set)];
  }, [holdings]);

  const filteredHoldings = useMemo(() => {
    if (bankFilter === "全部") return holdings;
    return holdings.filter((h: any) => h.products?.bank === bankFilter);
  }, [holdings, bankFilter]);

  // ★ 核心计算：每日收益、正负收益、真实资金额度区间
  const { dayMap, posDayMap, negDayMap, productDayMap, productMonthlyMap, monthlyStats } = useMemo(() => {
    const dMap: Record<string, number> = {};
    const posMap: Record<string, number> = {};
    const negMap: Record<string, number> = {};
    const pDayMap: Record<string, Record<number, number>> = {};
    const pMonthMap: Record<number, number> = {};

    // 1. 计算每天的收益明细
    filteredHoldings.forEach((h: any) => {
      const p = h.products;
      if (!p) return;
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
        if (profit > 0) posMap[today.date] = (posMap[today.date] || 0) + profit;
        if (profit < 0) negMap[today.date] = (negMap[today.date] || 0) + profit;
        
        if (!pDayMap[today.date]) pDayMap[today.date] = {};
        pDayMap[today.date][p.id] = (pDayMap[today.date][p.id] || 0) + profit;
        
        pMonthMap[p.id] = (pMonthMap[p.id] || 0) + profit;
      }
    });

    // 2. 根据交易流水，严格回放当月每一天的真实持仓市值
    const monthRelevantProducts = allHoldings.filter((h: any) => {
      if (bankFilter !== "全部" && h.products?.bank !== bankFilter) return false;
      const pId = h.products?.id;
      if (!pId) return false;
      const hasNav = (navHistory[pId] || []).some((n: any) => n.date.startsWith(month));
      const hasTx = transactions.some((t: any) => t.product_id === pId && t.trade_date.startsWith(month));
      return hasNav || hasTx;
    });

    const monthDates = new Set<string>();
    monthRelevantProducts.forEach((h: any) => {
      const navs = navHistory[h.products.id] || [];
      navs.forEach((n: any) => { if (n.date.startsWith(month)) monthDates.add(n.date); });
    });
    const sortedDates = Array.from(monthDates).sort();

    const dailyMarketValues: Record<string, number> = {};
    
    sortedDates.forEach(date => {
      let dailyTotal = 0;
      monthRelevantProducts.forEach((h: any) => {
        const pId = h.products.id;
        const navs = [...(navHistory[pId] || [])].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        let closestNav = null;
        for (let i = navs.length - 1; i >= 0; i--) {
          if (navs[i].date <= date) { closestNav = navs[i]; break; }
        }
        if (!closestNav) return;
        
        const productTxs = transactions.filter((t: any) => t.product_id === pId && t.trade_date <= date);
        let dailyShares = 0;
        productTxs.forEach((t: any) => {
          if (t.type === "buy") dailyShares += Number(t.shares);
          else if (t.type === "sell" || t.type === "close") dailyShares -= Number(t.shares);
        });

        if (dailyShares > 0) dailyTotal += dailyShares * Number(closestNav.nav);
      });
      if (dailyTotal > 0) dailyMarketValues[date] = dailyTotal;
    });

    // 3. 汇总当月统计与正负收益
    const dates = Object.keys(dMap);
    let totalProfit = 0, totalPos = 0, totalNeg = 0;
    let maxDay = { date: "", profit: -Infinity };
    let minDay = { date: "", profit: Infinity };
    let totalMarketValue = 0;
    let validDays = 0;
    let minMarketValue = Infinity;
    let maxMarketValue = -Infinity;

    dates.forEach(date => {
      const p = dMap[date];
      totalProfit += p;
      if (p > 0) totalPos += p;
      if (p < 0) totalNeg += p;
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
    
    const [y, m] = month.split("-").map(Number);
    const isCurrentMonth = (y === now.getFullYear() && m === now.getMonth() + 1);
    const calcDays = isCurrentMonth ? now.getDate() : new Date(y, m, 0).getDate();
    const annualized = avgMarketValue > 0 && calcDays > 0 ? (totalProfit / avgMarketValue) * (365 / calcDays) * 100 : 0;

    const stats = dates.length > 0 ? {
      totalProfit, totalPos, totalNeg, maxDay, minDay, avgMarketValue, wanfen, annualized, 
      minMarketValue: minMarketValue === Infinity ? 0 : minMarketValue,
      maxMarketValue: maxMarketValue === -Infinity ? 0 : maxMarketValue,
      calcDays
    } : null;

    return { dayMap: dMap, posDayMap: posMap, negDayMap: negMap, productDayMap: pDayMap, productMonthlyMap: pMonthMap, monthlyStats: stats };
  }, [filteredHoldings, allHoldings, navHistory, transactions, month, bankFilter, now]);

  const selectedProductHolding = selectedProduct != null ? holdings.find((h: any) => h.products?.id === selectedProduct) : null;
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
  }, [productMonthlyMap, productDayMap, holdings]);

  // ★ 关键修改：这里直接给 dailyList 附带上了 pos 和 neg 字段
  const dailyList = useMemo(() => {
    if (viewMode === "byProduct" && selectedProduct != null) {
      const rows: { date: string; profit: number; count: number; pos: number; neg: number }[] = [];
      Object.entries(productDayMap).forEach(([date, map]) => {
        const p = map[selectedProduct];
        if (p == null) return;
        rows.push({ 
          date, 
          profit: p, 
          count: 1,
          pos: p > 0 ? p : 0,
          neg: p < 0 ? p : 0
        });
      });
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    }

    const rows: { date: string; profit: number; count: number; pos: number; neg: number }[] = [];
    Object.entries(productDayMap).forEach(([date, map]) => {
      let sum = 0, count = 0;
      Object.entries(map).forEach(([pidStr, profit]) => {
        const meta = filteredHoldings.find((h: any) => h.products?.id === Number(pidStr))?.products;
        if (!meta) return;
        sum += profit;
        count++;
      });
      if (count > 0) {
        rows.push({ 
          date, 
          profit: sum, 
          count,
          pos: posDayMap[date] || 0,
          neg: negDayMap[date] || 0
        });
      }
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [viewMode, selectedProduct, productDayMap, filteredHoldings, posDayMap, negDayMap]);

  const displayTotalProfit = useMemo(() => {
    if (viewMode === "byProduct" && selectedProduct != null) return selectedProductMonthly;
    return Object.values(dayMap).reduce((a, b) => a + b, 0);
  }, [viewMode, selectedProduct, selectedProductMonthly, dayMap]);

  function getDayProducts(date: string) {
    const rows: any[] = [];
    Object.entries(productDayMap[date] || {}).forEach(([pidStr, profit]) => {
      const meta = holdings.find((h: any) => h.products?.id === Number(pidStr))?.products;
      if (!meta) return;
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

  const renderGrid = () => {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDayOfWeek = new Date(y, m - 1, 1).getDay();
    const todayStr = new Date().toISOString().split("T")[0];

    let maxAbsProfit = 1;
    Object.values(dayMap).forEach(v => {
      maxAbsProfit = Math.max(maxAbsProfit, Math.abs(v));
    });

    return (
      <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[11px] text-slate-400 font-medium py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-3 gap-x-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-14" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${month}-${String(day).padStart(2, "0")}`;
            
            const profit = isProductDetailMode && selectedProduct
              ? (productDayMap[dateStr]?.[selectedProduct] || 0)
              : dayMap[dateStr];
              
            const hasData = isProductDetailMode && selectedProduct
              ? (productDayMap[dateStr]?.[selectedProduct] !== undefined)
              : (dayMap[dateStr] !== undefined);

            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;

            let bgStyle: React.CSSProperties = {};
            let textColor = "text-slate-700";

            if (hasData) {
              const ratio = Math.min(1, Math.abs(profit) / maxAbsProfit);
              const opacity = 0.15 + ratio * 0.45;
              if (profit > 0) {
                bgStyle = { backgroundColor: `rgba(244, 63, 94, ${opacity})` };
                textColor = "text-rose-700 font-medium";
              } else if (profit < 0) {
                bgStyle = { backgroundColor: `rgba(16, 185, 129, ${opacity})` };
                textColor = "text-emerald-700 font-medium";
              } else {
                bgStyle = { backgroundColor: `rgba(148, 163, 184, 0.15)` };
                textColor = "text-slate-400";
              }
            }

            const posVal = posDayMap[dateStr] || 0;
            const negVal = negDayMap[dateStr] || 0;

            return (
              <div
                key={day}
                onClick={() => setSelectedDate(dateStr)}
                style={bgStyle}
                className={`relative flex flex-col items-center justify-center h-14 w-full rounded-2xl transition-colors cursor-pointer ${
                  isToday ? "border-[1.5px] border-purple-400 bg-purple-50/20" : 
                  isSelected ? "border border-slate-300" : "border border-transparent"
                }`}
              >
                <span className={`text-[13px] mb-0.5 ${isToday ? "text-purple-700 font-bold" : textColor}`}>
                  {day}
                </span>
                
                {hasData && (
                  <div className="flex flex-col items-center">
                    <div className={`text-[9px] font-mono leading-tight ${textColor}`}>
                      {profit > 0 ? "+" : ""}{profit.toFixed(0)}
                    </div>
                    {(posVal !== 0 || negVal !== 0) && (
                      <div className={`text-[8px] font-mono leading-none scale-90 ${textColor} opacity-80`}>
                        {posVal > 0 && negVal < 0 
                          ? `${posVal.toFixed(0)}/${Math.abs(negVal).toFixed(0)}` 
                          : posVal > 0 
                            ? `${posVal.toFixed(0)}` 
                            : `${Math.abs(negVal).toFixed(0)}`
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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

      {monthlyStats && (
        <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100 mb-2">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">当月收益</div>
              <div className="flex items-baseline gap-3">
                <div className={`font-mono font-bold text-[28px] tracking-tight ${monthlyStats.totalProfit >= 0 ? "text-red-500" : "text-green-500"}`}>
                  {monthlyStats.totalProfit > 0 ? "+" : ""}{monthlyStats.totalProfit.toFixed(2)}
                </div>
                <div className="flex items-center gap-1.5 bg-slate-50/80 px-2 py-0.5 rounded-lg border border-slate-100/50">
                  <span className="text-[12px] font-mono font-bold text-red-500">+{monthlyStats.totalPos.toFixed(0)}</span>
                  <span className="text-slate-300">      </span>
                  <span className="text-[12px] font-mono font-bold text-green-500">{monthlyStats.totalNeg.toFixed(0)}</span>
                </div>
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
        {renderGrid()}
      </div>

      <div className="mt-4">
        <CalendarList
          viewMode={viewMode} setViewMode={setViewMode}
          selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          holdings={filteredHoldings} bankFilter={bankFilter}
          dayMap={dayMap} productDayMap={productDayMap} 
          productMonthlyMap={productMonthlyMap} productZeroDaysMap={{}}
          isProductDetailMode={isProductDetailMode} selectedProductMeta={selectedProductMeta}
          displayTotalProfit={displayTotalProfit}
          dailyList={dailyList} productMonthlyList={productMonthlyList}
          getDayProducts={getDayProducts} fmtProfit={fmtProfit}
          selectedProductDayProfit={selectedProductDayProfit}
        />
      </div>
    </div>
  );
}