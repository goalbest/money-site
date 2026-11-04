"use client";

import { useState, useMemo } from "react";
import { getBankInfo } from "../../lib/banks";

export default function HoldingDistribution({
  holdings,
  privacy,
}: {
  holdings: any[];
  privacy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // 1. 按银行统计
  const bankStats = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    holdings.forEach((h) => {
      const amount = Number(h.holding_amount || 0);
      const bank = h.products?.bank || "其他";
      map.set(bank, (map.get(bank) || 0) + amount);
      total += amount;
    });
    return Array.from(map.entries())
      .map(([bank, amount]) => ({
        bank,
        amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [holdings]);

  // 2. 按今日收益表现统计
  const profitStats = useMemo(() => {
    let pos = 0, neu = 0, neg = 0;
    holdings.forEach((h) => {
      // 这里简化用 daily_return 或动态计算，若未传入直接用金额代替权重
      const rate = Number(h.products?.daily_return || 0);
      if (rate > 0) pos++;
      else if (rate < 0) neg++;
      else neu++;
    });
    const total = holdings.length || 1;
    return {
      pos: (pos / total) * 100,
      neu: (neu / total) * 100,
      neg: (neg / total) * 100,
    };
  }, [holdings]);

  // 3. 按持仓状态
  const statusStats = useMemo(() => {
    let active = 0, transit = 0;
    holdings.forEach((h) => {
      if (h.status === "pending_buy" || h.status === "pending_sell") transit++;
      else active++;
    });
    const total = holdings.length || 1;
    return {
      active: (active / total) * 100,
      transit: (transit / total) * 100,
    };
  }, [holdings]);

  // 4. 按持仓年化
  const annualStats = useMemo(() => {
    let gt5 = 0, p3to5 = 0, p2to3 = 0, lt2 = 0;
    holdings.forEach((h) => {
      const y = Number(h.products?.annualized_1m || 0);
      if (y >= 5) gt5++;
      else if (y >= 3) p3to5++;
      else if (y >= 2) p2to3++;
      else lt2++;
    });
    const total = holdings.length || 1;
    return {
      gt5: (gt5 / total) * 100,
      p3to5: (p3to5 / total) * 100,
      p2to3: (p2to3 / total) * 100,
      lt2: (lt2 / total) * 100,
    };
  }, [holdings]);

  if (holdings.length === 0) return null;

  return (
    <div className="card p-5 mb-5 animate-fade-in-up delay-2">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[15px] font-bold text-slate-900">持仓分布</div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[12px] text-slate-400 font-medium hover:text-slate-600 flex items-center gap-0.5 transition-colors"
        >
          {expanded ? "收起" : "展开"}
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 默认显示的：按银行 */}
      <div className="mb-2">
        <div className="text-[11px] text-slate-400 mb-2">按银行</div>
        <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
          {bankStats.map((b, i) => (
            <div
              key={b.bank}
              style={{ width: `${b.percent}%`, background: getBankInfo(b.bank).bar }}
              className="h-full"
            />
          ))}
        </div>
        <div className="space-y-1.5">
          {bankStats.map((b) => {
            const info = getBankInfo(b.bank);
            return (
              <div key={b.bank} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: info.color }} />
                  {b.bank}
                </div>
                <div className="flex items-center gap-4 tabular">
                  <span className="text-slate-400">{b.percent.toFixed(1)}%</span>
                  <span className="font-mono font-medium text-slate-700 w-20 text-right">
                    {privacy ? "••••" : b.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 展开后显示的：其他维度 */}
      {expanded && (
        <div className="animate-fade-in border-t divider pt-4 mt-4 space-y-5">
          {/* 按今日收益表现 */}
          <div>
            <div className="text-[11px] text-slate-400 mb-2">按今日收益表现</div>
            <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
              <div style={{ width: `${profitStats.pos}%` }} className="bg-rose-500" />
              <div style={{ width: `${profitStats.neu}%` }} className="bg-slate-300" />
              <div style={{ width: `${profitStats.neg}%` }} className="bg-emerald-500" />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />正收益 {profitStats.pos.toFixed(0)}%</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />持平 {profitStats.neu.toFixed(0)}%</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />负收益 {profitStats.neg.toFixed(0)}%</span>
            </div>
          </div>

          {/* 按持仓状态 */}
          <div>
            <div className="text-[11px] text-slate-400 mb-2">按持仓状态</div>
            <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
              <div style={{ width: `${statusStats.active}%` }} className="bg-violet-500" />
              <div style={{ width: `${statusStats.transit}%` }} className="bg-amber-400" />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-500" />持仓 {statusStats.active.toFixed(0)}%</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />在途 {statusStats.transit.toFixed(0)}%</span>
            </div>
          </div>

          {/* 按持仓年化 */}
          <div>
            <div className="text-[11px] text-slate-400 mb-2">按持仓年化</div>
            <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
              <div style={{ width: `${annualStats.gt5}%` }} className="bg-rose-500" />
              <div style={{ width: `${annualStats.p3to5}%` }} className="bg-amber-400" />
              <div style={{ width: `${annualStats.p2to3}%` }} className="bg-violet-400" />
              <div style={{ width: `${annualStats.lt2}%` }} className="bg-slate-300" />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />≥5% {annualStats.gt5.toFixed(0)}%</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />3-5% {annualStats.p3to5.toFixed(0)}%</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" />2-3% {annualStats.p2to3.toFixed(0)}%</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />&lt;2% {annualStats.lt2.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}