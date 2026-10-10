"use client";

import { useState, useEffect } from "react";

const QUICK = [
  { key: "y", label: "昨天", days: 1 },
  { key: "3d", label: "3天前", days: 3 },
  { key: "7d", label: "1周前", days: 7 },
  { key: "30d", label: "1月前", days: 30 },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

type Props = {
  open: boolean;
  current: string | null;
  getProfit: (date: string) => number;
  onSelect: (date: string | null) => void;
  onClose: () => void;
};

export default function CompareDateModal({
  open, current, getProfit, onSelect, onClose,
}: Props) {
  const [date, setDate] = useState<string>(current || daysAgo(1));

  useEffect(() => {
    if (open) setDate(current || daysAgo(1));
  }, [open, current]);

  if (!open) return null;

  const profit = getProfit(date);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[100] animate-fade-in"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[110] flex items-center justify-center px-6 pointer-events-none">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full animate-scale-in pointer-events-auto">
          <div className="flex items-center justify-between mb-5">
            <div className="text-[17px] font-bold text-slate-900">对比哪天？</div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100
                         flex items-center justify-center active:scale-90 transition-all"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-1.5 mb-4 flex-wrap">
            {QUICK.map(q => {
              const d = daysAgo(q.days);
              const active = date === d;
              return (
                <button
                  key={q.key}
                  onClick={() => setDate(d)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium
                              transition-all active:scale-95
                              ${active
                                ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm"
                                : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
                >
                  {q.label}
                </button>
              );
            })}
          </div>

          <div className="mb-5">
            <label className="block text-[11px] text-slate-500 mb-2">或自选日期</label>
            <input
              type="date"
              value={date}
              max={daysAgo(1)}
              onChange={(e) => setDate(e.target.value)}
              className="input-field w-full px-4 py-3 text-[13px] tabular"
            />
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 mb-5">
            <div className="text-[11px] text-slate-500 mb-2">
              从 {date.slice(5)} 到今天累计收益
            </div>
            <div className={`font-mono font-bold text-[24px] tabular ${
              profit > 0 ? "text-rose-500"
              : profit < 0 ? "text-emerald-500"
              : "text-slate-500"
            }`}>
              {profit >= 0 ? "+" : ""}{profit.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-2 leading-relaxed">
              按现有持仓的每日净值变化累加，不含买卖
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => { onSelect(date); onClose(); }}
              className="btn-primary w-full py-3 text-[14px] font-semibold"
            >
              确定对比
            </button>
            {current && (
              <button
                onClick={() => { onSelect(null); onClose(); }}
                className="btn-secondary w-full py-3 text-[13px] font-semibold"
              >
                恢复默认（昨天）
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}