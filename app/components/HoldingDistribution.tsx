"use client";

import { useMemo, useState } from "react";
import { getBankInfo } from "../../lib/banks";

type Props = {
  holdings: any[];
  privacy: boolean;
};

export default function HoldingDistribution({ holdings, privacy }: Props) {
  const [expanded, setExpanded] = useState(true);

  /* 按银行分布 */
  const bankDist = useMemo(() => {
    const total = holdings.reduce((s, h) => s + Number(h.holding_amount || 0), 0);
    if (total === 0) return [];
    const map: Record<string, number> = {};
    holdings.forEach(h => {
      const b = h.products?.bank || "其他";
      map[b] = (map[b] || 0) + Number(h.holding_amount || 0);
    });
    return Object.entries(map)
      .map(([bank, amount]) => ({
        bank,
        amount,
        percent: (amount / total) * 100,
        info: getBankInfo(bank),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [holdings]);

  /* 按今日收益表现 */
  const profitDist = useMemo(() => {
    let positive = 0, negative = 0, neutral = 0;
    holdings.forEach(h => {
      const amount = Number(h.holding_amount || 0);
      const daily = Number(h.products?.daily_return || 0);
      if (daily > 0) positive += amount;
      else if (daily < 0) negative += amount;
      else neutral += amount;
    });
    const total = positive + negative + neutral;
    return {
      total,
      positivePct: total > 0 ? (positive / total) * 100 : 0,
      negativePct: total > 0 ? (negative / total) * 100 : 0,
      neutralPct: total > 0 ? (neutral / total) * 100 : 0,
    };
  }, [holdings]);

  /* 按持仓状态 */
  const transitDist = useMemo(() => {
    const holding = holdings.reduce((s, h) => s + Number(h.holding_amount || 0), 0);
    const transit = holdings.reduce((s, h) => s + Number(h.in_transit_amount || 0), 0);
    const total = holding + transit;
    return {
      total,
      holdingPct: total > 0 ? (holding / total) * 100 : 0,
      transitPct: total > 0 ? (transit / total) * 100 : 0,
    };
  }, [holdings]);

  /* 按年化区间 */
  const annualDist = useMemo(() => {
    const buckets: Record<string, { count: number; amount: number; color: string }> = {
      "≥5%": { count: 0, amount: 0, color: "#f43f5e" },
      "3-5%": { count: 0, amount: 0, color: "#fb923c" },
      "2-3%": { count: 0, amount: 0, color: "#a78bfa" },
      "<2%": { count: 0, amount: 0, color: "#94a3b8" },
    };
    holdings.forEach(h => {
      const annual = Number(h.products?.annualized_1m || 0);
      const amount = Number(h.holding_amount || 0);
      if (annual >= 5) { buckets["≥5%"].count++; buckets["≥5%"].amount += amount; }
      else if (annual >= 3) { buckets["3-5%"].count++; buckets["3-5%"].amount += amount; }
      else if (annual >= 2) { buckets["2-3%"].count++; buckets["2-3%"].amount += amount; }
      else { buckets["<2%"].count++; buckets["<2%"].amount += amount; }
    });
    const total = Object.values(buckets).reduce((s, b) => s + b.amount, 0);
    return Object.entries(buckets).map(([label, b]) => ({
      label,
      count: b.count,
      percent: total > 0 ? (b.amount / total) * 100 : 0,
      color: b.color,
    }));
  }, [holdings]);

  if (holdings.length === 0) return null;

  function fmtAmount(n: number) {
    if (privacy) return "••••";
    return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className="card p-5 mb-5 animate-fade-in-up delay-2">
      {/* 标题 + 折叠按钮 */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[15px] font-bold text-slate-900">持仓分布</div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[11px] text-slate-400 font-medium
                     flex items-center gap-1
                     hover:text-slate-600 transition-colors"
        >
          {expanded ? "收起" : "展开"}
          <svg
            className={`w-3 h-3 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-500 ${
          expanded ? "max-h-[900px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {/* ============ 按银行 ============ */}
        {bankDist.length > 0 && (
          <div className="mb-5">
            <div className="text-[11px] text-slate-400 mb-2 tracking-wider">按银行</div>
            <div className="h-2 rounded-full overflow-hidden flex mb-3">
              {bankDist.map(b => (
                <div
                  key={b.bank}
                  className="h-full transition-all duration-500"
                  style={{ width: `${b.percent}%`, background: b.info.bar }}
                  title={`${b.bank} ${b.percent.toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="space-y-1.5">
              {bankDist.map(b => (
                <div key={b.bank} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.info.bar }} />
                  <span className="text-slate-500 flex-1 truncate">{b.bank}</span>
                  <span className="text-slate-400 tabular">{b.percent.toFixed(1)}%</span>
                  <span className="text-slate-900 font-medium font-mono tabular w-24 text-right">
                    {fmtAmount(b.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============ 按今日收益表现 ============ */}
        {profitDist.total > 0 && (
          <div className="pt-4 border-t divider mb-5">
            <div className="text-[11px] text-slate-400 mb-2 tracking-wider">按今日收益表现</div>
            <div className="h-2 rounded-full overflow-hidden flex mb-3">
              {profitDist.positivePct > 0 && (
                <div className="h-full bg-gradient-to-r from-rose-400 to-rose-500"
                     style={{ width: `${profitDist.positivePct}%` }} />
              )}
              {profitDist.neutralPct > 0 && (
                <div className="h-full bg-slate-300" style={{ width: `${profitDist.neutralPct}%` }} />
              )}
              {profitDist.negativePct > 0 && (
                <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                     style={{ width: `${profitDist.negativePct}%` }} />
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-[11px]">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-slate-500">正收益</span>
                </div>
                <div className="text-slate-900 font-mono font-semibold tabular">
                  {profitDist.positivePct.toFixed(0)}%
                </div>
              </div>
              <div className="text-[11px]">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                  <span className="text-slate-500">持平</span>
                </div>
                <div className="text-slate-900 font-mono font-semibold tabular">
                  {profitDist.neutralPct.toFixed(0)}%
                </div>
              </div>
              <div className="text-[11px]">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-500">负收益</span>
                </div>
                <div className="text-slate-900 font-mono font-semibold tabular">
                  {profitDist.negativePct.toFixed(0)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ 按持仓状态 ============ */}
        {transitDist.total > 0 && (
          <div className="pt-4 border-t divider mb-5">
            <div className="text-[11px] text-slate-400 mb-2 tracking-wider">按持仓状态</div>
            <div className="h-2 rounded-full overflow-hidden flex mb-3">
              {transitDist.holdingPct > 0 && (
                <div className="h-full bg-gradient-to-r from-violet-500 to-purple-600"
                     style={{ width: `${transitDist.holdingPct}%` }} />
              )}
              {transitDist.transitPct > 0 && (
                <div className="h-full bg-amber-400" style={{ width: `${transitDist.transitPct}%` }} />
              )}
            </div>
            <div className="flex justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-slate-500">持仓</span>
                <span className="text-slate-900 font-mono font-semibold tabular ml-1">
                  {transitDist.holdingPct.toFixed(1)}%
                </span>
              </div>
              {transitDist.transitPct > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-slate-500">在途</span>
                  <span className="text-slate-900 font-mono font-semibold tabular ml-1">
                    {transitDist.transitPct.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ 按年化区间 ============ */}
        {annualDist.some(b => b.count > 0) && (
          <div className="pt-4 border-t divider">
            <div className="text-[11px] text-slate-400 mb-2 tracking-wider">按持仓年化</div>
            <div className="h-2 rounded-full overflow-hidden flex mb-3">
              {annualDist.map(b => b.percent > 0 ? (
                <div key={b.label} className="h-full"
                     style={{ width: `${b.percent}%`, background: b.color }} />
              ) : null)}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {annualDist.map(b => (
                <div key={b.label} className="text-[11px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                    <span className="text-slate-500 truncate">{b.label}</span>
                  </div>
                  <div className="text-slate-900 font-mono font-semibold tabular">
                    {b.percent.toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}