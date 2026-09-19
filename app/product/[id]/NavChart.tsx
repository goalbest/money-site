"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function NavChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return <p className="text-gray-400 text-sm py-10 text-center">暂无净值历史数据</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="nav_date" tick={{ fontSize: 12 }} />
        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Line type="monotone" dataKey="unit_nav" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}