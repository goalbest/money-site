"use client";

import { useState, useEffect } from "react";
import type { Goal } from "../../../lib/useGoals";

type Props = {
  open: boolean;
  editing?: Goal | null;
  currentAmount: number;
  onClose: () => void;
  onSave: (data: { name: string; targetAmount: number; targetDate: string | null }) => void;
};

const PRESETS = [
  { label: "10 万", value: 100000 },
  { label: "30 万", value: 300000 },
  { label: "50 万", value: 500000 },
  { label: "100 万", value: 1000000 },
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function addMonths(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}

export default function GoalModal({
  open, editing, currentAmount, onClose, onSave,
}: Props) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setTargetAmount(String(editing.targetAmount));
      setTargetDate(editing.targetDate || "");
    } else {
      setName("我的目标");
      setTargetAmount("");
      setTargetDate("");
    }
    setMsg("");
  }, [open, editing]);

  if (!open) return null;

  function handleSave() {
    const amt = Number(targetAmount);
    if (!amt || amt <= 0) {
      setMsg("请输入有效的目标金额");
      return;
    }
    if (amt <= currentAmount) {
      setMsg("目标金额应大于当前资产");
      return;
    }
    onSave({
      name: name.trim() || "我的目标",
      targetAmount: amt,
      targetDate: targetDate || null,
    });
  }

  const amt = Number(targetAmount);
  const needed = amt > 0 ? amt - currentAmount : 0;
  const showPreview = needed > 0;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[100] animate-fade-in"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[110] animate-slide-up"
        style={{ animationDuration: "0.3s" }}
      >
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b divider flex items-center justify-between">
              <div className="text-[15px] font-semibold text-slate-900">
                {editing ? "编辑目标" : "设置新目标"}
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100
                           flex items-center justify-center active:scale-90"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">目标名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：买房首付"
                  className="input-field w-full px-4 py-3 text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">目标金额（元）</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="如 500000"
                  className="input-field w-full px-4 py-3 text-[16px] font-mono tabular font-semibold"
                />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setTargetAmount(String(p.value))}
                      className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-600
                                 text-[11px] font-medium hover:bg-purple-100
                                 active:scale-95 transition-all"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {showPreview && (
                <div className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3.5 py-2.5">
                  当前 <span className="font-mono font-semibold text-slate-700">¥{currentAmount.toLocaleString("zh-CN")}</span>
                  ，还差 <span className="font-mono font-semibold text-purple-600">¥{needed.toLocaleString("zh-CN")}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">期望完成日期（选填）</label>
                <input
                  type="date"
                  value={targetDate}
                  min={todayStr()}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="input-field w-full px-4 py-3 text-[13px] tabular"
                />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <button
                    onClick={() => setTargetDate(addMonths(3))}
                    className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 text-[11px] font-medium hover:bg-slate-100 active:scale-95 transition-all"
                  >3 个月</button>
                  <button
                    onClick={() => setTargetDate(addMonths(6))}
                    className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 text-[11px] font-medium hover:bg-slate-100 active:scale-95 transition-all"
                  >半年</button>
                  <button
                    onClick={() => setTargetDate(addMonths(12))}
                    className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 text-[11px] font-medium hover:bg-slate-100 active:scale-95 transition-all"
                  >1 年</button>
                  <button
                    onClick={() => setTargetDate(addMonths(24))}
                    className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 text-[11px] font-medium hover:bg-slate-100 active:scale-95 transition-all"
                  >2 年</button>
                </div>
              </div>

              {msg && (
                <div className="text-[13px] text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                  {msg}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t divider flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1 py-3 text-sm">
                取消
              </button>
              <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">
                {editing ? "保存" : "创建目标"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}