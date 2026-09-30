"use client";

import { useMemo, useRef, useState } from "react";
import { useMetricsOrder, type MetricKey } from "../../../lib/useMetricsOrder";

type Period = "today" | "yesterday" | "7d" | "1m" | "3m" | "6m" | "1y";

const PERIODS: { key: Period; label: string; days: number; endOffset: number }[] = [
  { key: "today", label: "今日", days: 1, endOffset: 0 },
  { key: "yesterday", label: "昨日", days: 1, endOffset: 1 },
  { key: "7d", label: "7日", days: 7, endOffset: 0 },
  { key: "1m", label: "近1月", days: 30, endOffset: 0 },
  { key: "3m", label: "近3月", days: 90, endOffset: 0 },
  { key: "6m", label: "近6月", days: 180, endOffset: 0 },
  { key: "1y", label: "近1年", days: 365, endOffset: 0 },
];

function calcChange(navs: number[], days: number, endOffset: number): number | null {
  const endIdx = navs.length - 1 - endOffset;
  if (endIdx < 1) return null;
  const startIdx = Math.max(0, endIdx - days);
  const first = navs[startIdx];
  const last = navs[endIdx];
  if (first <= 0) return null;
  return ((last - first) / first) * 100;
}

function calcAnnualized(navs: number[], days: number, endOffset: number): number | null {
  const endIdx = navs.length - 1 - endOffset;
  if (endIdx < 1) return null;
  const startIdx = Math.max(0, endIdx - days);
  const actualDays = endIdx - startIdx;
  if (actualDays <= 0) return null;
  const first = navs[startIdx];
  const last = navs[endIdx];
  if (first <= 0) return null;
  return ((last - first) / first) * (365 / actualDays) * 100;
}

function calcWanFenSum(navs: number[], days: number, endOffset: number): number | null {
  const endIdx = navs.length - 1 - endOffset;
  if (endIdx < 1) return null;
  const startIdx = Math.max(0, endIdx - days);
  let sum = 0;
  let count = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    if (navs[i - 1] > 0) {
      sum += ((navs[i] - navs[i - 1]) / navs[i - 1]) * 10000;
      count++;
    }
  }
  return count > 0 ? sum : null;
}

function calcZeroDays(navs: number[], days: number, endOffset: number) {
  const endIdx = navs.length - 1 - endOffset;
  if (endIdx < 1) return { zero: 0, total: 0 };
  const startIdx = Math.max(0, endIdx - days);
  let zero = 0;
  let total = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    total++;
    if (navs[i] <= navs[i - 1]) zero++;
  }
  return { zero, total };
}

type ZeroItem = { date: string; diff: number };

function collectZeroDays(navs: number[], dates: string[], days: number, endOffset: number): ZeroItem[] {
  const endIdx = navs.length - 1 - endOffset;
  if (endIdx < 1) return [];
  const startIdx = Math.max(0, endIdx - days);
  const list: ZeroItem[] = [];
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const prev = navs[i - 1];
    const cur = navs[i];
    if (prev <= 0) continue;
    const diff = ((cur - prev) / prev) * 100;
    if (diff <= 0) list.push({ date: dates[i] || "", diff });
  }
  return list.sort((a, b) => a.diff - b.diff);
}

function profitColor(n: number | null): string {
  if (n == null) return "text-slate-400";
  if (n > 0) return "text-rose-500";
  if (n < 0) return "text-emerald-500";
  return "text-slate-500";
}

const LONG_PRESS_MS = 350;

function useHorizontalDrag(onReorder: (from: number, to: number) => void) {
  const [editMode, setEditMode] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef<{ from: number; over: number } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onPointerDownCell(e: React.PointerEvent, idx: number) {
    if (editMode) {
      startDrag(e, idx);
      return;
    }
    if (pressTimer.current) clearTimeout(pressTimer.current);
    const x0 = e.clientX, y0 = e.clientY;
    pressTimer.current = setTimeout(() => {
      setEditMode(true);
      try { (navigator as any).vibrate?.(15); } catch {}
    }, LONG_PRESS_MS);

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (dx * dx + dy * dy > 100) {
        if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
        window.removeEventListener("pointermove", onMove);
      }
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", () => {
      if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
      window.removeEventListener("pointermove", onMove);
    }, { once: true });
  }

  function startDrag(e: React.PointerEvent, idx: number) {
    dragRef.current = { from: idx, over: idx };
    setDraggingIdx(idx);
    setOverIdx(idx);
    try { (navigator as any).vibrate?.(8); } catch {}

    function onMove(ev: PointerEvent) {
      ev.preventDefault();
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = el?.closest("[data-metrics-index]") as HTMLElement | null;
      if (!cell) return;
      const i = Number(cell.getAttribute("data-metrics-index"));
      if (!isNaN(i) && dragRef.current) {
        dragRef.current.over = i;
        setOverIdx(i);
      }
    }
    function onUp() {
      const d = dragRef.current;
      if (d && d.from !== d.over) onReorder(d.from, d.over);
      dragRef.current = null;
      setDraggingIdx(null);
      setOverIdx(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function exit() {
    setEditMode(false);
  }

  return { editMode, draggingIdx, overIdx, onPointerDownCell, exit };
}

export default function MetricsPanel({ navList }: { navList: any[] }) {
  const [period, setPeriod] = useState<Period>("1m");
  const [zeroExpanded, setZeroExpanded] = useState(false);

  const { order, move } = useMetricsOrder();
  const { editMode, draggingIdx, overIdx, onPointerDownCell, exit } = useHorizontalDrag(move);

  const navs = useMemo(
    () => navList.map((n: any) => Number(n.unit_nav)).filter((n) => !isNaN(n)),
    [navList]
  );
  const dates = useMemo(() => navList.map((n: any) => String(n.nav_date)), [navList]);

  const latestNav = navs[navs.length - 1];
  const latestDate = dates[dates.length - 1] || "";
  const cfg = PERIODS.find(p => p.key === period)!;
  const periodLabel = cfg.label;

  const change = calcChange(navs, cfg.days, cfg.endOffset);
  const annualized = calcAnnualized(navs, cfg.days, cfg.endOffset);
  const wanfen = calcWanFenSum(navs, cfg.days, cfg.endOffset);
  const { zero: zeroDays, total: totalDays } = calcZeroDays(navs, cfg.days, cfg.endOffset);

  const zeroRatio = totalDays > 0 ? zeroDays / totalDays : 0;
  const zeroWarn = zeroRatio >= 0.4;
  const zeroCritical = zeroRatio >= 0.7;

  const zeroBg = zeroCritical ? "bg-rose-50/70" : zeroWarn ? "bg-amber-50/70" : "bg-slate-50/80";
  const zeroTextColor = zeroCritical ? "text-rose-600" : zeroWarn ? "text-amber-600" : "text-slate-900";

  const zeroItems = useMemo(
    () => collectZeroDays(navs, dates, cfg.days, cfg.endOffset),
    [navs, dates, cfg.days, cfg.endOffset]
  );

  const negatives = zeroItems.filter(i => i.diff < 0);
  const flats = zeroItems.filter(i => i.diff === 0);
  const worst = zeroItems[0];
  const avg = negatives.length > 0 ? negatives.reduce((s, i) => s + i.diff, 0) / negatives.length : 0;

  function renderCell(key: MetricKey) {
    switch (key) {
      case "nav":
        return (
          <>
            <div className="text-[10px] text-slate-400 mb-1 truncate">净值</div>
            <div className="font-mono font-bold text-[12px] text-slate-900 tabular leading-none truncate">
              {latestNav != null ? latestNav.toFixed(4) : "—"}
            </div>
            <div className="text-[9px] text-slate-400 mt-1.5 tabular truncate">
              {latestDate ? latestDate.slice(5) : "—"}
            </div>
          </>
        );
      case "change":
        return (
          <>
            <div className="text-[10px] text-slate-400 mb-1 truncate">涨跌</div>
            <div className={`font-mono font-bold text-[12px] tabular leading-none truncate ${profitColor(change)}`}>
              {change == null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
            </div>
            <div className="text-[9px] text-slate-400 mt-1.5 truncate">{periodLabel}</div>
          </>
        );
      case "annualized":
        return (
          <>
            <div className="text-[10px] text-rose-400 mb-1 truncate">年化</div>
            <div className={`font-mono font-bold text-[12px] tabular leading-none truncate ${profitColor(annualized)}`}>
              {annualized == null ? "—" : `${annualized >= 0 ? "+" : ""}${annualized.toFixed(2)}%`}
            </div>
            <div className="text-[9px] text-rose-400/80 mt-1.5 truncate">{periodLabel}</div>
          </>
        );
      case "wanfen":
        return (
          <>
            <div className="text-[10px] text-blue-400 mb-1 truncate">万份</div>
            <div className="font-mono font-bold text-[12px] text-blue-600 tabular leading-none truncate">
              {wanfen == null ? "—" : wanfen.toFixed(2)}
            </div>
            <div className="text-[9px] text-blue-400/80 mt-1.5 truncate">{periodLabel}</div>
          </>
        );
      case "zero":
        return (
          <>
            <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-0.5 truncate">
              <span>挂0</span>
              {zeroWarn && (
                <svg
                  className={`w-2.5 h-2.5 flex-shrink-0 ${zeroCritical ? "text-rose-500" : "text-amber-500"}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0L3.16 16.25A2 2 0 005 19z" />
                </svg>
              )}
            </div>
            <div className={`font-mono font-bold text-[12px] tabular leading-none truncate ${zeroTextColor}`}>
              {totalDays > 0 ? `${zeroDays}/${totalDays}` : "—"}
            </div>
            <div className="text-[9px] text-slate-400 mt-1.5 truncate">
              {totalDays > 0 ? `${(zeroRatio * 100).toFixed(0)}%` : periodLabel}
            </div>
          </>
        );
    }
  }

  function cellBg(key: MetricKey): string {
    if (key === "annualized") return "bg-rose-50/60";
    if (key === "wanfen") return "bg-blue-50/60";
    if (key === "zero") return zeroBg;
    return "bg-slate-50/80";
  }

  return (
    <div>
      {/* ★ 标题 + 周期切换（加 relative z-[3] 盖过热区） */}
      <div className="flex items-center gap-2 mb-3 relative z-[3]">
        <div className="text-[15px] font-bold text-slate-900 flex-shrink-0">
          关键指标
        </div>

        {editMode ? (
          <div className="flex-1 flex items-center justify-between">
            <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full font-medium">
              拖动 / 点箭头排序
            </span>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); exit(); }}
              className="px-2.5 py-1 rounded-full
                         bg-gradient-to-r from-violet-500 to-purple-600
                         text-white text-[10px] font-semibold
                         shadow-sm shadow-purple-500/25 active:scale-95"
            >
              完成
            </button>
          </div>
        ) : (
          <div className="flex gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
            {PERIODS.map(p => (
              <button
                key={p.key}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => { e.stopPropagation(); setPeriod(p.key); }}
                onClick={(e) => { e.stopPropagation(); setPeriod(p.key); }}
                style={{ touchAction: "manipulation" }}
                className={`px-2 py-1 rounded-full text-[10px] font-medium flex-shrink-0
                            transition-all active:scale-95
                            ${period === p.key
                              ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm shadow-purple-500/25"
                              : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ★ 3+2 布局：第一行 3 格，第二行 2 格 */}
      {(() => {
        const topRow = order.slice(0, 3);
        const bottomRow = order.slice(3);

        const renderGrid = (keys: MetricKey[], startIdx: number) => (
          <div className="flex gap-1.5">
            {keys.map((key, localIdx) => {
              const idx = startIdx + localIdx;
              const isDragging = draggingIdx === idx;
              const isOver = overIdx === idx && draggingIdx !== idx && draggingIdx !== null;
              const canLeft = idx > 0;
              const canRight = idx < order.length - 1;
              return (
                <div
                  key={key}
                  data-metrics-index={idx}
                  onPointerDown={(e) => onPointerDownCell(e, idx)}
                  style={{ touchAction: editMode ? "none" : "auto" }}
                  className={`relative flex-1 min-w-0 p-2.5 rounded-xl select-none
                              transition-all duration-200
                              ${cellBg(key)}
                              ${isDragging ? "opacity-40 scale-95" : ""}
                              ${isOver ? "ring-2 ring-purple-400 ring-offset-1 scale-[1.05]" : ""}
                              ${editMode ? "animate-wiggle" : ""}`}
                >
                  {renderCell(key)}

                  {editMode && (
                    <div className="absolute -top-6 left-0 right-0 flex justify-between">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canLeft) move(idx, idx - 1);
                        }}
                        disabled={!canLeft}
                        className={`w-5 h-5 rounded-full flex items-center justify-center
                                    shadow-sm transition-all active:scale-90
                                    ${canLeft
                                      ? "bg-white border border-slate-200"
                                      : "bg-slate-100 opacity-40"}`}
                      >
                        <svg className="w-2.5 h-2.5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canRight) move(idx, idx + 1);
                        }}
                        disabled={!canRight}
                        className={`w-5 h-5 rounded-full flex items-center justify-center
                                    shadow-sm transition-all active:scale-90
                                    ${canRight
                                      ? "bg-white border border-slate-200"
                                      : "bg-slate-100 opacity-40"}`}
                      >
                        <svg className="w-2.5 h-2.5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

        return (
          <div className={`relative z-[3] space-y-1.5 ${editMode ? "pt-6" : ""}`}>
            {renderGrid(topRow, 0)}
            {renderGrid(bottomRow, 3)}
          </div>
        );
      })()}

      {/* 挂0 展开按钮 */}
      {!editMode && zeroDays > 0 && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setZeroExpanded(v => !v); }}
          className="w-full mt-2 py-1.5 rounded-lg
                     flex items-center justify-center gap-1
                     text-[11px] text-slate-500 font-medium
                     hover:bg-slate-50 active:scale-[0.99]
                     transition-all relative z-[3]"
        >
          {zeroExpanded ? "收起挂0明细" : `查看 ${zeroDays} 天挂0明细`}
          <svg
            className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
              zeroExpanded ? "rotate-180" : ""
            }`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* 挂0 展开区 */}
      {!editMode && zeroExpanded && zeroDays > 0 && (
        <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/50 overflow-hidden animate-fade-in relative z-[3]">
          <div className="grid grid-cols-4 divide-x divide-slate-100 border-b divider">
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-slate-400 mb-0.5">持平</div>
              <div className="font-mono font-semibold text-[12px] text-slate-500 tabular">
                {flats.length} 天
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-slate-400 mb-0.5">下跌</div>
              <div className="font-mono font-semibold text-[12px] text-emerald-500 tabular">
                {negatives.length} 天
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-slate-400 mb-0.5">平均跌幅</div>
              <div className="font-mono font-semibold text-[12px] text-emerald-500 tabular">
                {negatives.length > 0 ? `${avg.toFixed(2)}%` : "0.00%"}
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-slate-400 mb-0.5">最大跌幅</div>
              <div className="font-mono font-semibold text-[12px] text-emerald-500 tabular">
                {worst ? `${worst.diff.toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>

          <div className="max-h-[200px] overflow-y-auto no-scrollbar">
            {zeroItems.map((it, idx) => (
              <div
                key={it.date + idx}
                className="flex items-center justify-between px-3 py-2
                           border-b divider last:border-b-0"
              >
                <span className="text-[11px] text-slate-500 tabular">{it.date}</span>
                <span className={`font-mono font-semibold text-[12px] tabular ${
                  it.diff < 0 ? "text-emerald-500" : "text-slate-400"
                }`}>
                  {it.diff >= 0 ? "+" : ""}{it.diff.toFixed(3)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}