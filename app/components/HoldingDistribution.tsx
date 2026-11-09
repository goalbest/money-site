"use client";

import { useMemo } from "react";
import { getBankInfo } from "../../lib/banks";

export default function HoldingDistribution({
  holdings,
  privacy,
}: {
  holdings: any[];
  privacy: boolean;
}) {
  // 仅保留按银行统计
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

  if (holdings.length === 0) return null;

  return (
    <div className="card p-5 mb-4 animate-fade-in-up delay-2">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[15px] font-bold text-slate-900">持仓分布</div>
      </div>

      <div>
        <div className="text-[11px] text-slate-400 mb-2">按银行</div>
        <div className="flex h-2.5 rounded-full overflow-hidden mb-3 bg-slate-100">
          {bankStats.map((b) => (
            <div
              key={b.bank}
              style={{ width: `${b.percent}%`, background: getBankInfo(b.bank).bar }}
              className="h-full"
            />
          ))}
        </div>
        <div className="space-y-2">
          {bankStats.map((b) => {
            const info = getBankInfo(b.bank);
            return (
              <div key={b.bank} className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2 h-2 rounded-full" style={{ background: info.bar }} />
                  {b.bank}
                </div>
                <div className="flex items-center gap-6 tabular">
                  <span className="text-slate-400 font-mono text-[11px]">{b.percent.toFixed(1)}%</span>
                  <span className="font-mono font-bold text-slate-900 w-24 text-right">
                    {privacy ? "••••" : b.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}