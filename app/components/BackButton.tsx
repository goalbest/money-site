"use client";

import { useRouter } from "next/navigation";

type Props = {
  fallback?: string;  // 没有历史记录时的兜底跳转，默认回首页
};

export default function BackButton({ fallback = "/" }: Props) {
  const router = useRouter();

  function handleClick() {
    if (typeof window !== "undefined" && window.history.length > 2) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button
      onClick={handleClick}
      aria-label="返回"
      className="w-9 h-9 rounded-full bg-white border border-slate-200
                 hover:border-slate-300 hover:bg-slate-50
                 flex items-center justify-center flex-shrink-0
                 transition-all duration-300 active:scale-90"
    >
      <svg
        className="w-4 h-4 text-slate-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}