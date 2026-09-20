"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Range = "1m" | "3m" | "6m" | "1y" | "all";

const RANGES: { key: Range; label: string; days: number | null }[] = [
  { key: "1m", label: "近1月", days: 30 },
  { key: "3m", label: "近3月", days: 90 },
  { key: "6m", label: "近6月", days: 180 },
  { key: "1y", label: "近1年", days: 365 },
  { key: "all", label: "成立以来", days: null },
];

export default function NavChart({ data }: { data: any[] }) {
  const [range, setRange] = useState<Range>("1m");

  const filtered = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sorted = [...data].sort((a, b) =>
      String(a.nav_date).localeCompare(String(b.nav_date))
    );

    const config = RANGES.find(r => r.key === range);
    if (!config || config.days === null) return sorted;

    const lastDate = new Date(sorted[sorted.length - 1].nav_date);
    const startDate = new Date(lastDate);
    startDate.setDate(startDate.getDate() - config.days);

    return sorted.filter(n => new Date(n.nav_date) >= startDate);
  }, [data, range]);

  // 计算过滤后的区间涨跌
  const stats = useMemo(() => {
    if (filtered.length < 2) return null;
    const first = Number(filtered[0].unit_nav);
    const last = Number(filtered[filtered.length - 1].unit_nav);
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    return {
      first: first.toFixed(4),
      last: last.toFixed(4),
      change,
    };
  }, [filtered]);

  if (!data || data.length === 0) {
    return (
      <p className="text-gray-400 text-sm py-10 text-center">暂无净值历史数据</p>
    );
  }

  return (
    <div>
      {/* 时间范围切换 */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition ${
              range === r.key
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 区间统计 */}
      {stats && (
        <div className="flex gap-4 mb-4 text-xs">
          <div>
            <span className="text-gray-400">起始 </span>
            <span className="font-mono text-gray-700">{stats.first}</span>
          </div>
          <div>
            <span className="text-gray-400">期末 </span>
            <span className="font-mono text-gray-700">{stats.last}</span>
          </div>
          <div>
            <span className="text-gray-400">区间涨跌 </span>
            <span
              className={`font-mono font-medium ${
                stats.change > 0
                  ? "text-red-500"
                  : stats.change < 0
                  ? "text-green-600"
                  : "text-gray-500"
              }`}
            >
              {stats.change > 0 ? "+" : ""}
              {stats.change.toFixed(3)}%
            </span>
          </div>
          <div>
            <span className="text-gray-400">共 </span>
            <span className="font-mono text-gray-700">{filtered.length}</span>
            <span className="text-gray-400"> 天</span>
          </div>
        </div>
      )}

      {/* 折线图 */}
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={filtered} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="nav_date"
            tick={{ fontSize: 11, fill: "#999" }}
            tickFormatter={(v) => String(v).slice(5)}
            minTickGap={30}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "#999" }}
            tickFormatter={(v) => Number(v).toFixed(3)}
            width={55}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #eee",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: any) => [Number(value).toFixed(4), "单位净值"]}
            labelFormatter={(label) => `日期 ${label}`}
          />
          <Line
            type="monotone"
            dataKey="unit_nav"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}