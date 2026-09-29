"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  visibleCount?: number;
  itemHeight?: number;
  initialCount?: number;
  pageSize?: number;
  empty?: ReactNode;
};

export default function ScrollableList<T>({
  items,
  renderItem,
  visibleCount = 5,
  itemHeight = 56,
  initialCount = 20,
  pageSize = 20,
  empty,
}: Props<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayedCount, setDisplayedCount] = useState(initialCount);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const maxHeight = visibleCount * itemHeight;
  const visible = items.slice(0, displayedCount);
  const hasMore = displayedCount < items.length;

  function updateLayout() {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const scrollable = scrollHeight > clientHeight + 4;

    setShowBar(scrollable);
    if (scrollable) {
      const trackH = clientHeight;
      const thumbH = Math.max(24, (clientHeight / scrollHeight) * trackH);
      const maxThumbTop = trackH - thumbH;
      const ratio = scrollTop / Math.max(1, scrollHeight - clientHeight);
      setThumbHeight(thumbH);
      setThumbTop(ratio * maxThumbTop);
    }

    const remain = scrollHeight - scrollTop - clientHeight;
    setShowBottomFade(remain > 8);
  }

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    updateLayout();

    const remain = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remain < 80 && hasMore) {
      setDisplayedCount(c => Math.min(items.length, c + pageSize));
    }
  }

  useEffect(() => {
    setDisplayedCount(initialCount);
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (el) el.scrollTop = 0;
      updateLayout();
    });
  }, [items.length, initialCount]);

  useEffect(() => {
    updateLayout();
  }, [displayedCount, visible.length]);

  useEffect(() => {
    const onResize = () => updateLayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (items.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto no-scrollbar"
        style={{ maxHeight, WebkitOverflowScrolling: "touch" }}
      >
        {visible.map((item, idx) => renderItem(item, idx))}

        {hasMore && (
          <div className="py-3 text-center text-[10px] text-slate-300">
            上滑加载更多 · 已显示 {displayedCount}/{items.length}
          </div>
        )}
      </div>

      {showBottomFade && (
        <div
          className="absolute left-0 right-0 bottom-0 pointer-events-none"
          style={{
            height: 24,
            background: "linear-gradient(to bottom, rgba(255,255,255,0), #ffffff)",
          }}
        />
      )}

      {showBar && (
        <div
          className="absolute pointer-events-none"
          style={{ top: 6, bottom: 6, right: 2, width: 3 }}
        >
          <div
            className="absolute rounded-full bg-slate-300/60"
            style={{
              top: thumbTop,
              height: thumbHeight,
              width: 3,
              transition: "top 0.05s linear, height 0.15s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}