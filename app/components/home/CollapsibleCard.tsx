"use client";

import {
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

type Props = {
  /** 唯一 id，用于 localStorage 记忆折叠状态 */
  id: string;
  title: string;
  icon?: string;
  count?: number | string;
  /** 头部右侧的额外内容（如"查看全部"链接），不会触发折叠 */
  extra?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  collapsible?: boolean;
};

const STORAGE_PREFIX = "home_collapsed_v1_";
const ANIM_MS = 320;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

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
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hydrated, setHydrated] = useState(false);

  // 首帧同步读取 localStorage，避免闪烁
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

  // 未 hydrate 前不启用动画（避免首帧闪动）
  const anim = hydrated && collapsible;

  return (
    <div className={`card overflow-hidden ${className}`}>
      {/* ============ 头部 ============ */}
      <div
        className={`flex items-center justify-between gap-2
                    px-5 pt-4 pb-3 ${headerClassName}`}
      >
        {/* 左：标题区（点击折叠） */}
        <button
          type="button"
          onClick={toggle}
          disabled={!collapsible}
          className="flex items-center gap-2 flex-1 min-w-0 text-left
                     disabled:cursor-default"
          aria-expanded={!collapsed}
          aria-controls={`card-body-${id}`}
        >
          {icon && (
            <span className="text-[15px] flex-shrink-0 leading-none">{icon}</span>
          )}
          <span className="text-[15px] font-bold text-slate-900 truncate">
            {title}
          </span>
          {count != null && count !== "" && (
            <span className="text-[11px] text-slate-400 tabular flex-shrink-0">
              {count}
            </span>
          )}
        </button>

        {/* 右：额外内容 + 折叠箭头 */}
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
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  collapsed ? "" : "rotate-180"
                }`}
                style={{
                  transitionDuration: anim ? `${ANIM_MS}ms` : "0ms",
                  transitionTimingFunction: EASE,
                }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ============ 折叠内容区（grid-template-rows 动画） ============ */}
      <div
        id={`card-body-${id}`}
        className="grid"
        style={{
          gridTemplateRows: collapsed ? "0fr" : "1fr",
          transition: anim
            ? `grid-template-rows ${ANIM_MS}ms ${EASE}`
            : "none",
        }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="will-change-[transform,opacity]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}