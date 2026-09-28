"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  MODULE_MAP,
  type ModuleZone,
} from "../../../lib/homeModules";
import type { Layout } from "../../../lib/homeStore";

/* ============================================================
   常量
   ============================================================ */
const ZONES: ModuleZone[] = ["tile", "card", "hidden"];

const ZONE_META: Record<
  ModuleZone,
  { title: string; hint: string; icon: string }
> = {
  tile: { title: "首页磁贴区", hint: "横向滑动 · 一屏 2.5 个", icon: "📌" },
  card: { title: "首页主模块", hint: "纵向排列 · 可折叠", icon: "📋" },
  hidden: { title: "已隐藏", hint: "点眼睛恢复到主模块", icon: "👁️" },
};

const LONG_PRESS_MS = 350;
const CANCEL_MOVE_PX = 10;

/* ============================================================
   类型
   ============================================================ */
type DragState = {
  id: string;
  fromZone: ModuleZone;
  fromIndex: number;
  overZone: ModuleZone | null;
  overIndex: number | null;
};

type Props = {
  open: boolean;
  layout: Layout;
  onClose: () => void;
  onMoveWithinZone: (zone: ModuleZone, from: number, to: number) => void;
  onMoveToZone: (id: string, zone: ModuleZone, index?: number) => void;
  onReset: () => void;
};

/* ============================================================
   主组件
   ============================================================ */
export default function HomeDrawer({
  open,
  layout,
  onClose,
  onMoveWithinZone,
  onMoveToZone,
  onReset,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  /* ---------- 关闭时清理 ---------- */
  useEffect(() => {
    if (!open) {
      if (pressTimer.current) clearTimeout(pressTimer.current);
      pressTimer.current = null;
      startPos.current = null;
      dragRef.current = null;
      setDrag(null);
    }
  }, [open]);

  /* ---------- body 滚动锁定 ---------- */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* ---------- ESC 关闭 ---------- */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* ---------- 拖动全局监听 ---------- */
  useEffect(() => {
    if (!drag) return;

    function move(e: PointerEvent) {
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest("[data-module-id]") as HTMLElement | null;
      let overZone: ModuleZone | null = null;
      let overIndex: number | null = null;
      if (card) {
        overZone = card.dataset.zone as ModuleZone;
        overIndex = Number(card.dataset.index);
      }
      const next = {
        ...dragRef.current!,
        overZone,
        overIndex,
      };
      dragRef.current = next;
      setDrag(next);
    }

    function up() {
      const d = dragRef.current;
      if (d && d.overZone != null && d.overIndex != null) {
        const samePlace = d.fromZone === d.overZone && d.fromIndex === d.overIndex;
        if (!samePlace) {
          if (d.fromZone === d.overZone) {
            onMoveWithinZone(d.fromZone, d.fromIndex, d.overIndex);
          } else {
            onMoveToZone(d.id, d.overZone, d.overIndex);
          }
        }
      }
      dragRef.current = null;
      setDrag(null);
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, onMoveWithinZone, onMoveToZone]);

  /* ---------- 长按开始 ---------- */
  function beginLongPress(
    e: ReactPointerEvent,
    id: string,
    zone: ModuleZone,
    index: number
  ) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const x = e.clientX;
    const y = e.clientY;
    startPos.current = { x, y };
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      const state: DragState = {
        id,
        fromZone: zone,
        fromIndex: index,
        overZone: null,
        overIndex: null,
      };
      dragRef.current = state;
      setDrag(state);
      try {
        navigator.vibrate?.(15);
      } catch {}
    }, LONG_PRESS_MS);
  }

  /* ---------- 松手 / 移动取消 ---------- */
  function cancelLongPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    startPos.current = null;
  }

  function moveCancel(e: ReactPointerEvent) {
    if (!startPos.current || !pressTimer.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (dx * dx + dy * dy > CANCEL_MOVE_PX * CANCEL_MOVE_PX) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      startPos.current = null;
    }
  }

  /* ---------- 眼睛：切换显示/隐藏 ---------- */
  function toggleVisible(id: string, fromZone: ModuleZone) {
    if (fromZone === "hidden") {
      onMoveToZone(id, "card");
    } else {
      onMoveToZone(id, "hidden");
    }
  }

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/40 z-[80] animate-fade-in"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* 抽屉 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[90] animate-slide-up"
        style={{ animationDuration: "0.35s" }}
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="bg-white rounded-t-3xl overflow-hidden shadow-2xl
                        flex flex-col"
            style={{ maxHeight: "88vh" }}
          >
            {/* ============ 头部 ============ */}
            <div className="px-5 pt-4 pb-3 border-b divider flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-bold text-slate-900">
                  全部模块
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  长按拖动排序 · 点眼睛显示/隐藏
                </div>
              </div>
              <button
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-full flex-shrink-0 ml-3
                           bg-gradient-to-r from-violet-500 to-purple-600
                           text-white text-[12px] font-semibold
                           shadow-md shadow-purple-500/25
                           active:scale-95 transition-all"
              >
                完成
              </button>
            </div>

            {/* ============ 内容 ============ */}
            <div className="overflow-y-auto flex-1 px-4 py-4">
              {ZONES.map((zone) => (
                <ZoneSection
                  key={zone}
                  zone={zone}
                  ids={layout[zone]}
                  drag={drag}
                  onBeginLongPress={beginLongPress}
                  onCancelLongPress={cancelLongPress}
                  onMoveCancel={moveCancel}
                  onToggleVisible={toggleVisible}
                />
              ))}

              <button
                onClick={() => {
                  if (confirm("恢复默认布局？当前自定义将被清空")) onReset();
                }}
                className="w-full mt-3 py-3 rounded-2xl
                           bg-slate-50 hover:bg-slate-100
                           text-[12px] text-slate-600 font-medium
                           transition-colors"
              >
                恢复默认布局
              </button>

              <div className="h-2" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   分区
   ============================================================ */
function ZoneSection({
  zone,
  ids,
  drag,
  onBeginLongPress,
  onCancelLongPress,
  onMoveCancel,
  onToggleVisible,
}: {
  zone: ModuleZone;
  ids: string[];
  drag: DragState | null;
  onBeginLongPress: (
    e: ReactPointerEvent,
    id: string,
    zone: ModuleZone,
    index: number
  ) => void;
  onCancelLongPress: () => void;
  onMoveCancel: (e: ReactPointerEvent) => void;
  onToggleVisible: (id: string, zone: ModuleZone) => void;
}) {
  const meta = ZONE_META[zone];
  const items = ids.filter((id) => MODULE_MAP[id]);
  const isTileZone = zone === "tile";

  return (
    <div className="mb-5">
      {/* 分区标题 */}
      <div className="flex items-center gap-2 mb-2.5 px-1">
        <span className="text-[13px] leading-none">{meta.icon}</span>
        <span className="text-[13px] font-semibold text-slate-700">
          {meta.title}
        </span>
        <span className="text-[10px] text-slate-400 tabular">
          （{items.length}）
        </span>
        <span className="text-[10px] text-slate-400 ml-auto truncate hidden sm:inline">
          {meta.hint}
        </span>
      </div>

      {/* 空状态 */}
      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-6 text-center">
          <div className="text-[11px] text-slate-300">拖到这里</div>
        </div>
      ) : isTileZone ? (
        /* 磁贴区：横向排列 */
        <div
          className="flex gap-2 overflow-x-auto no-scrollbar pb-1
                     snap-x snap-mandatory"
        >
          {items.map((id, index) => (
            <DrawerCard
              key={id}
              id={id}
              zone={zone}
              index={index}
              drag={drag}
              compact
              onBeginLongPress={onBeginLongPress}
              onCancelLongPress={onCancelLongPress}
              onMoveCancel={onMoveCancel}
              onToggleVisible={onToggleVisible}
            />
          ))}
        </div>
      ) : (
        /* 主模块 / 隐藏：纵向排列 */
        <div className="space-y-2">
          {items.map((id, index) => (
            <DrawerCard
              key={id}
              id={id}
              zone={zone}
              index={index}
              drag={drag}
              onBeginLongPress={onBeginLongPress}
              onCancelLongPress={onCancelLongPress}
              onMoveCancel={onMoveCancel}
              onToggleVisible={onToggleVisible}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   卡片
   ============================================================ */
function DrawerCard({
  id,
  zone,
  index,
  drag,
  compact,
  onBeginLongPress,
  onCancelLongPress,
  onMoveCancel,
  onToggleVisible,
}: {
  id: string;
  zone: ModuleZone;
  index: number;
  drag: DragState | null;
  compact?: boolean;
  onBeginLongPress: (
    e: ReactPointerEvent,
    id: string,
    zone: ModuleZone,
    index: number
  ) => void;
  onCancelLongPress: () => void;
  onMoveCancel: (e: ReactPointerEvent) => void;
  onToggleVisible: (id: string, zone: ModuleZone) => void;
}) {
  const meta = MODULE_MAP[id];
  if (!meta) return null;

  const isDragging = drag?.id === id;
  const isTarget =
    drag != null &&
    drag.overZone === zone &&
    drag.overIndex === index &&
    drag.id !== id;

  const isHidden = zone === "hidden";

  return (
    <div
      data-module-id={id}
      data-zone={zone}
      data-index={index}
      onPointerDown={(e) => onBeginLongPress(e, id, zone, index)}
      onPointerUp={onCancelLongPress}
      onPointerLeave={onCancelLongPress}
      onPointerMove={onMoveCancel}
      className={`relative flex items-center gap-2.5
                  rounded-2xl border border-slate-100 bg-white
                  px-3 py-2.5 select-none
                  transition-all duration-150 ease-out
                  ${compact ? "min-w-[160px] flex-shrink-0 snap-start" : ""}
                  ${isDragging ? "opacity-30 scale-[0.98]" : "opacity-100"}
                  ${isTarget ? "ring-2 ring-purple-400 ring-offset-1" : ""}
                  ${isHidden ? "opacity-60" : "hover:bg-slate-50"}`}
    >
      {/* 图标 */}
      <span className="text-[16px] flex-shrink-0 leading-none">
        {meta.icon}
      </span>

      {/* 文字 */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-slate-900 truncate leading-tight">
          {meta.name}
        </div>
        <div className="text-[10px] text-slate-400 truncate mt-0.5 leading-tight">
          {meta.desc}
        </div>
      </div>

      {/* 眼睛按钮 */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible(id, zone);
        }}
        className={`w-7 h-7 rounded-full flex-shrink-0
                    flex items-center justify-center
                    transition-all active:scale-90
                    ${isHidden
                      ? "bg-purple-50 hover:bg-purple-100"
                      : "bg-slate-50 hover:bg-slate-100"}`}
        aria-label={isHidden ? "显示" : "隐藏"}
      >
        {isHidden ? (
          /* 眼睛闭合 → 点击后显示 */
          <svg
            className="w-3.5 h-3.5 text-purple-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
            />
          </svg>
        ) : (
          /* 眼睛睁开 → 点击后隐藏 */
          <svg
            className="w-3.5 h-3.5 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        )}
      </button>

      {/* 拖动中：显示一个小"握把"提示 */}
      {isDragging && (
        <div
          className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full
                     bg-purple-500 text-white text-[8px] font-bold
                     shadow-md"
        >
          拖动中
        </div>
      )}
    </div>
  );
}