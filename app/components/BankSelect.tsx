"use client";

import { BANKS } from "../../lib/banks";

type Props = {
  open: boolean;
  current?: string;
  onClose: () => void;
  onSelect: (bank: string) => void;
};

export default function BankSelect({ open, current, onClose, onSelect }: Props) {
  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/40 z-[80] animate-fade-in"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* 底部弹窗 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[90] animate-fade-in-up"
        style={{ animationDuration: "0.3s" }}
      >
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl mb-2 max-h-[70vh] flex flex-col">

            {/* 头部 */}
            <div className="px-5 py-4 border-b divider flex items-center justify-between flex-shrink-0">
              <div className="text-[15px] font-semibold text-slate-900">
                选择所属银行
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100
                           flex items-center justify-center
                           transition-colors active:scale-90"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 银行列表 */}
            <div className="overflow-y-auto flex-1">
              {BANKS.map((b) => {
                const isSelected = b.name === current;
                return (
                  <button
                    key={b.name}
                    onClick={() => {
                      onSelect(b.name);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-5 py-3.5
                                border-b divider last:border-b-0
                                transition-colors duration-150 text-left
                                ${isSelected
                                  ? "bg-purple-50"
                                  : "hover:bg-slate-50 active:bg-slate-100"}`}
                  >
                    <span
                      className="bank-avatar flex-shrink-0"
                      style={{ background: b.bg, color: b.color }}
                    >
                      {b.label}
                    </span>

                    <span
                      className={`flex-1 text-[14px] ${
                        isSelected
                          ? "text-purple-700 font-semibold"
                          : "text-slate-800 font-medium"
                      }`}
                    >
                      {b.name}
                    </span>

                    {isSelected && (
                      <svg
                        className="w-4 h-4 text-purple-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 取消 */}
          <button
            onClick={onClose}
            className="w-full bg-white rounded-2xl py-4 text-[15px] font-semibold
                       text-slate-700 shadow-2xl active:bg-slate-50 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </>
  );
}