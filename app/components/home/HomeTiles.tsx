"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { MODULE_MAP } from "../../../lib/homeModules";
import type { HomeMetrics } from "../../../lib/homeMetrics";
import type { SnapData } from "../../../lib/useAssetSnapshots";
import { useDragSort } from "./useDragSort";

/* ============================================================
   主题色
   ============================================================ */
const TILE_THEMES: Record<string, { icon_bg: string; icon_color: string }> = {
  assetTrend:      { icon_bg: "#ede9fe", icon_color: "#7c3aed" },
  pending:         { icon_bg: "#ffe4e6", icon_color: "#e11d48" },
  monthStats:      { icon_bg: "#fef3c7", icon_color: "#d97706" },
  monthProfit:     { icon_bg: "#d1fae5", icon_color: "#059669" },
  navStale:        { icon_bg: "#dbeafe", icon_color: "#2563eb" },
  abnormalDrop:    { icon_bg: "#fee2e2", icon_color: "#dc2626" },
  newHigh:         { icon_bg: "#ffe4e6", icon_color: "#e11d48" },
  idleLong:        { icon_bg: "#fef3c7", icon_color: "#d97706" },
  streakWin:       { icon_bg: "#d1fae5", icon_color: "#059669" },
  takeProfit:      { icon_bg: "#ffe4e6", icon_color: "#e11d48" },
  stopLoss:        { icon_bg: "#d1fae5", icon_color: "#059669" },
  concentration:   { icon_bg: "#fef3c7", icon_color: "#d97706" },
  beatDeposit:     { icon_bg: "#d1fae5", icon_color: "#059669" },
  beatInflation:   { icon_bg: "#d1fae5", icon_color: "#059669" },
  bestWorst:       { icon_bg: "#ffe4e6", icon_color: "#e11d48" },
  assetDistribution: { icon_bg: "#ede9fe", icon_color: "#7c3aed" },
  hotSearch:       { icon_bg: "#ffe4e6", icon_color: "#e11d48" },
  goal:            { icon_bg: "#dbeafe", icon_color: "#2563eb" },
  dca:             { icon_bg: "#fef3c7", icon_color: "#d97706" },
  quickAdd:        { icon_bg: "#ede9fe", icon_color: "#7c3aed" },
  quickRefresh:    { icon_bg: "#dbeafe", icon_color: "#2563eb" },
};
const DEFAULT_THEME = { icon_bg: "#f1f3f7", icon_color: "#64748b" };

/* ============================================================
   格式化
   ============================================================ */
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(2)}万`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(2);
}
function fmtPercent(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtDelta(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(2)}万`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${abs.toFixed(2)}`;
}

/* ============================================================
   磁贴内容
   ============================================================ */
type TileContent = { value: string; valueColor?: string; sub: string; unit?: string };

function getTileContent(id: string, m: HomeMetrics, snap: SnapData): TileContent {
  switch (id) {
    case "assetTrend": {
      if (snap.has7d) {
        const p = snap.trend7dPercent;
        return {
          value: fmtDelta(snap.trend7d),
          valueColor: p > 0 ? "text-rose-500" : p < 0 ? "text-emerald-500" : "text-slate-500",
          sub: `近 7 天 ${fmtPercent(p)}`,
        };
      }
      return {
        value: m.totalAssets > 0 ? fmtCompact(m.totalAssets) : "—",
        sub: snap.snapshots.length >= 2 ? `${snap.snapshots.length} 天记录` : "开始记录中",
      };
    }
    case "pending":
      return { value: String(m.pendingCount), valueColor: m.pendingCount > 0 ? "text-rose-500" : undefined, sub: m.pendingCount > 0 ? "条触发" : "全部正常" };
    case "monthStats":
      return { value: m.monthBuyAmount > 0 ? fmtCompact(m.monthBuyAmount) : "—", sub: m.monthBuyAmount > 0 ? "本月买入" : "本月无交易" };
    case "monthProfit": {
      const p = m.monthProfit;
      return { value: fmtCompact(p), valueColor: p > 0 ? "text-rose-500" : p < 0 ? "text-emerald-500" : undefined, sub: "本月累计" };
    }
    case "navStale":
      return { value: String(m.navStaleCount), valueColor: m.navStaleCount > 0 ? "text-amber-500" : undefined, sub: m.navStaleCount > 0 ? "个未更新" : "全部最新" };
    case "abnormalDrop": {
      const n = m.abnormalDrops.length;
      const w = m.abnormalDrops[0];
      return { value: n > 0 && w ? fmtPercent(w.value) : "0", valueColor: n > 0 ? "text-emerald-500" : undefined, sub: n > 0 ? `${n} 个产品` : "无异常" };
    }
    case "newHigh":
      return { value: String(m.newHighs.length), valueColor: m.newHighs.length > 0 ? "text-rose-500" : undefined, sub: m.newHighs.length > 0 ? "创新高" : "暂无" };
    case "idleLong": {
      const n = m.idleLongs.length;
      const l = m.idleLongs[0];
      return { value: n > 0 && l ? String(l.value) : "0", valueColor: n > 0 ? "text-amber-500" : undefined, sub: n > 0 ? "天未加仓" : "都很活跃" };
    }
    case "streakWin": {
      const n = m.streakWins.length;
      const b = m.streakWins[0];
      return { value: n > 0 && b ? String(b.value) : "0", valueColor: n > 0 ? "text-rose-500" : undefined, sub: n > 0 ? "天连涨" : "无连涨" };
    }
    case "takeProfit": {
      const n = m.takeProfits.length;
      const b = m.takeProfits[0];
      return { value: n > 0 && b ? fmtPercent(b.value) : "0", valueColor: n > 0 ? "text-rose-500" : undefined, sub: n > 0 ? `${n} 个可止盈` : "暂无" };
    }
    case "stopLoss": {
      const n = m.stopLosses.length;
      const w = m.stopLosses[0];
      return { value: n > 0 && w ? fmtPercent(w.value) : "0", valueColor: n > 0 ? "text-emerald-500" : undefined, sub: n > 0 ? `${n} 个需止损` : "无风险" };
    }
    case "concentration": {
      const t = m.topBank;
      if (!t) return { value: "—", sub: "无持仓" };
      const warn = t.percent > 50;
      return { value: `${t.percent.toFixed(0)}%`, valueColor: warn ? "text-amber-500" : undefined, sub: warn ? "集中度偏高" : t.bank };
    }
    case "beatDeposit": {
      const { diff, positive } = m.beatDeposit;
      return { value: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`, valueColor: positive ? "text-rose-500" : "text-emerald-500", unit: "%", sub: "vs 定存" };
    }
    case "beatInflation": {
      const { diff, positive } = m.beatInflation;
      return { value: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`, valueColor: positive ? "text-rose-500" : "text-emerald-500", unit: "%", sub: "vs 通胀" };
    }
    case "bestWorst": {
      const b = m.bestProduct;
      if (!b) return { value: "—", sub: "无持仓" };
      return { value: fmtPercent(b.rate), valueColor: "text-rose-500", sub: "最佳产品" };
    }
    case "assetDistribution":
      return { value: String(m.assetDistribution.length), sub: m.assetDistribution.length > 0 ? "家银行" : "无分布" };
    case "hotSearch": return { value: "🔥", sub: "看热搜" };
    case "goal": return { value: "—", sub: "未设目标" };
    case "dca": return { value: "—", sub: "未设定投" };
    case "quickAdd": return { value: "⚡", sub: "快速加仓" };
    case "quickRefresh": return { value: "🔄", sub: "刷新净值" };
    default: return { value: "—", sub: "" };
  }
}

function getTileHref(id: string): string | null {
  const map: Record<string, string> = {
    assetTrend: "/calendar", pending: "/holdings?view=monitor", monthStats: "/transactions",
    monthProfit: "/calendar", navStale: "/holdings", abnormalDrop: "/holdings",
    newHigh: "/holdings", idleLong: "/holdings", streakWin: "/holdings",
    takeProfit: "/holdings", stopLoss: "/holdings", concentration: "/holdings",
    beatDeposit: "/holdings", beatInflation: "/holdings", bestWorst: "/holdings",
    assetDistribution: "/holdings", hotSearch: "/discover?tab=hot",
    quickAdd: "/add", quickRefresh: "/holdings",
  };
  return map[id] || null;
}

/* ============================================================
   磁贴区
   ============================================================ */
type Props = {
  ids: string[];
  metrics: HomeMetrics;
  snap: SnapData;
  editMode: boolean;
  onEnterEditMode: () => void;
  onReorder: (from: number, to: number) => void;
  onHide: (id: string) => void;
};

export default function HomeTiles({
  ids,
  metrics,
  snap,
  editMode,
  onEnterEditMode,
  onReorder,
  onHide,
}: Props) {
  const visible = useMemo(() => ids.filter((id) => MODULE_MAP[id]), [ids]);

  const { draggingIndex, overIndex, startDrag } = useDragSort({
    onReorder,
    enabled: editMode,
    dataKey: "tile-index",
  });

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  function handleTilePointerDown(e: React.PointerEvent, index: number) {
    if (editMode) {
      startDrag(e, index);
      return;
    }
    longPressedRef.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressedRef.current = true;
      onEnterEditMode();
      try { (navigator as any).vibrate?.(15); } catch {}
      pressTimer.current = null;
    }, 500);
  }

  function handleTilePointerUp() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function handleTileClick(e: React.MouseEvent) {
    if (longPressedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressedRef.current = false;
    }
  }

  if (visible.length === 0) {
    return (
      <div className="card p-6 mb-4 text-center">
        <div className="text-slate-300 text-[12px] mb-2">磁贴区是空的</div>
        <div className="text-[10px] text-slate-400">去"管理全部模块"添加</div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div
        className="flex gap-2.5 overflow-x-auto no-scrollbar
                   snap-x snap-mandatory
                   py-1.5 scroll-smooth"
        style={{ scrollbarWidth: "none", touchAction: "pan-y" }}
      >
        {visible.map((id, i) => {
          const meta = MODULE_MAP[id];
          if (!meta) return null;
          const theme = TILE_THEMES[id] || DEFAULT_THEME;
          const content = getTileContent(id, metrics, snap);
          const href = getTileHref(id);
          const valueColor = content.valueColor || "text-slate-900";

          const isDragging = draggingIndex === i;
          const isOver = overIndex === i && draggingIndex !== i && draggingIndex !== null;

          const inner = (
            <div
              data-tile-index={i}
              onPointerDown={(e) => handleTilePointerDown(e, i)}
              onPointerUp={handleTilePointerUp}
              onPointerLeave={handleTilePointerUp}
              onClick={handleTileClick}
              style={{ touchAction: editMode ? "none" : "auto" }}
              className={`relative w-[112px] h-[84px] flex-shrink-0 snap-start
                          rounded-[14px] bg-white
                          flex flex-col justify-between p-2.5
                          transition-all duration-200
                          ${isDragging ? "scale-[0.92] opacity-40" : ""}
                          ${isOver ? "ring-2 ring-purple-400 ring-offset-2 scale-[1.03]" : ""}
                          ${editMode
                            ? "animate-wiggle shadow-md shadow-purple-500/15"
                            : "shadow-[0_1px_2px_rgba(15,23,42,0.03),0_3px_10px_rgba(15,23,42,0.04)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_8px_18px_rgba(15,23,42,0.07)] hover:-translate-y-0.5 active:scale-[0.96]"
                          }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 text-[10px] leading-none"
                  style={{ background: theme.icon_bg, color: theme.icon_color }}
                >
                  {meta.icon}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold truncate">
                  {meta.shortName}
                </span>
              </div>

              <div className="flex items-baseline gap-0.5 min-w-0">
                <span className={`font-mono font-bold text-[17px] tabular leading-none truncate ${valueColor}`}>
                  {content.value}
                </span>
                {content.unit && (
                  <span className={`font-mono font-bold text-[10px] tabular flex-shrink-0 ${valueColor}`}>
                    {content.unit}
                  </span>
                )}
              </div>

              <div className="text-[9px] text-slate-400 truncate leading-none">
                {content.sub}
              </div>

              {editMode && (
                <>
                  <div
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startDrag(e, i);
                    }}
                    onPointerUp={(e) => e.stopPropagation()}
                    style={{ touchAction: "none" }}
                    className="absolute -top-2 right-6 w-6 h-6 rounded-full
                               bg-gradient-to-br from-violet-500 to-purple-600
                               flex items-center justify-center
                               cursor-grab active:cursor-grabbing
                               shadow-md shadow-purple-500/40 border-2 border-white
                               z-30"
                    aria-label="拖动排序"
                    role="button"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
                    </svg>
                  </div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onHide(id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                               flex items-center justify-center
                               bg-rose-50 shadow-sm border border-rose-100
                               active:scale-90 z-30"
                  >
                    <svg className="w-2.5 h-2.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          );

          if (href && !editMode) {
            return (
              <Link key={id} href={href} className="block" draggable={false}>
                <div className="animate-fade-in-up" style={{ animationDelay: `${0.04 * i}s` }}>
                  {inner}
                </div>
              </Link>
            );
          }
          return (
            <div key={id} className="animate-fade-in-up" style={{ animationDelay: `${0.04 * i}s` }}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}