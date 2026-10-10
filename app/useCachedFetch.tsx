"use client";

import { useState, useEffect } from "react";

/**
 * 通用数据缓存 hook
 * @param key 缓存 key（不同页面用不同 key）
 * @param fetcher 数据获取函数，返回 Promise
 * @param ttlMs 缓存有效期，默认 5 分钟
 */
export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 5 * 60 * 1000
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // 1. 先读缓存
      try {
        const raw = localStorage.getItem(`cache_${key}`);
        if (raw) {
          const cached = JSON.parse(raw);
          if (Date.now() - cached.t < ttlMs) {
            if (!cancelled) {
              setData(cached.v);
              setLoading(false);
            }
          }
        }
      } catch {}

      // 2. 后台刷新数据
      try {
        const result = await fetcher();
        if (cancelled) return;
        setData(result);
        setLoading(false);
        try {
          localStorage.setItem(`cache_${key}`, JSON.stringify({ t: Date.now(), v: result }));
        } catch {}
      } catch (e) {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [key]);

  return { data, loading };
}

/**
 * 骨架屏组件（各种页面通用）
 */
export function SkeletonCard({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mb-3 last:mb-0">
          <div className="h-4 bg-gray-100 rounded animate-pulse mb-2 w-2/3" />
          <div className="h-3 bg-gray-50 rounded animate-pulse w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage({ title = "" }: { title?: string } = {}) {
  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        {/* 头部骨架（对应 PageHeader） */}
        <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
          <div className="w-9 h-9 rounded-full bg-white border border-slate-200
                          flex items-center justify-center flex-shrink-0">
            <div className="w-3 h-3 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            {title ? (
              <h1 className="text-[18px] font-bold tracking-tight text-slate-900 truncate">
                {title}
              </h1>
            ) : (
              <div className="h-5 w-24 bg-slate-200/60 rounded animate-pulse" />
            )}
          </div>
        </div>

        {/* Hero 骨架（紫粉渐变） */}
        <div
          className="rounded-[24px] h-40 mb-5 animate-pulse"
          style={{
            background:
              "linear-gradient(135deg, #6366f1 0%, #a855f7 55%, #ec4899 100%)",
            opacity: 0.25,
          }}
        />

        {/* 列表骨架 */}
        <div className="space-y-3">
          <SkeletonCard rows={2} />
          <SkeletonCard rows={3} />
        </div>
      </div>
    </div>
  );
}