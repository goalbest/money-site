"use client";

import { useState, useMemo, useEffect } from "react";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const fmtMonthCN = (monthStr: string) => {
  const [y, m] = monthStr.split("-");
  return `${y} 年 ${parseInt(m, 10)} 月`;
};

export default function FundCalendar({ 
  data = [], 
  historyMap = {}, 
  activeTab = "all" 
}: { 
  data: any[]; 
  historyMap: Record<string, any[]>; 
  activeTab?: string; 
}) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  const [month, setMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // ★ 自动寻找有数据的月份，防止用户当前月没数据导致满屏空白
  useEffect(() => {
    if (!historyMap || Object.keys(historyMap).length === 0) return;
    let latestDate = "";
    Object.values(historyMap).forEach(hist => {
      const last = hist[hist.length - 1];
      if (last && last.date && last.date > latestDate) latestDate = last.date;
    });
    if (latestDate) {
      const latestMonth = latestDate.slice(0, 7);
      if (latestMonth < currentMonth) {
         setMonth(latestMonth);
      }
    }
  }, [historyMap, currentMonth]);

  const { dayMap, posDayMap, negDayMap, productDayMap, monthlyStats } = useMemo(() => {
    const dMap: Record<string, number> = {};
    const posMap: Record<string, number> = {};
    const negMap: Record<string, number> = {};
    const pDayMap: Record<string, Record<string, number>> = {};
    
    const filteredData = data;

    filteredData.forEach((item) => {
      const fs = Array.isArray(item.fund_stocks) ? item.fund_stocks[0] : item.fund_stocks;
      if (!fs) return;
      
      const shares = Number(item.shares || 0);
      if (shares <= 0) return;

      const hist = historyMap[fs.id] || [];
      if (hist.length < 2) return;

      for (let i = 1; i < hist.length; i++) {
        const today = hist[i];
        const prev = hist[i - 1];
        
        if (!today.date.startsWith(month)) continue;
        
        // 确保价格是数字，防止 NaN 污染数据
        const p1 = Number(today.price);
        const p2 = Number(prev.price);
        if (isNaN(p1) || isNaN(p2)) continue;

        const profit = shares * (p1 - p2);

        dMap[today.date] = (dMap[today.date] || 0) + profit;
        if (profit > 0) posMap[today.date] = (posMap[today.date] || 0) + profit;
        if (profit < 0) negMap[today.date] = (negMap[today.date] || 0) + profit;

        if (!pDayMap[today.date]) pDayMap[today.date] = {};
        pDayMap[today.date][fs.id] = (pDayMap[today.date][fs.id] || 0) + profit;
      }
    });

    const dates = Object.keys(dMap);
    let totalProfit = 0, totalPos = 0, totalNeg = 0;
    let maxDay = { date: "", profit: -Infinity };
    let minDay = { date: "", profit: Infinity };

    dates.forEach(date => {
      const p = dMap[date];
      totalProfit += p;
      if (p > 0) totalPos += p;
      if (p < 0) totalNeg += p;
      if (p > maxDay.profit) maxDay = { date, profit: p };
      if (p < minDay.profit) minDay = { date, profit: p };
    });

    const stats = dates.length > 0 ? {
      totalProfit, totalPos, totalNeg, maxDay, minDay
    } : null;

    return { dayMap: dMap, posDayMap: posMap, negDayMap: negMap, productDayMap: pDayMap, monthlyStats: stats };
  }, [data, historyMap, month]);

  const goPrevMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const prev = new Date(y, m - 2, 1);
    setMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDate(null);
  };
  const goNextMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(y, m, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDate(null);
  };

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
      <div className="bg-white rounded-[24px] p-4 shadow-sm border border-slate-100">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[11px] text-slate-400 font-medium py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-2 gap-x-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-12" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${month}-${String(day).padStart(2, "0")}`;
            
            const profit = dayMap[dateStr];
            const hasData = profit !== undefined;
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

            return (
              <div
                key={day}
                onClick={() => setSelectedDate(dateStr)}
                style={bgStyle}
                className={`relative flex flex-col items-center justify-center h-12 w-full rounded-xl transition-colors cursor-pointer ${
                  isToday ? "border-[1.5px] border-purple-400 bg-purple-50/20" : 
                  isSelected ? "border border-slate-300" : "border border-transparent"
                }`}
              >
                <span className={`text-[12px] mb-0.5 ${isToday ? "text-purple-700 font-bold" : textColor}`}>
                  {day}
                </span>
                {hasData && (
                  <div className={`text-[9px] font-mono leading-tight ${textColor}`}>
                    {profit > 0 ? "+" : ""}{profit.toFixed(0)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getDayProducts = (date: string) => {
    const rows: any[] = [];
    Object.entries(productDayMap[date] || {}).forEach(([pid, profit]) => {
      const holding = data.find((h: any) => {
        const fs = Array.isArray(h.fund_stocks) ? h.fund_stocks[0] : h.fund_stocks;
        return fs?.id === pid;
      });
      const fs = Array.isArray(holding?.fund_stocks) ? holding.fund_stocks[0] : holding?.fund_stocks;
      if (!fs) return;
      rows.push({ productId: pid, name: fs.name, code: fs.code, type: fs.type, profit });
    });
    return rows.sort((a, b) => b.profit - a.profit);
  };

  const dailyList = useMemo(() => {
    const rows: { date: string; profit: number; count: number }[] = [];
    Object.entries(productDayMap).forEach(([date, map]) => {
      let sum = 0, count = 0;
      Object.values(map).forEach(p => { sum += p; count++; });
      if (count > 0) rows.push({ date, profit: sum, count });
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [productDayMap]);

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      <div className="flex items-center justify-between px-2">
        <button onClick={goPrevMonth} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="text-[15px] font-bold text-slate-900">{fmtMonthCN(month)}</div>
        <button onClick={goNextMonth} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {monthlyStats && (
        <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100">
          <div className="text-[11px] text-slate-400 mb-1">当月累计收益</div>
          <div className="flex items-baseline gap-3 mb-4">
            <div className={`font-mono font-bold text-[26px] tracking-tight ${monthlyStats.totalProfit >= 0 ? "text-red-500" : "text-green-500"}`}>
              {monthlyStats.totalProfit > 0 ? "+" : ""}{monthlyStats.totalProfit.toFixed(2)}
            </div>
            <div className="flex items-center gap-2 bg-slate-50/80 px-2 py-0.5 rounded-md border border-slate-100">
              <span className="text-[11px] font-mono font-medium text-red-500">+{monthlyStats.totalPos.toFixed(0)}</span>
              <span className="text-[11px] font-mono font-medium text-green-500">{monthlyStats.totalNeg.toFixed(0)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-rose-50/60 rounded-xl p-2 flex flex-col justify-center">
              <div className="text-[10px] text-rose-500 mb-0.5">最高日 ({monthlyStats.maxDay.date.slice(5)})</div>
              <div className="font-mono font-bold text-[13px] text-rose-600">+{monthlyStats.maxDay.profit.toFixed(2)}</div>
            </div>
            <div className="bg-emerald-50/60 rounded-xl p-2 flex flex-col justify-center">
              <div className="text-[10px] text-emerald-600 mb-0.5">最低日 ({monthlyStats.minDay.date.slice(5)})</div>
              <div className="font-mono font-bold text-[13px] text-emerald-600">{monthlyStats.minDay.profit.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {renderGrid()}

      <div className="bg-white rounded-[24px] overflow-hidden shadow-sm border border-slate-100 mb-6">
        {selectedDate ? (
          <>
            <div className="px-4 py-3 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedDate(null)} className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-[13px] font-bold text-slate-900">{selectedDate.slice(5).replace("-", " 月 ")} 日明细</span>
              </div>
              <span className={`font-mono font-bold text-[14px] ${dayMap[selectedDate] > 0 ? "text-red-500" : "text-green-500"}`}>
                {dayMap[selectedDate] > 0 ? "+" : ""}{(dayMap[selectedDate] || 0).toFixed(2)}
              </span>
            </div>
            <div>
              {getDayProducts(selectedDate).map((row) => (
                <div key={row.productId} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 last:border-0">
                  <div>
                    <div className="text-[13px] font-medium text-slate-800">{row.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{row.code}</div>
                  </div>
                  <div className={`font-mono font-bold text-[14px] ${row.profit > 0 ? "text-red-500" : row.profit < 0 ? "text-green-500" : "text-slate-400"}`}>
                    {row.profit > 0 ? "+" : ""}{row.profit.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-100">
              <span className="text-[13px] font-bold text-slate-900">每日收益明细</span>
            </div>
            <div>
              {dailyList.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">本月暂无收益数据</div>
              ) : (
                dailyList.map((row) => (
                  <button key={row.date} onClick={() => setSelectedDate(row.date)} className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 text-left transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold ${row.profit > 0 ? "bg-rose-50 text-rose-600" : row.profit < 0 ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                        {Number(row.date.slice(-2))}
                      </div>
                      <div>
                        <div className="text-[12px] text-slate-800 font-medium">{row.date.slice(5).replace("-", " 月 ")} 日</div>
                        <div className="text-[10px] text-slate-400">{row.count} 个产品变动</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-bold text-[14px] ${row.profit > 0 ? "text-red-500" : row.profit < 0 ? "text-green-500" : "text-slate-400"}`}>
                        {row.profit > 0 ? "+" : ""}{row.profit.toFixed(2)}
                      </span>
                      <div className="flex items-center gap-1.5 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        <span className="text-[10px] font-mono text-red-500">+{(posDayMap[row.date] || 0).toFixed(0)}</span>
                        <span className="text-[10px] font-mono text-green-500">{(negDayMap[row.date] || 0).toFixed(0)}</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}