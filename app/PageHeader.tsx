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
    <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 pb-8 rounded-b-3xl shadow-lg">
      <div className="container mx-auto px-4 pt-6 max-w-3xl">
        <div className="flex items-center justify-between mb-1">
          <Link href={backHref} className="text-white/90 hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          {rightContent}
        </div>
        <h1 className="text-white text-xl font-bold mt-1">{title}</h1>
      </div>
    </div>
  );
}