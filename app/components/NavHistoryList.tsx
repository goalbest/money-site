"use client";

import { useMemo, useState } from "react";

type NavRow = {
  nav_date: string;
  unit_nav: number | string;
  accum_nav?: number | string | null;
};

type Props = {
  rows: NavRow[];
  maxHeightVh?: number;
};

type Period = "7d" | "30d" | "90d" | "custom" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "7d", label: "近7天" },
  { key: "30d", label: "近1月" },
  { key: "90d", label: "近3月" },
  { key: "custom", label: "自定义" },
  { key: "all", label: "全部" },
];

function fmtNav(n: any): string {
  const v = Number(n);
  return isNaN(v) ? "—" : v.toFixed(4);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export default function NavHistoryList({ rows, maxHeightVh = 45 }: Props) {
  const [period, setPeriod] = useState<Period>("30d");
  const [customStart, setCustomStart] = useState<string>(daysAgoStr(30));
  const [customEnd, setCustomEnd] = useState<string>(todayStr());
  const [customOpen, setCustomOpen] = useState(false);

  const list = useMemo(() => {
    const sorted = [...rows].sort((a, b) =>
      String(a.nav_date).localeCompare(String(b.nav_date))
    );
    return sorted
      .map((r, i) => {
        const cur = Number(r.unit_nav);
        const prev = i > 0 ? Number(sorted[i - 1].unit_nav) : null;
        const diff = prev != null ? cur - prev : null;
        return {
          date: String(r.nav_date),
          nav: cur,
          diff,
        };
      })
      .reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    if (period === "all") return list;
    if (period === "custom") {
      return list.filter((r) => r.date >= customStart && r.date <= customEnd);
    }
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const cutoff = daysAgoStr(days);
    return list.filter((r) => r.date >= cutoff);
  }, [list, period, customStart, customEnd]);

  if (list.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <div className="text-slate-300 text-[12px]">暂无净值数据</div>
      </div>
    );
  }

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    if (p === "custom") {
      setCustomOpen(true);
    } else {
      setCustomOpen(false);
    }
  }

  return (
    <div>
      {/* 时间段 chips */}
      <div className="flex gap-1.5 px-4 pt-3 pb-3 overflow-x-auto no-scrollbar">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => handlePeriodChange(p.key)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium flex-shrink-0
                        transition-all active:scale-95
                        ${
                          period === p.key
                            ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm shadow-purple-500/25"
                            : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                        }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 自定义日期段 */}
      {period === "custom" && customOpen && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-purple-50/50 border border-purple-100">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-[10px] text-purple-600 mb-1 font-medium">开始</label>
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-purple-100
                           text-[12px] tabular focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-[10px] text-purple-600 mb-1 font-medium">结束</label>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={todayStr()}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-purple-100
                           text-[12px] tabular focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>
          <div className="text-[10px] text-purple-500 text-center">
            {filtered.length} 条记录
          </div>
        </div>
      )}

      {/* ★ 固定表头 */}
      <div className="flex items-center px-5 py-2 border-y divider bg-slate-50/40">
        <span className="flex-1 text-[10px] text-slate-400 font-medium tracking-wider">日期</span>
        <span className="flex-1 text-[10px] text-slate-400 font-medium tracking-wider text-center">单位净值</span>
        <span className="flex-1 text-[10px] text-slate-400 font-medium tracking-wider text-right">日涨跌</span>
      </div>

      {/* ★ 固定高度滚动区 */}
      {filtered.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px] text-slate-300">
          该时间段无数据
        </div>
      ) : (
        <div
          className="overflow-y-auto"
          style={{
            maxHeight: `${maxHeightVh}vh`,
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
          }}
        >
          {filtered.map((row, i) => {
            const diffColor =
              row.diff == null
                ? "text-slate-300"
                : row.diff > 0
                ? "text-rose-500"
                : row.diff < 0
                ? "text-emerald-500"
                : "text-slate-400";

            const diffBg =
              row.diff == null
                ? ""
                : row.diff > 0
                ? "bg-rose-50/70"
                : row.diff < 0
                ? "bg-emerald-50/70"
                : "";

            return (
              <div
                key={row.date}
                className={`flex items-center px-5 py-2.5
                            ${i > 0 ? "border-t divider" : ""}
                            hover:bg-slate-50/60 transition-colors`}
              >
                {/* 日期 */}
                <span className="flex-1 text-[12px] text-slate-500 tabular font-mono">
                  {row.date}
                </span>

                {/* 单位净值 */}
                <span className="flex-1 font-mono font-semibold text-[14px] text-slate-900 tabular text-center">
                  {fmtNav(row.nav)}
                </span>

                {/* 日涨跌（带色块） */}
                <span className="flex-1 text-right">
                  <span
                    className={`inline-block font-mono text-[12px] tabular
                                px-2 py-0.5 rounded-md min-w-[72px] text-center
                                ${diffColor} ${diffBg}`}
                  >
                    {row.diff == null
                      ? "—"
                      : `${row.diff >= 0 ? "+" : ""}${row.diff.toFixed(4)}`}
                  </span>
                </span>
              </div>
            );
          })}

          <div className="py-2 text-center text-[10px] text-slate-300">
            共 {filtered.length} 条 · 上下滑动查看
          </div>
        </div>
      )}
    </div>
  );
}