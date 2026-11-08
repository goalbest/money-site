"use client";

import { useMemo, useRef, useState } from "react";

type Period = "today" | "yesterday" | "7d" | "1m" | "3m" | "6m" | "1y";

const PERIODS: { key: Period; label: string; days: number; endOffset: number }[] = [
  { key: "today", label: "今日", days: 1, endOffset: 0 },
  { key: "yesterday", label: "昨日", days: 1, endOffset: 1 },
  { key: "7d", label: "7日", days: 7, endOffset: 0 },
  { key: "1m", label: "近1月", days: 30, endOffset: 0 },
  { key: "3m", label: "近3月", days: 90, endOffset: 0 },
  { key: "6m", label: "近6月", days: 180, endOffset: 0 },
  { key: "1y", label: "近1年", days: 365, endOffset: 0 },
];

function findStartIndex(navList: any[], endIdx: number, periodDays: number): number {
  if (endIdx <= 0) return 0;
  const endDate = new Date(navList[endIdx].nav_date);
  let targetDate = new Date(endDate);
  
  if (periodDays === 30) targetDate.setMonth(targetDate.getMonth() - 1);
  else if (periodDays === 90) targetDate.setMonth(targetDate.getMonth() - 3);
  else if (periodDays === 180) targetDate.setMonth(targetDate.getMonth() - 6);
  else if (periodDays === 365) targetDate.setFullYear(targetDate.getFullYear() - 1);
  else targetDate.setDate(targetDate.getDate() - periodDays);

  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i <= endIdx; i++) {
    const curDate = new Date(navList[i].nav_date);
    const diff = Math.abs(curDate.getTime() - targetDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}

function calcChange(navList: any[], days: number, endOffset: number): number | null {
  const endIdx = navList.length - 1 - endOffset;
  if (endIdx < 1) return null;
  const startIdx = findStartIndex(navList, endIdx, days);
  if (startIdx >= endIdx) return null;
  const first = Number(navList[startIdx].unit_nav);
  const last = Number(navList[endIdx].unit_nav);
  if (first <= 0) return null;
  return ((last - first) / first) * 100;
}

function calcAnnualized(navList: any[], days: number, endOffset: number): number | null {
  const endIdx = navList.length - 1 - endOffset;
  if (endIdx < 1) return null;
  const startIdx = findStartIndex(navList, endIdx, days);
  if (startIdx >= endIdx) return null;
  const first = Number(navList[startIdx].unit_nav);
  const last = Number(navList[endIdx].unit_nav);
  if (first <= 0) return null;
  const startDate = new Date(navList[startIdx].nav_date);
  const endDate = new Date(navList[endIdx].nav_date);
  const actualDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return ((last - first) / first) * (365 / actualDays) * 100;
}

function calcWanFenSum(navList: any[], days: number, endOffset: number): number | null {
  const endIdx = navList.length - 1 - endOffset;
  if (endIdx < 1) return null;
  const startIdx = findStartIndex(navList, endIdx, days);
  let sum = 0;
  let count = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const prev = Number(navList[i - 1].unit_nav);
    const cur = Number(navList[i].unit_nav);
    if (prev > 0) {
      sum += ((cur - prev) / prev) * 10000;
      count++;
    }
  }
  return count > 0 ? sum : null;
}

function calcZeroDays(navList: any[], days: number, endOffset: number) {
  const endIdx = navList.length - 1 - endOffset;
  if (endIdx < 1) return { zero: 0, total: 0 };
  const startIdx = findStartIndex(navList, endIdx, days);
  let zero = 0;
  let total = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    total++;
    if (Number(navList[i].unit_nav) <= Number(navList[i - 1].unit_nav)) zero++;
  }
  return { zero, total };
}

function calcMaxDrawdown(navList: any[], days: number, endOffset: number) {
  const endIdx = navList.length - 1 - endOffset;
  if (endIdx < 1) return null;
  const startIdx = findStartIndex(navList, endIdx, days);
  if (endIdx - startIdx < 2) return null;
  const navs = navList.map((n: any) => Number(n.unit_nav));
  let peak = navs[startIdx];
  let maxDD = 0;
  let bestPeak = peak;
  let bestTrough = peak;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const cur = navs[i];
    if (cur > peak) peak = cur;
    else if (peak > 0) {
      const dd = (peak - cur) / peak;
      if (dd > maxDD) {
        maxDD = dd;
        bestPeak = peak;
        bestTrough = cur;
      }
    }
  }
  if (maxDD <= 0.00001) return null;
  return { percent: maxDD * 100, peak: bestPeak, trough: bestTrough };
}

type ZeroItem = { date: string; diff: number };

function collectZeroDays(navList: any[], days: number, endOffset: number): ZeroItem[] {
  const endIdx = navList.length - 1 - endOffset;
  if (endIdx < 1) return [];
  const startIdx = findStartIndex(navList, endIdx, days);
  const list: ZeroItem[] = [];
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const prev = Number(navList[i - 1].unit_nav);
    const cur = Number(navList[i].unit_nav);
    if (prev <= 0) continue;
    const diff = ((cur - prev) / prev) * 100;
    if (diff <= 0) list.push({ date: navList[i].nav_date, diff });
  }
  return list.sort((a, b) => a.diff - b.diff);
}

function profitColor(n: number | null): string {
  if (n == null) return "text-slate-400";
  if (n > 0) return "text-rose-500";
  if (n < 0) return "text-emerald-500";
  return "text-slate-500";
}

const DEFAULT_ORDER = ["nav", "change", "annualized", "wanfen", "zero", "drawdown"];

export default function MetricsPanel({ navList }: { navList: any[] }) {
  const [period, setPeriod] = useState<Period>("1m");
  const [zeroExpanded, setZeroExpanded] = useState(false);

  const latestNav = navList[navList.length - 1] ? Number(navList[navList.length - 1].unit_nav) : null;
  const latestDate = navList[navList.length - 1]?.nav_date || "";
  const cfg = PERIODS.find(p => p.key === period)!;
  const periodLabel = cfg.label;

  const change = calcChange(navList, cfg.days, cfg.endOffset);
  const annualized = calcAnnualized(navList, cfg.days, cfg.endOffset);
  const wanfen = calcWanFenSum(navList, cfg.days, cfg.endOffset);
  const { zero: zeroDays, total: totalDays } = calcZeroDays(navList, cfg.days, cfg.endOffset);
  const maxDrawdown = calcMaxDrawdown(navList, cfg.days, cfg.endOffset);

  const zeroRatio = totalDays > 0 ? zeroDays / totalDays : 0;
  const zeroWarn = zeroRatio >= 0.4;
  const zeroCritical = zeroRatio >= 0.7;

  const zeroBg = zeroCritical ? "bg-rose-50/70" : zeroWarn ? "bg-amber-50/70" : "bg-slate-50/80";
  const zeroTextColor = zeroCritical ? "text-rose-600" : zeroWarn ? "text-amber-600" : "text-slate-900";

  const zeroItems = useMemo(
    () => collectZeroDays(navList, cfg.days, cfg.endOffset),
    [navList, cfg.days, cfg.endOffset]
  );

  const negatives = zeroItems.filter(i => i.diff < 0);
  const flats = zeroItems.filter(i => i.diff === 0);
  const worst = zeroItems[0];
  const avg = negatives.length > 0 ? negatives.reduce((s, i) => s + i.diff, 0) / negatives.length : 0;

  function renderCell(key: string) {
    switch (key) {
      case "nav":
        return (
          <>
            <div className="text-[10px] text-slate-400 mb-1 truncate">净值</div>
            <div className="font-mono font-bold text-[12px] text-slate-900 tabular leading-none truncate">
              {latestNav != null ? latestNav.toFixed(4) : "—"}
            </div>
            <div className="text-[9px] text-slate-400 mt-1.5 tabular truncate">
              {latestDate ? latestDate.slice(5) : "—"}
            </div>
          </>
        );
      case "change":
        return (
          <>
            <div className="text-[10px] text-slate-400 mb-1 truncate">涨跌</div>
            <div className={`font-mono font-bold text-[12px] tabular leading-none truncate ${profitColor(change)}`}>
              {change == null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
            </div>
            <div className="text-[9px] text-slate-400 mt-1.5 truncate">{periodLabel}</div>
          </>
        );
      case "annualized":
        return (
          <>
            <div className="text-[10px] text-rose-400 mb-1 truncate">年化</div>
            <div className={`font-mono font-bold text-[12px] tabular leading-none truncate ${profitColor(annualized)}`}>
              {annualized == null ? "—" : `${annualized >= 0 ? "+" : ""}${annualized.toFixed(2)}%`}
            </div>
            <div className="text-[9px] text-rose-400/80 mt-1.5 truncate">{periodLabel}</div>
          </>
        );
      case "wanfen":
        return (
          <>
            <div className="text-[10px] text-blue-400 mb-1 truncate">万份</div>
            <div className="font-mono font-bold text-[12px] text-blue-600 tabular leading-none truncate">
              {wanfen == null ? "—" : wanfen.toFixed(2)}
            </div>
            <div className="text-[9px] text-blue-400/80 mt-1.5 truncate">{periodLabel}</div>
          </>
        );
      case "zero":
        return (
          <>
            <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-0.5 truncate">
              <span>挂0</span>
              {zeroWarn && (
                <svg className={`w-2.5 h-2.5 flex-shrink-0 ${zeroCritical ? "text-rose-500" : "text-amber-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0L3.16 16.25A2 2 0 005 19z" />
                </svg>
              )}
            </div>
            <div className={`font-mono font-bold text-[12px] tabular leading-none truncate ${zeroTextColor}`}>
              {totalDays > 0 ? `${zeroDays}/${totalDays}` : "—"}
            </div>
            <div className="text-[9px] text-slate-400 mt-1.5 truncate">
              {totalDays > 0 ? `${(zeroRatio * 100).toFixed(0)}%` : periodLabel}
            </div>
          </>
        );
      case "drawdown":
        return (
          <>
            <div className="text-[10px] text-amber-500 mb-1 truncate">回撤</div>
            <div className={`font-mono font-bold text-[12px] tabular leading-none truncate ${maxDrawdown == null ? "text-slate-400" : "text-amber-600"}`}>
              {maxDrawdown == null ? "—" : `-${maxDrawdown.percent.toFixed(2)}%`}
            </div>
            <div className="text-[9px] text-slate-400 mt-1.5 tabular truncate">
              {maxDrawdown == null ? periodLabel : `${maxDrawdown.peak.toFixed(4)}→${maxDrawdown.trough.toFixed(4)}`}
            </div>
          </>
        );
      default:
        return null;
    }
  }

  function cellBg(key: string): string {
    if (key === "annualized") return "bg-rose-50/60";
    if (key === "wanfen") return "bg-blue-50/60";
    if (key === "zero") return zeroBg;
    if (key === "drawdown") return "bg-amber-50/60";
    return "bg-slate-50/80";
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 relative z-[3]">
        <div className="text-[15px] font-bold text-slate-900 flex-shrink-0">
          关键指标
        </div>
        <div className="flex gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              style={{ touchAction: "manipulation" }}
              className={`px-2 py-1 rounded-full text-[10px] font-medium flex-shrink-0 transition-all active:scale-95 ${
                period === p.key
                  ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm shadow-purple-500/25"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 relative z-[3]">
        {DEFAULT_ORDER.map((key) => (
          <div
            key={key}
            className={`relative min-w-0 p-2.5 rounded-xl select-none ${cellBg(key)}`}
          >
            {renderCell(key)}
          </div>
        ))}
      </div>

      {zeroDays > 0 && (
        <button
          type="button"
          onClick={() => setZeroExpanded(v => !v)}
          className="w-full mt-2 py-1.5 rounded-lg flex items-center justify-center gap-1 text-[11px] text-slate-500 font-medium hover:bg-slate-50 active:scale-[0.99] transition-all relative z-[3]"
        >
          {zeroExpanded ? "收起挂0明细" : `查看 ${zeroDays} 天挂0明细`}
          <svg className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${zeroExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {zeroExpanded && zeroDays > 0 && (
        <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/50 overflow-hidden animate-fade-in relative z-[3]">
          <div className="grid grid-cols-4 divide-x divide-slate-100 border-b divider">
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-slate-400 mb-0.5">持平</div>
              <div className="font-mono font-semibold text-[12px] text-slate-500 tabular">{flats.length} 天</div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-slate-400 mb-0.5">下跌</div>
              <div className="font-mono font-semibold text-[12px] text-emerald-500 tabular">{negatives.length} 天</div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-slate-400 mb-0.5">平均跌幅</div>
              <div className="font-mono font-semibold text-[12px] text-emerald-500 tabular">{negatives.length > 0 ? `${avg.toFixed(2)}%` : "0.00%"}</div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-slate-400 mb-0.5">最大跌幅</div>
              <div className="font-mono font-semibold text-[12px] text-emerald-500 tabular">{worst ? `${worst.diff.toFixed(2)}%` : "—"}</div>
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto no-scrollbar">
            {zeroItems.map((it, idx) => (
              <div key={it.date + idx} className="flex items-center justify-between px-3 py-2 border-b divider last:border-b-0">
                <span className="text-[11px] text-slate-500 tabular">{it.date}</span>
                <span className={`font-mono font-semibold text-[12px] tabular ${it.diff < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                  {it.diff >= 0 ? "+" : ""}{it.diff.toFixed(3)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}