"use client";

const PAGE_SIZE = 20;

export default function Pagination({ page, setPage, total }: { page: number; setPage: (p: number | ((prev: number) => number)) => void; total: number }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 mb-2 bg-white/80 backdrop-blur rounded-xl p-2 border border-slate-100 shadow-sm">
      <button onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:text-purple-600 disabled:opacity-30 bg-slate-50 rounded-lg transition-all">上一页</button>
      <span className="text-[12px] text-slate-500 font-mono">第 <span className="text-purple-600 font-bold">{page}</span> / {totalPages} 页</span>
      <button onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:text-purple-600 disabled:opacity-30 bg-slate-50 rounded-lg transition-all">下一页</button>
    </div>
  );
}