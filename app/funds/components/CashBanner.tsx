"use client";

export default function CashBanner({ amount, onEdit }: { amount: number, onEdit: () => void }) {
  return (
    <div 
      onClick={onEdit}
      className="flex flex-col items-center justify-center bg-white/90 backdrop-blur-md border border-white/60 shadow-sm px-3 rounded-2xl cursor-pointer active:scale-95 transition-all flex-shrink-0 h-full min-h-[42px]"
    >
      <span className="text-[9px] text-slate-500 font-medium leading-tight mb-0.5">可用</span>
      <span className="font-mono font-bold text-[13px] text-slate-900 leading-tight">
        {amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}