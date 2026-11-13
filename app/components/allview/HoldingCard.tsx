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

  if (isClosedMode && holding) {
    const productTxs = transactions.filter((t: any) => t.product_id === p.id).sort((a:any,b:any) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
    const buyTxs = productTxs.filter((t: any) => t.type === "buy");
    const sellTxs = productTxs.filter((t: any) => t.type === "sell" || t.type === "close");
    
    const lastSellDate = sellTxs.length > 0 ? sellTxs[sellTxs.length - 1].trade_date : holding.closed_at;
    const totalSoldAmount = Number(holding.closed_amount || 0) || sellTxs.reduce((sum:number, t:any)=> sum + Number(t.amount), 0);
    
    totalPurchaseAmount = buyTxs.reduce((sum:number, t:any) => sum + Number(t.amount), 0);
    totalProfit = totalSoldAmount - totalPurchaseAmount;

    if (buyTxs.length > 0 && totalPurchaseAmount > 0) {
      batches = buyTxs.map((bt: any, idx: number) => {
        const batchAmount = Number(bt.amount);
        const batchProfit = (batchAmount / totalPurchaseAmount) * totalProfit;
        const buyDateObj = new Date(bt.trade_date);
        const sellDateObj = lastSellDate ? new Date(lastSellDate) : new Date();
        const batchDays = Math.max(1, Math.floor((sellDateObj.getTime() - buyDateObj.getTime()) / (1000 * 60 * 60 * 24)));
        const batchAnnualized = batchAmount > 0 ? (batchProfit / batchAmount) * (365 / batchDays) * 100 : 0;
        return { id: bt.id, index: idx + 1, amount: batchAmount, profit: batchProfit, days: batchDays, annualized: batchAnnualized, date: bt.trade_date };
      });
    }
  }

  const gridCols = isClosedMode ? "grid-cols-[1.2fr_1fr_1.2fr_1fr_0.8fr]" : "grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr]";
  const daysHeld = holding?.hold_date ? Math.floor((Date.now() - new Date(holding.hold_date).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="mb-2 last:mb-0">
      <Link href={`/product/${p.id}`} className="block bg-white hover:bg-slate-50 transition-colors">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 pr-4">
            <div className="text-[14px] text-slate-900 font-medium leading-snug truncate">{p.name}</div>
            {!isClosedMode && (
              <span className="flex-shrink-0 bg-rose-50 text-rose-500 text-[9px] px-1.5 py-0.5 rounded font-semibold">持仓</span>
            )}
            {isClosedMode && (
              <span className="flex-shrink-0 bg-slate-200 text-slate-500 text-[9px] px-1.5 py-0.5 rounded font-semibold">清仓 {batches.length > 1 && `(${batches.length}笔)`}</span>
            )}
          </div>
        </div>

        {isClosedMode && batches.length > 1 ? (
          <div className="px-5 pb-3 flex justify-between items-center text-[11px] mb-1">
             <div className="flex items-center gap-4 text-slate-400">
               <span>总本金 {privacy ? "••••" : totalPurchaseAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</span>
               <div className="flex items-center gap-1">
                 <span>万收</span>
                 <span className={`font-mono font-semibold ${wanfen > 0 ? "text-rose-500" : wanfen < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                   {allNavs.length < 2 ? "-" : (wanfen >= 0 ? "+" : "") + wanfen.toFixed(2)}
                 </span>
                 {navDateStr && <span className="text-[9px] text-amber-500 font-mono ml-0.5">{navDateStr}</span>}
               </div>
             </div>
             <span className="text-slate-400">总收益 <span className={`font-mono font-semibold ${totalProfit > 0 ? "text-rose-500" : "text-emerald-500"}`}>{totalProfit > 0 ? "+" : ""}{totalProfit.toFixed(2)}</span></span>
          </div>
        ) : (
          <div className="px-5 pb-4">
            <div className={`grid ${gridCols} gap-1`}>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">{isClosedMode ? "本金" : "市值"}</div>
                <div className="font-mono font-bold text-[14px] text-slate-900 truncate">
                  {privacy ? "••••" : (isClosedMode ? totalPurchaseAmount : getHoldingMarketValue(holding)).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              
              {!isClosedMode && (
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-end gap-1">今日{navDateStr && <span className="text-[10px] text-amber-500 font-mono">{navDateStr}</span>}</div>
                  <div className={`font-mono font-semibold text-[14px] ${today > 0 ? "text-rose-500" : today < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                    {(today >= 0 ? "+" : "") + today.toFixed(2)}
                  </div>
                </div>
              )}

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
                <div className="text-[10px] text-slate-400 mb-1 truncate">{isClosedMode ? "总收益" : `年化(${periodLabel})`}</div>
                <div className={`font-mono font-semibold text-[14px] ${isClosedMode ? (totalProfit > 0 ? "text-rose-500" : "text-emerald-500") : annual > 0 ? "text-rose-500" : annual < 0 ? "text-emerald-500" : "text-slate-300"}`}>
                  {isClosedMode ? `${totalProfit > 0 ? "+" : ""}${totalProfit.toFixed(2)}` : `${annual > 0 ? "+" : ""}${annual.toFixed(2)}%`}
                </div>
              </div>

              {isClosedMode && (
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 mb-1 truncate">年化</div>
                  <div className={`font-mono font-semibold text-[14px] ${batches[0]?.annualized > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                    {batches.length > 0 ? `${batches[0].annualized > 0 ? "+" : ""}${batches[0].annualized.toFixed(2)}%` : "-"}
                  </div>
                </div>
              )}
              
              <div className="text-right">
                <div className="text-[10px] text-slate-400 mb-1">天数</div>
                <div className="font-mono font-medium text-[12px] text-slate-500 mt-0.5">{isClosedMode ? (batches[0]?.days || 0) : daysHeld}天</div>
              </div>
            </div>
          </div>
        )}
      </Link>

      {isClosedMode && batches.length > 1 && (
        <div className="bg-slate-50/50">
          {batches.map(b => (
            <Link key={b.id} href={`/product/${p.id}`} className="block px-5 py-2.5 border-t border-slate-100/60 hover:bg-slate-100 transition-colors">
              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>第{b.index}笔 · {b.date}</span>
              </div>
              <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr] gap-1 items-end">
                <div>
                  <div className="text-[10px] text-slate-400 mb-0.5">本金</div>
                  <div className="font-mono text-[12px] text-slate-700">{privacy ? "••••" : b.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 mb-0.5">收益</div>
                  <div className={`font-mono text-[12px] ${b.profit > 0 ? "text-rose-500" : "text-emerald-500"}`}>{b.profit > 0 ? "+" : ""}{b.profit.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 mb-0.5">年化</div>
                  <div className={`font-mono text-[12px] ${b.annualized > 0 ? "text-rose-500" : "text-emerald-500"}`}>{b.annualized > 0 ? "+" : ""}{b.annualized.toFixed(2)}%</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 mb-0.5">天数</div>
                  <div className="font-mono text-[12px] text-slate-500">{b.days}天</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}