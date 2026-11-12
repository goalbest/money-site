"use client";

import { useEffect, useRef } from "react";

export default function AssetCard({ stats, privacy }: { stats: any, privacy: boolean }) {
  const assetsRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const cumRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (privacy) return;

    let raf: number;
    const duration = 800;
    const startTime = performance.now();

    const targets = {
      assets: stats.totalAssets,
      today: stats.totalProfitToday,
      cum: stats.totalProfitCumulative,
      month: stats.monthProfit,
    };

    const animate = (time: number) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);

      const curAssets = targets.assets * ease;
      const curToday = targets.today * ease;
      const curCum = targets.cum * ease;
      const curMonth = targets.month * ease;

      if (assetsRef.current) {
        assetsRef.current.textContent = curAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      
      // ★ 修改点 1：去掉三元运算符判断红绿，强制全部用 text-white
      if (todayRef.current) {
        todayRef.current.textContent = `${curToday >= 0 ? "+" : ""}${curToday.toFixed(2)}`;
        todayRef.current.className = `font-mono font-bold text-[15px] tracking-tight leading-none mb-1 text-white`;
      }
      if (cumRef.current) {
        cumRef.current.textContent = `${curCum >= 0 ? "+" : ""}${curCum.toFixed(2)}`;
        cumRef.current.className = `font-mono font-bold text-[15px] tracking-tight leading-none mb-1 text-white`;
      }
      if (monthRef.current) {
        monthRef.current.textContent = `${curMonth >= 0 ? "+" : ""}${curMonth.toFixed(2)}`;
        monthRef.current.className = `font-mono font-bold text-[15px] tracking-tight leading-none mb-1 text-white`;
      }

      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [stats.totalAssets, stats.totalProfitToday, stats.totalProfitCumulative, stats.monthProfit, privacy]);

  return (
    <div className="card-hero mb-5">
      <div className="dot-pattern" />
      <div className="p-5 relative z-10">
        <div className="text-[11px] text-white/70 tracking-wider mb-2">总资产（元）</div>
        <div className="text-white leading-none font-bold tracking-tight tabular text-[36px] mb-5">
          {privacy ? "••••••" : (
            <div ref={assetsRef}>0.00</div> 
          )}
        </div>
        
        <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/15">
          <div className="bg-white/10 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="text-[10px] text-white/70 mb-1.5 flex items-center justify-start gap-1">
              今日收益
              {stats.latestNavDateStr && (
                <span className="text-[9px] text-amber-200/90 font-mono">
                  {String(stats.latestNavDateStr).slice(5)}
                </span>
              )}
            </div>
            {privacy ? (
               <div className="font-mono font-bold text-[15px] text-white tracking-tight leading-none mb-1">••</div>
            ) : (
               // ★ 修改点 2：初始占位强制白色
               <div ref={todayRef} className="font-mono font-bold text-[15px] text-white tracking-tight leading-none mb-1">+0.00</div>
            )}
            <div className="text-[9px] text-white/60">万份 {stats.todayWanfen.toFixed(2)}</div>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="text-[10px] text-white/70 mb-1.5">本月收益</div>
            {privacy ? (
               <div className="font-mono font-bold text-[15px] text-white tracking-tight leading-none mb-1">••</div>
            ) : (
               <div ref={monthRef} className="font-mono font-bold text-[15px] text-white tracking-tight leading-none mb-1">+0.00</div>
            )}
            <div className="text-[9px] text-white/60">年化 {stats.monthAnnual.toFixed(2)}%</div>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="text-[10px] text-white/70 mb-1.5">累计收益</div>
            {privacy ? (
               <div className="font-mono font-bold text-[15px] text-white tracking-tight leading-none mb-1">••</div>
            ) : (
               <div ref={cumRef} className="font-mono font-bold text-[15px] text-white tracking-tight leading-none mb-1">+0.00</div>
            )}
            <div className="text-[9px] text-white/60">收益率 {stats.totalRate.toFixed(2)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}