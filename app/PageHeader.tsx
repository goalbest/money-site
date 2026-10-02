"use client";

import Link from "next/link";

export default function PageHeader({
  title,
  backHref = "/",
  rightContent,
}: {
  title: string;
  backHref?: string;
  rightContent?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-100">
      <div className="container mx-auto px-5 max-w-3xl">
        <div className="h-14 flex items-center justify-between gap-3">
          {/* 左侧：返回按钮 + 标题 */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link
              href={backHref}
              aria-label="返回"
              className="w-9 h-9 rounded-full bg-white border border-slate-200
                         hover:border-slate-300 hover:bg-slate-50
                         flex items-center justify-center flex-shrink-0
                         transition-all duration-300 active:scale-90"
            >
              <svg
                className="w-4 h-4 text-slate-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-[16px] font-bold tracking-tight text-slate-900 truncate">
              {title}
            </h1>
          </div>

          {/* 右侧：自定义内容 */}
          {rightContent && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {rightContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}