"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

  /* ★ 用 ref 存 onReorder，避免它变化时 effect 反复重挂 */
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

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

    /* ★ 先清状态，再通知重排；顺序很关键 */
    function finish() {
      const d = dragRef.current;
      dragRef.current = null;
      setDraggingIndex(null);
      setOverIndex(null);
      if (d && d.from !== d.over) {
        onReorderRef.current(d.from, d.over);
      }
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };
  }, [draggingIndex, dataKey]);   // ★ 去掉 onReorder 依赖

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