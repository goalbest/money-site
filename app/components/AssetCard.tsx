"use client";

import { useCountUp } from "../../lib/useCountUp";

export default function AssetCard({ stats, privacy }: { stats: any, privacy: boolean }) {
  const animatedAssets = useCountUp(stats.totalAssets, 1200);
  const animatedToday = useCountUp(stats.totalProfitToday, 1200);
  const animatedCum = useCountUp(stats.totalProfitCumulative, 1200);
  const animatedMonth = useCountUp(stats.monthProfit, 1200);

  function fmtProfit(n: number) { return privacy ? "••" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}`; }

  return (
    <div className="card-hero mb-5">
      <div className="dot-pattern" />
      <div className="p-5 relative z-10">
        <div className="text-[11px] text-white/70 tracking-wider mb-2">总资产（元）</div>
        <div className="text-white leading-none font-bold tracking-tight tabular text-[36px] mb-5">
          {privacy ? "••••••" : animatedAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        
        <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/15">
          <div className="bg-white/10 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="text-[10px] text-white/70 mb-1.5">今日收益</div>
            <div className="font-mono font-bold text-[15px] text-white tracking-tight leading-none mb-1">
              {fmtProfit(animatedToday)}
            </div>
            <div className="text-[9px] text-white/60">万份 {stats.todayWanfen.toFixed(2)}</div>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="text-[10px] text-white/70 mb-1.5">本月收益</div>
            <div className="font-mono font-bold text-[15px] text-white tracking-tight leading-none mb-1">
              {fmtProfit(animatedMonth)}
            </div>
            <div className="text-[9px] text-white/60">年化 {stats.monthAnnual.toFixed(2)}%</div>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="text-[10px] text-white/70 mb-1.5">累计收益</div>
            <div className="font-mono font-bold text-[15px] text-white tracking-tight leading-none mb-1">
              {fmtProfit(animatedCum)}
            </div>
            <div className="text-[9px] text-white/60">收益率 {stats.totalRate.toFixed(2)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}