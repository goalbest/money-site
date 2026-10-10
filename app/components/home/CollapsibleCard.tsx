"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Props = {
  id: string;
  title: string;
  icon?: string;
  count?: number | string;
  extra?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  collapsible?: boolean;
  /** 标题长按 500ms 触发（用于进入编辑模式） */
  onTitleLongPress?: () => void;
};

const STORAGE_PREFIX = "home_collapsed_v1_";
const ANIM_MS = 320;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const LONG_PRESS_MS = 500;

function readCollapsed(id: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {}
  return fallback;
}

function writeCollapsed(id: string, val: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + id, val ? "1" : "0");
  } catch {}
}

export default function CollapsibleCard({
  id,
  title,
  icon,
  count,
  extra,
  defaultCollapsed = false,
  children,
  className = "",
  headerClassName = "",
  collapsible = true,
  onTitleLongPress,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hydrated, setHydrated] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  useLayoutEffect(() => {
    setCollapsed(readCollapsed(id, defaultCollapsed));
    setHydrated(true);
  }, [id, defaultCollapsed]);

  function toggle() {
    if (!collapsible) return;
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(id, next);
  }

  function handleTitleClick(e: React.MouseEvent) {
    if (longPressedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressedRef.current = false;
      return;
    }
    toggle();
  }

  function handleTitlePointerDown(e: React.PointerEvent) {
    if (!onTitleLongPress) return;
    longPressedRef.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);

    const x0 = e.clientX;
    const y0 = e.clientY;

    pressTimer.current = setTimeout(() => {
      longPressedRef.current = true;
      onTitleLongPress();
      try { (navigator as any).vibrate?.(15); } catch {}
      pressTimer.current = null;
    }, LONG_PRESS_MS);

    /* ★ 用位移判断，不用 onPointerLeave（手指微动不取消） */
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (dx * dx + dy * dy > 100) {
        if (pressTimer.current) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
        }
        window.removeEventListener("pointermove", onMove);
      }
    }
    function onUp() {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { once: true });
  }

  const anim = hydrated && collapsible;

  return (
    <div className={`card overflow-hidden ${className}`}>
      <div
        className={`flex items-center justify-between gap-2 px-5 pt-4 pb-3 ${headerClassName}`}
      >
        <button
          type="button"
          onClick={handleTitleClick}
          onPointerDown={(e) => handleTitlePointerDown(e)}
          disabled={!collapsible}
          className="flex items-center gap-2 flex-1 min-w-0 text-left disabled:cursor-default select-none"
          aria-expanded={!collapsed}
          aria-controls={`card-body-${id}`}
        >
          {icon && <span className="text-[15px] flex-shrink-0 leading-none">{icon}</span>}
          <span className="text-[15px] font-bold text-slate-900 truncate">{title}</span>
          {count != null && count !== "" && (
            <span className="text-[11px] text-slate-400 tabular flex-shrink-0">{count}</span>
          )}
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          {extra}
          {collapsible && (
            <button
              type="button"
              onClick={toggle}
              className="w-6 h-6 rounded-full hover:bg-slate-100
                         flex items-center justify-center
                         transition-colors active:scale-90"
              aria-label={collapsed ? "展开" : "收起"}
            >
              <svg
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
                style={{
                  transitionDuration: anim ? `${ANIM_MS}ms` : "0ms",
                  transitionTimingFunction: EASE,
                }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        id={`card-body-${id}`}
        className="grid"
        style={{
          gridTemplateRows: collapsed ? "0fr" : "1fr",
          transition: anim ? `grid-template-rows ${ANIM_MS}ms ${EASE}` : "none",
        }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="will-change-[transform,opacity]">{children}</div>
        </div>
      </div>
    </div>
  );
}