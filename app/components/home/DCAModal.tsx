"use client";

import { useState, useEffect } from "react";
import type { DCAPlan } from "../../../lib/useDCAPlans";
import { WEEKDAY_LABELS } from "../../../lib/useDCAPlans";

type Props = {
  open: boolean;
  editing?: DCAPlan | null;
  products: { id: number; name: string; bank: string }[];
  onClose: () => void;
  onSave: (data: {
    productId: number;
    productName: string;
    bank: string;
    amount: number;
    frequency: DCAPlan["frequency"];
    weekday?: number;
    dayOfMonth?: number;
    note?: string;
  }) => void;
};

const FREQUENCIES: { key: DCAPlan["frequency"]; label: string }[] = [
  { key: "daily", label: "每天" },
  { key: "weekly", label: "每周" },
  { key: "biweekly", label: "每两周" },
  { key: "monthly", label: "每月" },
];

const QUICK_AMOUNTS = [
  { label: "100", value: 100 },
  { label: "500", value: 500 },
  { label: "1000", value: 1000 },
  { label: "2000", value: 2000 },
];

export default function DCAModal({
  open, editing, products, onClose, onSave,
}: Props) {
  const [productId, setProductId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<DCAPlan["frequency"]>("monthly");
  const [weekday, setWeekday] = useState(1);   // 周一
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setProductId(editing.productId);
      setAmount(String(editing.amount));
      setFrequency(editing.frequency);
      setWeekday(editing.weekday ?? 1);
      setDayOfMonth(editing.dayOfMonth ?? 1);
      setNote(editing.note || "");
    } else {
      setProductId(products[0]?.id ?? null);
      setAmount("");
      setFrequency("monthly");
      setWeekday(1);
      setDayOfMonth(1);
      setNote("");
    }
    setMsg("");
  }, [open, editing, products]);

  if (!open) return null;

  const product = products.find(p => p.id === productId);

  function handleSave() {
    if (!productId) return setMsg("请选择产品");
    const amt = Number(amount);
    if (!amt || amt <= 0) return setMsg("请填写有效金额");

    onSave({
      productId,
      productName: product?.name || "",
      bank: product?.bank || "",
      amount: amt,
      frequency,
      weekday: frequency === "weekly" || frequency === "biweekly" ? weekday : undefined,
      dayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
      note: note.trim() || undefined,
    });
  }

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
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col">
            <div className="px-5 py-4 border-b divider flex items-center justify-between flex-shrink-0">
              <div className="text-[15px] font-semibold text-slate-900">
                {editing ? "编辑定投" : "新建定投"}
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

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* 产品选择 */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">
                  选择产品 <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="input-field w-full px-4 py-3 text-[13px]
                             flex items-center justify-between text-left"
                >
                  {product ? (
                    <span className="text-slate-900 truncate">{product.name}</span>
                  ) : (
                    <span className="text-slate-400">点击选择产品</span>
                  )}
                  <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* 金额 */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">
                  每次金额（元） <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000"
                  className="input-field w-full px-4 py-3 text-[16px] font-mono tabular font-semibold"
                />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {QUICK_AMOUNTS.map(q => (
                    <button
                      key={q.value}
                      onClick={() => setAmount(String(q.value))}
                      className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-600
                                 text-[11px] font-medium hover:bg-purple-100
                                 active:scale-95 transition-all"
                    >
                      ¥{q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 频率 */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">执行频率</label>
                <div className="segment-group flex">
                  {FREQUENCIES.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFrequency(f.key)}
                      className={`flex-1 py-2.5 text-[12px] segment-item ${
                        frequency === f.key ? "segment-item-active" : "hover:text-slate-700"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 周几 / 每月几号 */}
              {(frequency === "weekly" || frequency === "biweekly") && (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">星期几</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAY_LABELS.map((w, i) => (
                      <button
                        key={i}
                        onClick={() => setWeekday(i)}
                        className={`py-2 rounded-lg text-[12px] font-medium
                                    transition-all duration-200
                                    ${weekday === i
                                      ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white"
                                      : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                                    }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {frequency === "monthly" && (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">每月几号</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
                    className="input-field w-full px-4 py-3 text-[14px] font-mono tabular"
                  />
                  <div className="text-[10px] text-slate-400 mt-1.5">
                    建议 1-28 号，避免月末天数不一致
                  </div>
                </div>
              )}

              {/* 备注 */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">备注（选填）</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：长期定投计划"
                  className="input-field w-full px-4 py-3 text-[13px]"
                />
              </div>

              {msg && (
                <div className="text-[13px] text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                  {msg}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t divider flex gap-2 flex-shrink-0">
              <button onClick={onClose} className="btn-secondary flex-1 py-3 text-sm">
                取消
              </button>
              <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">
                {editing ? "保存" : "创建定投"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 产品选择器 */}
      {pickerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[120] animate-fade-in"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => setPickerOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[130] animate-slide-up"
            style={{ animationDuration: "0.3s" }}
          >
            <div className="max-w-3xl mx-auto px-4 pb-4">
              <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[70vh] flex flex-col">
                <div className="px-5 py-4 border-b divider flex items-center justify-between flex-shrink-0">
                  <div className="text-[15px] font-semibold text-slate-900">选择产品</div>
                  <button
                    onClick={() => setPickerOpen(false)}
                    className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100
                               flex items-center justify-center active:scale-90"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto flex-1">
                  {products.length === 0 ? (
                    <div className="py-12 text-center text-[12px] text-slate-400">
                      还没有持仓产品
                    </div>
                  ) : (
                    products.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setProductId(p.id);
                          setPickerOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-5 py-3.5
                                    border-b divider last:border-b-0
                                    transition-colors text-left
                                    ${productId === p.id ? "bg-purple-50" : "hover:bg-slate-50"}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] truncate ${
                            productId === p.id ? "text-purple-700 font-semibold" : "text-slate-900 font-medium"
                          }`}>
                            {p.name}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {p.bank}
                          </div>
                        </div>
                        {productId === p.id && (
                          <svg className="w-4 h-4 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}