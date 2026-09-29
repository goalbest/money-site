"use client";

import { useMemo, useRef, useState } from "react";

type Props = {
  data: { nav_date: string; unit_nav: number | string; accum_nav?: any }[];
  /** 开启点击/触摸查看某点数值 */
  interactive?: boolean;
  height?: number;
};

export default function NavChart({ data, interactive = false, height = 200 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const w = 600;
  const h = height;
  const padX = 8;
  const padY = 20;

  const points = useMemo(
    () =>
      data.map((d, i) => ({
        i,
        date: String(d.nav_date),
        nav: Number(d.unit_nav),
      })),
    [data]
  );

  const { linePath, areaPath, coords, min, max, positive } = useMemo(() => {
    if (points.length < 2) {
      return { linePath: "", areaPath: "", coords: [], min: 0, max: 0, positive: true };
    }
    const navs = points.map(p => p.nav);
    const min = Math.min(...navs);
    const max = Math.max(...navs);
    const range = max - min || 1;
    const stepX = (w - padX * 2) / (points.length - 1);
    const coords = points.map((p, i) => ({
      x: padX + i * stepX,
      y: h - padY - ((p.nav - min) / range) * (h - padY * 2),
    }));
    const linePath = coords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(" ");
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${h} L ${coords[0].x.toFixed(2)} ${h} Z`;
    const positive = navs[navs.length - 1] >= navs[0];
    return { linePath, areaPath, coords, min, max, positive };
  }, [points, h]);

  if (points.length < 2) {
    return (
      <div className="py-16 text-center text-slate-300 text-xs">
        数据不足
      </div>
    );
  }

  const stroke = positive ? "#f43f5e" : "#10b981";

  function locate(clientX: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * w;
    let nearest = 0;
    let minDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - relX);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    });
    setActiveIdx(nearest);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    locate(e.clientX);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!interactive) return;
    if (e.pressure > 0 || e.pointerType === "mouse") locate(e.clientX);
  }
  function onPointerLeave() {
    if (!interactive) return;
    setActiveIdx(null);
  }

  const active = activeIdx != null ? points[activeIdx] : null;
  const activeCoord = activeIdx != null ? coords[activeIdx] : null;

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{ touchAction: interactive ? "pan-y" : "auto" }}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: h }}
      >
        <defs>
          <linearGradient id={`navGrad-${positive ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 网格线 */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={padY + (h - padY * 2) * t}
            y2={padY + (h - padY * 2) * t}
            stroke="#f1f3f7"
            strokeWidth="1"
          />
        ))}

        <path d={areaPath} fill={`url(#navGrad-${positive ? "up" : "down"})`} />
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* 激活点的垂直指示线 */}
        {activeCoord && (
          <>
            <line
              x1={activeCoord.x}
              x2={activeCoord.x}
              y1={padY}
              y2={h - padY}
              stroke={stroke}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.5"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="4"
              fill={stroke}
              stroke="#ffffff"
              strokeWidth="2"
            />
          </>
        )}

        {/* 末点圆点（未激活时显示） */}
        {!activeCoord && (
          <circle
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r="3"
            fill={stroke}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
        )}
      </svg>

      {/* 悬浮数值气泡 */}
      {active && (
        <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none">
          <div className="px-3 py-1.5 rounded-full bg-slate-900/90 backdrop-blur
                          text-white text-[11px] tabular flex items-center gap-2
                          shadow-lg animate-fade-in"
               style={{ animationDuration: "0.15s" }}>
            <span className="text-white/70">{active.date}</span>
            <span className="font-mono font-bold">{active.nav.toFixed(4)}</span>
          </div>
        </div>
      )}
    </div>
  );
}