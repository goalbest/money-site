"use client";

import Link from "next/link";
import { getBankInfo } from "../../../lib/banks";
import { getHoldingMarketValue } from "../../../lib/holdings";

function calcAnnualizedFromNav(navs: any[], period: string) {
  if (!navs || navs.length < 2) return 0;
  const sorted = [...navs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latest = sorted[sorted.length - 1];
  const latestDate = new Date(latest.date);
  let targetDate = new Date(latestDate);
  
  if (period === "7d") targetDate.setDate(targetDate.getDate() - 7);
  else if (period === "14d") targetDate.setDate(targetDate.getDate() - 14);
  else if (period === "1m") targetDate.setMonth(targetDate.getMonth() - 1);
  else if (period === "3m") targetDate.setMonth(targetDate.getMonth() - 3);
  else if (period === "6m") targetDate.setMonth(targetDate.getMonth() - 6);
  else if (period === "1y") targetDate.setFullYear(targetDate.getFullYear() - 1);
  else if (period === "all") {
    const days = Math.max(1, (latestDate.getTime() - new Date(sorted[0].date).getTime()) / 86400000);
    return ((latest.nav / sorted[0].nav - 1) / days) * 365 * 100;
  }
  let closestNav = sorted[0];
  let minDiff = Infinity;
  for (const item of sorted) {
    const diff = Math.abs(new Date(item.date).getTime() - targetDate.getTime());
    if (diff < minDiff) { minDiff = diff; closestNav = item; }
  }
  const actualDays = Math.max(1, (latestDate.getTime() - new Date(closestNav.date).getTime()) / 86400000);
  return (((latest.nav / closestNav.nav) - 1) / actualDays) * 365 * 100;
}

export default function HoldingCard({ 
  h, navHistory, transactions, annualPeriod, privacy, isClosedMode, periodLabel
}: any) {
  const p = h.products;
  if (!p) return null;
  
  const holding = h.holding_info || h; 
  const bankInfo = getBankInfo(p.bank);
  const allNavs = navHistory[p.id] || [];
  const wanfen = allNavs.length >= 2 ? (allNavs[allNavs.length-1].nav - allNavs[allNavs.length-2].nav) * 10000 : 0;
  const today = (holding && allNavs.length >= 2) ? (allNavs[allNavs.length-1].nav - allNavs[allNavs.length-2].nav) * Number(holding.shares) : 0;
  const annual = calcAnnualizedFromNav(allNavs, annualPeriod);
  const navDateStr = p.nav_date ? String(p.nav_date).slice(5) : "";

  let batches: any[] = [];
  let totalProfit = 0;
  let totalPurchaseAmount = 0;
  let totalAnnualized = 0;
  let realSellDate = "";

  if (isClosedMode && holding) {
    const productTxs = transactions.filter((t: any) => t.product_id === p.id).sort((a:any,b:any) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
    const buyTxs = productTxs.filter((t: any) => t.type === "buy");
    const sellTxs = productTxs.filter((t: any) => t.type === "sell" || t.type === "close");
    
    realSellDate = sellTxs.length > 0 ? sellTxs[sellTxs.length - 1].trade_date : holding.closed_at;
    const totalSoldAmount = Number(holding.closed_amount || 0) || sellTxs.reduce((sum:number, t:any)=> sum + Number(t.amount), 0);
    
    totalPurchaseAmount = buyTxs.reduce((sum:number, t:any) => sum + Number(t.amount), 0);
    totalProfit = totalSoldAmount - totalPurchaseAmount;

    if (buyTxs.length > 0 && totalPurchaseAmount > 0) {
      const sellDateObj = realSellDate ? new Date(realSellDate) : new Date();
      
      // ★ 核心修复：基于资金天数加权计算总年化
      let totalWeightedPrincipalDays = 0;

      batches = buyTxs.map((bt: any, idx: number) => {
        const batchAmount = Number(bt.amount);
        const batchProfit = (batchAmount / totalPurchaseAmount) * totalProfit;
        const buyDateObj = new Date(bt.trade_date);
        const batchDays = Math.max(1, Math.floor((sellDateObj.getTime() - buyDateObj.getTime()) / (1000 * 60 * 60 * 24)));
        const batchAnnualized = batchAmount > 0 ? (batchProfit / batchAmount) * (365 / batchDays) * 100 : 0;
        
        totalWeightedPrincipalDays += batchAmount * batchDays;
        
        return { id: bt.id, index: idx + 1, amount: batchAmount, profit: batchProfit, days: batchDays, annualized: batchAnnualized, date: bt.trade_date };
      });

      totalAnnualized = totalWeightedPrincipalDays > 0 ? (totalProfit / totalWeightedPrincipalDays) * 365 * 100 : 0;
    }
  }

  const gridCols = isClosedMode ? "grid-cols-[1.2fr_1fr_1.2fr_1fr_0.8fr]" : "grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr]";
  const daysHeld = holding?.hold_date ? Math.floor((Date.now() - new Date(holding.hold_date).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="mb-2 last:mb-0">
      <Link href={`/product/${p.id}`} className="block bg-white hover:bg-slate-50 transition-colors">
        
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 pr-4">
            <span className="bank-avatar flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-[6px] text-[10px] font-bold" 
                  style={{ background: bankInfo.bg, color: bankInfo.color }}>
              {bankInfo.label}
            </span>
            <div className="text-[14px] text-slate-900 font-medium leading-snug truncate">{p.name}</div>
            {!isClosedMode && (
              <span className="flex-shrink-0 bg-rose-50 text-rose-500 text-[9px] px-1.5 py-0.5 rounded font-semibold">持仓</span>
            )}
            {isClosedMode && (
              <span className="flex-shrink-0 bg-slate-200 text-slate-500 text-[9px] px-1.5 py-0.5 rounded font-semibold">
                清仓 {batches.length > 1 && `(${batches.length}笔)`}
              </span>
            )}
          </div>
        </div>

        {isClosedMode ? (
          <div className="flex flex-col">
            <div className="px-5 py-2 bg-slate-50/50 flex justify-between items-center border-y border-slate-100/50">
              <div className="text-[10px] text-slate-400 font-mono">
                {realSellDate && `${realSellDate} 卖出`}
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono font-bold">
                <span className={totalProfit > 0 ? "text-red-500" : "text-green-500"}>
                  总收益 {totalProfit > 0 ? "+" : ""}{totalProfit.toFixed(2)}
                </span>
                <span className="text-slate-300">|</span>
                <span className={totalAnnualized > 0 ? "text-red-500" : "text-green-500"}>
                  总年化 {totalAnnualized > 0 ? "+" : ""}{totalAnnualized.toFixed(2)}%
                </span>
              </div>
            </div>

            {batches.map((b) => (
              <div key={b.id} className="px-5 pb-4 pt-3 border-t border-slate-50/60 last:border-0">
                {batches.length > 1 && (
                  <div className="text-[10px] text-slate-400 mb-2 font-mono">
                    第 {b.index} 笔 · {b.date}
                  </div>
                )}
                <div className={`grid ${gridCols} gap-1`}>
                  <div>
                    <div className="text-[10px] text-slate-400 mb-1">本金</div>
                    <div className="font-mono font-bold text-[14px] text-slate-900 truncate">
                      {privacy ? "••••" : b.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 mb-1 truncate flex items-center justify-end gap-1">
                      万收
                      {navDateStr && <span className="text-[9px] text-amber-500 font-mono">{navDateStr}</span>}
                    </div>
                    <div className={`font-mono font-semibold text-[14px] ${wanfen > 0 ? "text-rose-500" : wanfen < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                      {allNavs.length < 2 ? "-" : (wanfen >= 0 ? "+" : "") + wanfen.toFixed(2)}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 mb-1 truncate">总收益</div>
                    <div className={`font-mono font-semibold text-[14px] ${b.profit > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                      {b.profit > 0 ? "+" : ""}{b.profit.toFixed(2)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 mb-1 truncate">年化</div>
                    <div className={`font-mono font-semibold text-[14px] ${b.annualized > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                      {b.annualized > 0 ? "+" : ""}{b.annualized.toFixed(2)}%
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 mb-1">天数</div>
                    <div className="font-mono font-medium text-[12px] text-slate-500 mt-0.5">{b.days}天</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 pb-4">
            <div className={`grid ${gridCols} gap-1`}>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">市值</div>
                <div className="font-mono font-bold text-[14px] text-slate-900 truncate">
                  {privacy ? "••••" : getHoldingMarketValue(holding).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-end gap-1">今日{navDateStr && <span className="text-[10px] text-amber-500 font-mono">{navDateStr}</span>}</div>
                <div className={`font-mono font-semibold text-[14px] ${today > 0 ? "text-rose-500" : today < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                  {(today >= 0 ? "+" : "") + today.toFixed(2)}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] text-slate-400 mb-1 truncate flex items-center justify-end gap-1">
                  万收
                  {navDateStr && <span className="text-[9px] text-amber-500 font-mono">{navDateStr}</span>}
                </div>
                <div className={`font-mono font-semibold text-[14px] ${wanfen > 0 ? "text-rose-500" : wanfen < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                  {allNavs.length < 2 ? "-" : (wanfen >= 0 ? "+" : "") + wanfen.toFixed(2)}
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-[10px] text-slate-400 mb-1 truncate">{`年化(${periodLabel})`}</div>
                <div className={`font-mono font-semibold text-[14px] ${annual > 0 ? "text-rose-500" : annual < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                  {annual > 0 ? "+" : ""}{annual.toFixed(2)}%
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-[10px] text-slate-400 mb-1">天数</div>
                <div className="font-mono font-medium text-[12px] text-slate-500 mt-0.5">{daysHeld}天</div>
              </div>
            </div>
          </div>
        )}
      </Link>
    </div>
  );
}