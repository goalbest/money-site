"use client";

import { useMemo } from "react";
import ScrollableList from "./home/ScrollableList";

type NavRow = {
  nav_date: string;
  unit_nav: number | string;
  accum_nav?: number | string | null;
};

type Props = {
  rows: NavRow[];
  /** 显示几条 */
  visibleCount?: number;
  /** 单条高度 */
  itemHeight?: number;
};

function fmtNav(n: any): string {
  const v = Number(n);
  return isNaN(v) ? "—" : v.toFixed(4);
}

export default function NavHistoryList({
  rows,
  visibleCount = 8,
  itemHeight = 48,
}: Props) {
  // 按日期倒序（最新在上），并计算相邻差
  const list = useMemo(() => {
    const sorted = [...rows].sort((a, b) =>
      String(a.nav_date).localeCompare(String(b.nav_date))
    );
    return sorted.map((r, i) => {
      const cur = Number(r.unit_nav);
      const prev = i > 0 ? Number(sorted[i - 1].unit_nav) : null;
      const diff =
        prev != null && prev > 0 ? ((cur - prev) / prev) * 100 : null;
      return {
        date: String(r.nav_date),
        nav: cur,
        accum: r.accum_nav != null ? Number(r.accum_nav) : null,
        diff,
      };
    }).reverse(); // 最新在上
  }, [rows]);

  if (list.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <div className="text-slate-300 text-[12px]">暂无净值数据</div>
      </div>
    );
  }

  return (
    <ScrollableList
      items={list}
      visibleCount={visibleCount}
      itemHeight={itemHeight}
      initialCount={50}
      pageSize={50}
      empty={<div />}
      renderItem={(row) => (
        <div
          key={row.date}
          className="flex items-center gap-3 px-5 py-2.5
                     border-t divider first:border-t-0
                     hover:bg-slate-50 transition-colors"
        >
          {/* 日期 */}
          <span className="text-[12px] text-slate-500 tabular w-[92px] flex-shrink-0">
            {row.date}
          </span>

          {/* 单位净值 */}
          <span className="flex-1 font-mono font-semibold text-[13px] text-slate-900 tabular text-right">
            {fmtNav(row.nav)}
          </span>

          {/* 累计净值（小字） */}
          {row.accum != null && (
            <span className="font-mono text-[11px] text-slate-400 tabular text-right w-[60px] flex-shrink-0">
              {row.accum.toFixed(4)}
            </span>
          )}

          {/* 日涨跌 */}
          <span
            className={`font-mono text-[12px] tabular text-right w-[68px] flex-shrink-0 ${
              row.diff == null
                ? "text-slate-300"
                : row.diff > 0
                ? "text-rose-500"
                : row.diff < 0
                ? "text-emerald-500"
                : "text-slate-400"
            }`}
          >
            {row.diff == null
              ? "—"
              : `${row.diff >= 0 ? "+" : ""}${row.diff.toFixed(3)}%`}
          </span>
        </div>
      )}
    />
  );
}