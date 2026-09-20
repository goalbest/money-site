"use client";

import { useState } from "react";

type AnnualRange = 7 | 30 | 90 | 180 | 365;
type PerMyriadRange = 1 | 7 | 14;

export default function MetricsPanel({ navList }: { navList: any[] }) {
  const [annualRange, setAnnualRange] = useState<AnnualRange>(30);
  const [perMyriadRange, setPerMyriadRange] = useState<PerMyriadRange>(1);

  // 按日期倒序（最新在前）
  const sorted = [...navList].sort((a, b) =>
    String(b.nav_date).localeCompare(String(a.nav_date))
  );

  const latest = sorted[0];
  const latestNav = latest ? Number(latest.unit_nav) : null;

  // 年化收益率：指定天数内日均涨跌 × 365 × 100%
  function calcAnnualized(days: number): number | null {
    if (sorted.length < 2) return null;
    const returns: number[] = [];
    const n = Math.min(days, sorted.length - 1);
    for (let i = 0; i < n; i++) {
      const t = Number(sorted[i].unit_nav);
      const p = Number(sorted[i + 1].unit_nav);
      if (t > 0 && p > 0) returns.push((t - p) / p);
    }
    if (returns.length === 0) return null;
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    return avg * 365 * 100;
  }

  // 万份收益：指定天数内平均每万份日收益
  function calcPerMyriad(days: number): number | null {
    if (sorted.length < 2) return null;
    const vals: number[] = [];
    const n = Math.min(days, sorted.length - 1);
    for (let i = 0; i < n; i++) {
      const t = Number(sorted[i].unit_nav);
      const p = Number(sorted[i + 1].unit_nav);
      if (t > 0 && p > 0) vals.push(((t - p) / p) * 10000);
    }
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const annualValue = calcAnnualized(annualRange);
  const perMyriadValue = calcPerMyriad(perMyriadRange);

  const annualTabs: { key: AnnualRange; label: string }[] = [
    { key: 7, label: "七日" },
    { key: 30, label: "近1月" },
    { key: 90, label: "近3月" },
    { key: 180, label: "近6月" },
    { key: 365, label: "近1年" },
  ];

  const perMyriadTabs: { key: PerMyriadRange; label: string }[] = [
    { key: 1, label: "今日" },
    { key: 7, label: "7日" },
    { key: 14, label: "14日" },
  ];

  return (
    <div className="space-y-3 mt-5">
      {/* 单位净值 */}
      <div className="bg-gray-50 rounded-xl py-3 px-4 flex justify-between items-center">
        <div>
          <div className="text-xs text-gray-400 mb-1">单位净值</div>
          <div className="text-xl font-bold font-mono text-gray-900">
            {latestNav != null && !isNaN(latestNav) ? latestNav.toFixed(4) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1">净值日</div>
          <div className="text-sm text-gray-600">{latest?.nav_date || "—"}</div>
        </div>
      </div>

      {/* 年化收益率 */}
      <div className="bg-red-50 rounded-xl py-4 px-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="text-xs text-gray-500 font-medium">年化收益率</div>
          <div className="flex gap-1 flex-wrap">
            {annualTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setAnnualRange(t.key)}
                className={`px-2 py-0.5 text-[11px] rounded-md transition ${
                  annualRange === t.key
                    ? "bg-white text-red-500 font-medium shadow-sm"
                    : "text-gray-500 hover:bg-white/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-2xl font-bold text-red-500">
          {annualValue != null
            ? `${annualValue > 0 ? "+" : ""}${annualValue.toFixed(2)}%`
            : "—"}
        </div>
      </div>

      {/* 万份收益 */}
      <div className="bg-blue-50 rounded-xl py-4 px-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="text-xs text-gray-500 font-medium">万份收益（元）</div>
          <div className="flex gap-1">
            {perMyriadTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setPerMyriadRange(t.key)}
                className={`px-2 py-0.5 text-[11px] rounded-md transition ${
                  perMyriadRange === t.key
                    ? "bg-white text-blue-600 font-medium shadow-sm"
                    : "text-gray-500 hover:bg-white/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-2xl font-bold font-mono text-blue-600">
          {perMyriadValue != null ? perMyriadValue.toFixed(4) : "—"}
        </div>
      </div>
    </div>
  );
}