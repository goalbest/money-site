"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useCountUp } from "../../../lib/useCountUp";
import Pagination from "./Pagination";

export default function DepositTab({
  transactions, snapshots, realWealthAmount, fundStats, searchTerm, openSnapshot, openDetail
}: any) {
  const [isAssetExpanded, setIsAssetExpanded] = useState(false);
  const [depositPage, setDepositPage] = useState(1);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const [syncFund, setSyncFund] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("sync_fund_ledger") === "true";
    return false;
  });
  const [syncStock, setSyncStock] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("sync_stock_ledger") === "true";
    return false;
  });

  useEffect(() => {
    localStorage.setItem("sync_fund_ledger", String(syncFund));
    localStorage.setItem("sync_stock_ledger", String(syncStock));
  }, [syncFund, syncStock]);

  const PAGE_SIZE = 20;

  const monthReport = useMemo(() => {
    const currentY = new Date().getFullYear();
    const currentM = new Date().getMonth() + 1;
    const nowMonthStr = `${currentY}-${String(currentM).padStart(2, '0')}`;

    let earliestDate = nowMonthStr;
    transactions.forEach((t: any) => { if (t.trade_date < earliestDate) earliestDate = t.trade_date.slice(0, 7); });
    snapshots.forEach((s: any) => { if (s.month < earliestDate) earliestDate = s.month; });

    const allMonths = [];
    let [startY, startM] = earliestDate.split("-").map(Number);
    let [endY, endM] = nowMonthStr.split("-").map(Number);

    let y = endY, m = endM;
    while (y > startY || (y === startY && m >= startM)) {
      allMonths.push(`${y}-${String(m).padStart(2, '0')}`);
      m--;
      if (m === 0) { m = 12; y--; }
    }

    const ascMonths = [...allMonths].reverse();
    let lastEndBalance = 0;

    const calculated = ascMonths.map((m) => {
      const flow = transactions.filter((t: any) => t.trade_date.startsWith(m));
      const income = flow.filter((t: any) => t.type === "转入").reduce((s: any, t: any) => s + Number(t.amount), 0);
      const expense = flow.filter((t: any) => t.type === "转出").reduce((s: any, t: any) => s + Number(t.amount), 0);
      
      const snap = snapshots.find((s: any) => s.month === m);
      const trueTotal = snap ? Number(snap.total_assets) : null;
      
      let startBalance = lastEndBalance;
      if (snap?.details?.start_balance) startBalance = Number(snap.details.start_balance);
      
      let calcEndBalance = startBalance + income - expense;
      if (trueTotal !== null) calcEndBalance = trueTotal;
      
      let diff = null;
      if (trueTotal !== null) diff = trueTotal - (startBalance + income - expense);

      lastEndBalance = calcEndBalance;
      return { month: m, income, expense, startBalance, calcEndBalance, trueTotal, diff };
    });

    return calculated.reverse();
  }, [transactions, snapshots]);

  const latestSnapshot = snapshots[0] || null;

  const displayDist = useMemo(() => {
    let baseDist: Record<string, number> = {};
    if (latestSnapshot) {
      const detailObj = latestSnapshot.details || {};
      const order = detailObj._order || Object.keys(detailObj).filter(k => k !== "start_balance" && k !== "_order" && k !== "_locked" && k !== "snapshotDate");
      order.forEach((k: string) => { if (detailObj[k] !== undefined) baseDist[k] = Number(detailObj[k]); });

      const snapDate = latestSnapshot.details?.snapshotDate || `${latestSnapshot.month}-01`;
      transactions.forEach((t: any) => {
        if (t.trade_date > snapDate) {
          const acc = t.account || "余额";
          if (baseDist[acc] === undefined) baseDist[acc] = 0; 
          if (t.type === "转入") baseDist[acc] += Number(t.amount);
          else baseDist[acc] -= Number(t.amount);
        }
      });
    }
    
    if (syncFund && fundStats) baseDist["基金"] = fundStats.fundValue;
    else baseDist["基金"] = baseDist["基金"] || 0;

    if (syncStock && fundStats) baseDist["股票"] = fundStats.stockValue;
    else baseDist["股票"] = baseDist["股票"] || 0;

    baseDist["理财"] = realWealthAmount || 0;
    return baseDist;
  }, [latestSnapshot, realWealthAmount, transactions, syncFund, syncStock, fundStats]);

  const currentTotalAssets = useMemo(() => {
    let sum = 0;
    Object.values(displayDist).forEach(val => { sum += Number(val) || 0; });
    return sum;
  }, [displayDist]);

  const animatedAssets = useCountUp(currentTotalAssets, 1000);

  const allDepositRecords = useMemo(() => {
    const snapRecords = snapshots.map((s: any) => {
      const totalAssets = Number(s.total_assets);
      const dateStr = s.details?.snapshotDate || `${s.month}-28`;
      return { id: `snap-${s.id || s.month}`, isSnapshot: true, trade_date: dateStr, type: "对账", amount: totalAssets, note: `登记月末资产`, category: "资产登记", account: "全部", original: s };
    });
    return [...transactions, ...snapRecords].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  }, [transactions, snapshots]);

  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return allDepositRecords;
    const kw = searchTerm.toLowerCase();
    return allDepositRecords.filter((t: any) => (t.note || "").toLowerCase().includes(kw) || (t.category || "").toLowerCase().includes(kw) || (t.account || "").toLowerCase().includes(kw));
  }, [allDepositRecords, searchTerm]);

  const paginatedTransactions = filteredTransactions.slice((depositPage - 1) * PAGE_SIZE, depositPage * PAGE_SIZE);
  
  const groupedPageTransactions = useMemo(() => {
    const groups: Record<string, any[]> = {};
    paginatedTransactions.forEach((t: any) => {
      const m = t.trade_date.slice(0, 7);
      if (!groups[m]) groups[m] = [];
      groups[m].push(t);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [paginatedTransactions]);

  const handleAssetPressStart = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      openSnapshot(latestSnapshot?.month || new Date().toISOString().slice(0, 7));
      if (typeof navigator !== "undefined" && "vibrate" in navigator) { try { (navigator as any).vibrate(10); } catch {} }
    }, 400);
  };
  const handleAssetPressEnd = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* 大卡片 */}
      <div 
        onMouseDown={handleAssetPressStart} onMouseUp={handleAssetPressEnd} onMouseLeave={handleAssetPressEnd}
        onTouchStart={handleAssetPressStart} onTouchEnd={handleAssetPressEnd} onTouchMove={handleAssetPressEnd}
        onContextMenu={(e) => e.preventDefault()}
        className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 p-6 shadow-xl shadow-purple-500/20 cursor-pointer select-none active:scale-[0.99] transition-transform"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-fuchsia-400/30 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-2">
            {/* 左侧：点击展开 */}
            <div className="cursor-pointer flex-1" onClick={(e) => { e.stopPropagation(); setIsAssetExpanded(!isAssetExpanded); }}>
              <div className="text-[13px] text-white/80 font-medium tracking-widest mb-1">当前总资产（元）</div>
              <div className="text-white leading-none font-mono font-bold tracking-tight tabular flex items-baseline text-[36px] sm:text-[44px]">
                <span className="text-[24px] mr-1 font-sans">¥</span>
                {animatedAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            
            {/* 右侧：只有箭头 */}
            <div className="flex flex-col items-end gap-1.5 justify-center h-full pt-2">
              <div 
                className={`w-8 h-8 rounded-full bg-white/10 flex items-center justify-center backdrop-blur transition-transform duration-300 cursor-pointer z-20 ${isAssetExpanded ? "rotate-180" : ""}`}
                onClick={(e) => { e.stopPropagation(); setIsAssetExpanded(!isAssetExpanded); }}
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>
          
          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isAssetExpanded ? "max-h-[600px] opacity-100 mt-5" : "max-h-0 opacity-0 mt-0"}`}>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(displayDist).length === 0 ? (
                <div className="col-span-2 text-[11px] text-white/60">暂无明细</div>
              ) : (
                Object.entries(displayDist).map(([name, amount]) => {
                  const isFund = name === "基金";
                  const isStock = name === "股票";
                  return (
                    <div key={name} className="bg-white/10 rounded-xl p-3 flex flex-col justify-between border border-white/5 backdrop-blur-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[11px] text-white/70">{name}</span>
                        {/* ★ 把开关放进基金和股票的卡片里 */}
                        {(isFund || isStock) && (
                          <div 
                            className="flex items-center gap-1 cursor-pointer z-20"
                            onClick={(e) => { e.stopPropagation(); isFund ? setSyncFund(!syncFund) : setSyncStock(!syncStock); }}
                          >
                            <span className="text-[8px] text-white/60">{(isFund ? syncFund : syncStock) ? "同步" : "固定"}</span>
                            <div className={`w-5 h-3 rounded-full p-0.5 transition-colors ${(isFund ? syncFund : syncStock) ? "bg-emerald-400" : "bg-white/20"}`}>
                              <div className={`w-2 h-2 rounded-full bg-white transition-transform ${(isFund ? syncFund : syncStock) ? "translate-x-2" : "translate-x-0"}`} />
                            </div>
                          </div>
                        )}
                      </div>
                      <span className="text-[15px] font-mono font-bold text-white">
                        ¥{(Number(amount) || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 月报 */}
      <div className="max-h-[320px] overflow-y-auto no-scrollbar relative bg-white rounded-2xl shadow-sm border border-slate-100">
        {monthReport.map((m) => {
          const formatAmt = (val: number | null) => val !== null ? val.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";
          return (
            <div key={m.month} onClick={() => openSnapshot(m.month)} className="flex justify-between items-start px-5 py-4 hover:bg-slate-50/80 cursor-pointer transition-colors border-b border-slate-100 last:border-b-0">
              <div className="flex flex-col gap-1.5">
                <div className="text-[15px] font-bold text-slate-800 mb-0.5">{m.month.slice(5)}月</div>
                <div className="flex items-center">
                  <span className="w-5 shrink-0 text-[11px] text-slate-400">进</span>
                  <span className={`font-mono text-[12px] ${m.income > 0 ? "text-rose-400" : "text-slate-300"}`}>{m.income > 0 ? `+${formatAmt(m.income)}` : "-"}</span>
                </div>
                <div className="flex items-center">
                  <span className="w-5 shrink-0 text-[11px] text-slate-400">出</span>
                  <span className={`font-mono text-[12px] ${m.expense > 0 ? "text-emerald-500" : "text-slate-300"}`}>{m.expense > 0 ? `-${formatAmt(m.expense)}` : "-"}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline mb-0.5">
                  <span className="w-[34px] shrink-0 text-[10px] text-slate-400 font-medium">月底</span>
                  <span className="font-mono font-bold text-[17px] text-slate-900 tracking-tight">{m.calcEndBalance ? `¥${formatAmt(m.calcEndBalance)}` : "-"}</span>
                </div>
                <div className="flex items-center">
                  <span className="w-[34px] shrink-0 text-[11px] text-slate-400">月初</span>
                  <span className="font-mono text-[12px] text-slate-500">{m.startBalance ? formatAmt(m.startBalance) : "-"}</span>
                </div>
                <div className="flex items-center">
                  <span className="w-[34px] shrink-0 text-[11px] text-slate-400">差额</span>
                  <span className={`font-mono font-bold text-[12px] ${m.diff !== null && m.diff !== 0 ? (m.diff > 0 ? "text-rose-500" : "text-emerald-500") : "text-slate-300"}`}>
                    {m.diff !== null ? (m.diff > 0 ? `+${formatAmt(m.diff)}` : formatAmt(m.diff)) : "-"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 流水明细 */}
      <div>
        <div className="text-[15px] font-bold text-slate-800 mb-3 px-1">流水明细</div>
        {groupedPageTransactions.map(([month, txs]) => (
          <div key={month} className="mb-5">
            <div className="text-[12px] font-bold text-slate-500 mb-2 px-1">{month.replace("-", " 年 ")} 月</div>
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 overflow-hidden">
              {txs.map((t: any) => {
                const isSnapshot = t.isSnapshot;
                const isIncome = t.type === "转入";
                return (
                  <div key={t.id} onClick={() => isSnapshot ? openSnapshot(t.original.month) : openDetail(t, "deposit")} className="group px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 border-b border-slate-100 last:border-b-0 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSnapshot ? "bg-purple-50 text-purple-600" : isIncome ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-600"}`}>
                        {isSnapshot ? "✎" : isIncome ? "↑" : "↓"}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                          {isSnapshot ? `${t.note}（总资产）` : (t.note || t.category)} 
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-100 text-slate-500">{isSnapshot ? "登记" : t.account}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{t.trade_date} · {isSnapshot ? "包含更新资产分布" : t.category}</div>
                      </div>
                    </div>
                    <div className={`font-mono font-bold text-[15px] ${isSnapshot ? "text-slate-800" : isIncome ? "text-rose-500" : "text-emerald-600"}`}>
                      {isSnapshot ? `¥${t.amount.toLocaleString()}` : `${isIncome ? "+" : "-"}${Number(t.amount).toFixed(2)}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <Pagination page={depositPage} setPage={setDepositPage} total={filteredTransactions.length} />
      </div>
    </div>
  );
}