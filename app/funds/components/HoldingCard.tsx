"use client";

import { useRouter } from "next/navigation";

export default function HoldingCard({ item, history }: { item: any, history: { date: string, price: number }[] }) {
  const router = useRouter();
  const p = Array.isArray(item.fund_stocks) ? item.fund_stocks[0] : item.fund_stocks;
  if (!p) return null;

  const shares = Number(item.shares || 0);
  const costPrice = Number(item.avg_cost || item.cost_price || 0);
  const currentPrice = Number(p.current_price || 0);
  const prevPrice = Number(p.prev_price || currentPrice);

  const marketValue = shares * currentPrice;
  const totalCost = shares * costPrice;
  const profit = marketValue - totalCost;
  const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const todayProfit = (currentPrice - prevPrice) * shares;

  // ★ 回撤算法封装在卡片内部
  const calcMaxDrawdown = (hist: { date: string, price: number }[]) => {
    if (!hist || hist.length < 2) return { rate: 0, days: 0 };
    let maxPrice = hist[0].price;
    let peakDate = new Date(hist[0].date).getTime();
    let maxDrawdown = 0;
    let maxDays = 0;
    for (let i = 1; i < hist.length; i++) {
      const currentPrice = hist[i].price;
      const currentDate = new Date(hist[i].date).getTime();
      if (currentPrice > maxPrice) {
        maxPrice = currentPrice;
        peakDate = currentDate;
      } else {
        const drawdown = (maxPrice - currentPrice) / maxPrice;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          maxDays = Math.floor((currentDate - peakDate) / 86400000);
        }
      }
    }
    return { rate: maxDrawdown * 100, days: maxDays };
  };

  const maxDrawdown = calcMaxDrawdown(history);

  return (
    <div onClick={() => router.push(`/funds/${p.code}?type=${p.type}`)} className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 shadow-sm border border-white/60 hover:shadow-md cursor-pointer transition-all active:scale-[0.98]">
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${p.type === "fund" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
            {p.type === "fund" ? "基金" : "股票"}
          </span>
          <span className="text-[15px] font-bold text-slate-900 truncate">{p.name}</span>
          <span className="text-[11px] text-slate-400 font-mono flex-shrink-0">{p.code}</span>
        </div>
        <div className="font-mono font-bold text-[15px] text-slate-900 flex-shrink-0">
          {marketValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1 pt-2 border-t border-slate-100/80">
        <div>
          <div className="text-[10px] text-slate-400 mb-0.5 truncate">今日收益</div>
          <div className={`font-mono font-bold text-[12px] truncate ${todayProfit > 0 ? "text-rose-500" : todayProfit < 0 ? "text-emerald-500" : "text-slate-400"}`}>
            {todayProfit > 0 ? "+" : ""}{todayProfit.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 mb-0.5 truncate">累计收益</div>
          <div className={`font-mono font-bold text-[12px] truncate ${profit > 0 ? "text-rose-500" : profit < 0 ? "text-emerald-500" : "text-slate-400"}`}>
            {profit > 0 ? "+" : ""}{profit.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 mb-0.5 truncate">收益率</div>
          <div className={`font-mono font-bold text-[12px] truncate ${profitRate > 0 ? "text-rose-500" : profitRate < 0 ? "text-emerald-500" : "text-slate-400"}`}>
            {profitRate >= 0 ? "+" : ""}{profitRate.toFixed(2)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400 mb-0.5 truncate">最大回撤</div>
          <div className="font-mono font-bold text-[12px] text-amber-500 truncate">
            -{maxDrawdown.rate.toFixed(2)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400 mb-0.5 truncate">回撤天数</div>
          <div className="font-mono font-bold text-[12px] text-amber-500 truncate">
            {maxDrawdown.days}天
          </div>
        </div>
      </div>

    </div>
  );
}