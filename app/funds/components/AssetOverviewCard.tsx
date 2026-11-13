"use client";

import { useCountUp } from "../../../lib/useCountUp";

export default function AssetOverviewCard({ stats }: { stats: any }) {
  const safeStats = stats || {
    totalAssets: 0,
    fund: { value: 0, profit: 0 },
    stock: { value: 0, profit: 0 },
  };

  const totalProfit = safeStats.fund.profit + safeStats.stock.profit;

  const animatedTotal = useCountUp(safeStats.totalAssets, 1000);
  const animatedTotalProfit = useCountUp(totalProfit, 1000);
  const animatedFundValue = useCountUp(safeStats.fund.value, 1000);
  const animatedFundProfit = useCountUp(safeStats.fund.profit, 1000);
  const animatedStockValue = useCountUp(safeStats.stock.value, 1000);
  const animatedStockProfit = useCountUp(safeStats.stock.profit, 1000);

  return (
    // ★ 高度收紧：p-6 改为 p-5
    <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1E0B36] via-[#12071F] to-[#0A0510] p-5 shadow-2xl shadow-purple-900/20 mb-3 ring-1 ring-white/10">
      
      <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/20 rounded-full blur-[70px] -mr-16 -mt-16 pointer-events-none mix-blend-screen"></div>
      <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-amber-500/10 rounded-full blur-[50px] pointer-events-none mix-blend-screen"></div>

      <div className="relative z-10">
        <div className="text-[12px] text-white/60 font-medium tracking-widest mb-1.5">总资产（元）</div>
        
        {/* ★ 间距收紧：mb-6 改为 mb-4 */}
        <div className="flex items-baseline gap-3 mb-4">
          <div className="text-white leading-none font-mono font-bold tracking-tight tabular flex items-baseline text-[38px] drop-shadow-md">
            <span className="text-[22px] mr-1 font-sans text-amber-400 font-medium">¥</span>
            {animatedTotal.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className={`font-mono font-bold text-[15px] px-2 py-0.5 rounded-md backdrop-blur-sm ${animatedTotalProfit > 0 ? "text-red-400 bg-red-500/10" : animatedTotalProfit < 0 ? "text-green-400 bg-green-500/10" : "text-white/60 bg-white/5"}`}>
            {animatedTotalProfit > 0 ? "+" : ""}{animatedTotalProfit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* ★ 内部卡片收紧：gap-3.5 改为 gap-3, p-4 改为 p-3.5 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/10 backdrop-blur-md rounded-[18px] p-3.5 border border-white/10 flex flex-col justify-between shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]"></span>
                {/* ★ 删除“市值” */}
                <span className="text-[11px] text-white/70">基金</span>
              </div>
              <div className="text-white font-mono font-bold text-[18px] mb-1 tracking-tight">
                ¥{animatedFundValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-[10px] text-white/50 font-mono mt-1">
              收益 <span className={`font-bold ${animatedFundProfit > 0 ? "text-red-400" : animatedFundProfit < 0 ? "text-green-400" : "text-white/60"}`}>
                {animatedFundProfit >= 0 ? "+" : ""}{animatedFundProfit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-[18px] p-3.5 border border-white/10 flex flex-col justify-between shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"></span>
                {/* ★ 删除“市值” */}
                <span className="text-[11px] text-white/70">股票</span>
              </div>
              <div className="text-white font-mono font-bold text-[18px] mb-1 tracking-tight">
                ¥{animatedStockValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-[10px] text-white/50 font-mono mt-1">
              收益 <span className={`font-bold ${animatedStockProfit > 0 ? "text-red-400" : animatedStockProfit < 0 ? "text-green-400" : "text-white/60"}`}>
                {animatedStockProfit >= 0 ? "+" : ""}{animatedStockProfit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}