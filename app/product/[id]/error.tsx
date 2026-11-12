// app/product/[id]/error.tsx
"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 bg-slate-50">
      <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-4 text-2xl">!</div>
      <h2 className="text-[17px] font-bold text-slate-900 mb-2">页面加载失败</h2>
      <p className="text-[13px] text-slate-500 mb-6 text-center max-w-sm bg-white p-3 rounded-lg border border-slate-100">
        {error.message || "发生了未知错误"}
      </p>
      <button 
        onClick={() => reset()} 
        className="px-6 py-2.5 bg-purple-600 text-white rounded-full text-sm font-medium active:scale-95 transition-all"
      >
        重新加载
      </button>
    </div>
  );
}