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

export function SkeletonPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 pb-8 rounded-b-3xl">
        <div className="container mx-auto px-4 pt-6 max-w-3xl">
          <div className="h-6 w-6 bg-white/20 rounded animate-pulse mb-4" />
          <div className="h-6 w-32 bg-white/20 rounded animate-pulse" />
        </div>
      </div>
      <div className="container mx-auto px-4 -mt-4 max-w-3xl space-y-3">
        <SkeletonCard rows={3} />
        <SkeletonCard rows={5} />
      </div>
    </div>
  );
}