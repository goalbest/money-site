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
    <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
      <Link
        href={backHref}
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
      </Link>
      <div className="flex-1 min-w-0">
        <h1 className="text-[18px] font-bold tracking-tight text-slate-900 truncate">
          {title}
        </h1>
      </div>
      {rightContent && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {rightContent}
        </div>
      )}
    </div>
  );
}