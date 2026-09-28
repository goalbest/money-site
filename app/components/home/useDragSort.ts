"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 通用拖动排序 Hook（触屏 + 鼠标）
 * - 需配合 data-<dataKey>={index} 使用
 * - 编辑模式外不响应
 */
export function useDragSort({
  onReorder,
  enabled,
  dataKey,
}: {
  onReorder: (from: number, to: number) => void;
  enabled: boolean;
  dataKey: string;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragRef = useRef<{ from: number; over: number } | null>(null);

  useEffect(() => {
    if (draggingIndex == null) return;
    const attr = `data-${dataKey}`;

    function move(e: PointerEvent) {
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest(`[${attr}]`) as HTMLElement | null;
      if (!card) return;
      const idx = Number(card.getAttribute(attr));
      if (!isNaN(idx) && dragRef.current) {
        dragRef.current.over = idx;
        setOverIndex(idx);
      }
    }

    function up() {
      const d = dragRef.current;
      if (d && d.from !== d.over) onReorder(d.from, d.over);
      dragRef.current = null;
      setDraggingIndex(null);
      setOverIndex(null);
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [draggingIndex, onReorder, dataKey]);

  const startDrag = useCallback(
    (e: React.PointerEvent, index: number) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragRef.current = { from: index, over: index };
      setDraggingIndex(index);
      setOverIndex(index);
      try { (navigator as any).vibrate?.(8); } catch {}
    },
    [enabled]
  );

  return { draggingIndex, overIndex, startDrag };
}