"use client";

import { useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  onDelete: () => void | Promise<void>;
  deleteLabel?: string;
  buttonWidth?: number;
  disabled?: boolean;
};

export default function SwipeToDelete({
  children,
  onDelete,
  deleteLabel = "删除",
  buttonWidth = 88,
  disabled = false,
}: Props) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  const lockAxisRef = useRef<"none" | "x" | "y">("none");
  const wasDraggedRef = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    draggingRef.current = true;
    lockAxisRef.current = "none";
    wasDraggedRef.current = false;
    startXRef.current = e.clientX;
    startOffsetRef.current = offset;
    setAnimating(false);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const dx = e.clientX - startXRef.current;

    if (lockAxisRef.current === "none") {
      if (Math.abs(dx) < 6) return;
      lockAxisRef.current = "x";
    }
    if (lockAxisRef.current !== "x") return;

    if (Math.abs(dx) > 5) wasDraggedRef.current = true;

    let next = startOffsetRef.current + dx;
    if (next > 0) next = next * 0.3;
    if (next < -buttonWidth * 1.3) next = -buttonWidth * 1.3;

    setOffset(next);
  }

  function finishDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setAnimating(true);
    if (offset < -buttonWidth / 2) {
      setOffset(-buttonWidth);
    } else {
      setOffset(0);
    }
  }

  async function handleDelete() {
    setAnimating(true);
    setOffset(0);
    await onDelete();
  }

  /* ★ 拖动过就拦截点击，避免误触 */
  function onClickCapture(e: React.MouseEvent) {
    if (wasDraggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      wasDraggedRef.current = false;
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute top-0 bottom-0 right-0 flex items-stretch"
        style={{ width: buttonWidth }}
      >
        <button
          type="button"
          onClick={handleDelete}
          className="w-full bg-gradient-to-r from-rose-500 to-rose-600
                     text-white text-[13px] font-semibold
                     flex items-center justify-center
                     active:brightness-95 transition-[filter]"
        >
          {deleteLabel}
        </button>
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onPointerLeave={finishDrag}
        onClickCapture={onClickCapture}
        style={{
          transform: `translateX(${offset}px)`,
          transition: animating ? "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
          touchAction: "pan-y",
        }}
        className="relative bg-white"
      >
        {children}
      </div>
    </div>
  );
}