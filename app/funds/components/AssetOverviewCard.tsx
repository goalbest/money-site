"use client";

import { useCountUp } from "../../../lib/useCountUp";

export default function AssetOverviewCard({ stats }: { stats: any }) {
  const safeStats = stats || {
    totalAssets: 0,
    fund: { value: 0, profit: 0 },
    stock: { value: 0, profit: 0 },
  };

  const totalProfit = safeStats.fund.profit + safeStats.stock.profit; // ★ 计算总盈亏

  const animatedTotal = useCountUp(safeStats.totalAssets, 1000);
  const animatedTotalProfit = useCountUp(totalProfit, 1000); // ★ 滚动动画
  const animatedFundValue = useCountUp(safeStats.fund.value, 1000);
  const animatedFundProfit = useCountUp(safeStats.fund.profit, 1000);
  const animatedStockValue = useCountUp(safeStats.stock.value, 1000);
  const animatedStockProfit = useCountUp(safeStats.stock.profit, 1000);

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-[#0A0A0A] p-5 shadow-xl shadow-black/20 mb-3 ring-1 ring-white/10">
      <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
      
      <div className="relative z-10">
        <div className="text-[12px] text-white/50 font-medium tracking-widest mb-1">总资产（元）</div>
        
        {/* ★ 把总资产和盈亏放同一行 */}
        <div className="flex items-baseline gap-3 mb-5">
          <div className="text-white leading-none font-mono font-bold tracking-tight tabular flex items-baseline text-[36px]">
            <span className="text-[20px] mr-1 font-sans text-amber-500/90 font-medium">¥</span>
            {animatedTotal.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`font-mono font-bold text-[15px] ${animatedTotalProfit > 0 ? "text-rose-400" : animatedTotalProfit < 0 ? "text-emerald-400" : "text-white/50"}`}>
            {animatedTotalProfit > 0 ? "+" : ""}{animatedTotalProfit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl p-3.5 border border-white/[0.06] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]"></span>
                <span className="text-[11px] text-white/60">基金</span>
              </div>
              <div className="text-white font-mono font-bold text-[18px] mb-1">
                ¥{animatedFundValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-[10px] text-white/40 font-mono">
              收益 <span className={animatedFundProfit > 0 ? "text-rose-400" : animatedFundProfit < 0 ? "text-emerald-400" : "text-white"}>
                {animatedFundProfit >= 0 ? "+" : ""}{animatedFundProfit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl p-3.5 border border-white/[0.06] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"></span>
                <span className="text-[11px] text-white/60">股票</span>
              </div>
              <div className="text-white font-mono font-bold text-[18px] mb-1">
                ¥{animatedStockValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-[10px] text-white/40 font-mono">
              收益 <span className={animatedStockProfit > 0 ? "text-rose-400" : animatedStockProfit < 0 ? "text-emerald-400" : "text-white"}>
                {animatedStockProfit >= 0 ? "+" : ""}{animatedStockProfit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}