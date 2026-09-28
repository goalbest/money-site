"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MODULE_MAP } from "../../../lib/homeModules";
import type { HomeMetrics } from "../../../lib/homeMetrics";

/* ============================================================
   磁贴尺寸常量
   ============================================================ */
const TILE_W = "min-w-[136px]";
const TILE_H = "h-[108px]";

/* ============================================================
   数值格式化
   ============================================================ */
function fmtAmount(n: number, opts?: { sign?: boolean; digits?: number }): string {
  const { sign = false, digits = 2 } = opts || {};
  const abs = Math.abs(n);
  const str = abs.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (sign && n > 0) return `+${str}`;
  if (n < 0) return `-${str}`;
  return str;
}

function fmtPercent(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(2)}万`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(2);
}

/* ============================================================
   磁贴内容定义
   ============================================================ */
type TileContent = {
  value: string;
  valueColor?: string;
  sub: string;
  /** 数值后的小单位 */
  unit?: string;
};

function getTileContent(id: string, m: HomeMetrics): TileContent {
  switch (id) {
    case "assetTrend": {
      const total = m.totalAssets;
      return {
        value: total > 0 ? fmtCompact(total) : "—",
        sub: "近 30 天",
      };
    }

    case "pending": {
      const n = m.pendingCount;
      return {
        value: String(n),
        valueColor: n > 0 ? "text-rose-500" : "text-slate-700",
        sub: n > 0 ? "条触发" : "全部正常",
      };
    }

    case "monthStats": {
      const buy = m.monthBuyAmount;
      return {
        value: buy > 0 ? fmtCompact(buy) : "—",
        sub: buy > 0 ? "本月买入" : "本月无交易",
      };
    }

    case "monthProfit": {
      const p = m.monthProfit;
      return {
        value: fmtCompact(p),
        valueColor: p > 0 ? "text-rose-500" : p < 0 ? "text-emerald-500" : "text-slate-700",
        sub: "本月累计",
      };
    }

    case "navStale": {
      const n = m.navStaleCount;
      return {
        value: String(n),
        valueColor: n > 0 ? "text-amber-500" : "text-slate-700",
        sub: n > 0 ? "个未更新" : "全部最新",
      };
    }

    case "abnormalDrop": {
      const n = m.abnormalDrops.length;
      const worst = m.abnormalDrops[0];
      return {
        value: n > 0 && worst ? fmtPercent(worst.value) : "0",
        valueColor: n > 0 ? "text-emerald-500" : "text-slate-700",
        sub: n > 0 ? `${n} 个产品` : "无异常",
      };
    }

    case "newHigh": {
      const n = m.newHighs.length;
      return {
        value: String(n),
        valueColor: n > 0 ? "text-rose-500" : "text-slate-700",
        sub: n > 0 ? "创新高" : "暂无",
      };
    }

    case "idleLong": {
      const n = m.idleLongs.length;
      const longest = m.idleLongs[0];
      return {
        value: n > 0 && longest ? String(longest.value) : "0",
        valueColor: n > 0 ? "text-amber-500" : "text-slate-700",
        sub: n > 0 ? `天未加仓` : "都很活跃",
      };
    }

    case "streakWin": {
      const n = m.streakWins.length;
      const best = m.streakWins[0];
      return {
        value: n > 0 && best ? String(best.value) : "0",
        valueColor: n > 0 ? "text-rose-500" : "text-slate-700",
        sub: n > 0 ? `天连涨` : "无连涨",
      };
    }

    case "takeProfit": {
      const n = m.takeProfits.length;
      const best = m.takeProfits[0];
      return {
        value: n > 0 && best ? fmtPercent(best.value) : "0",
        valueColor: n > 0 ? "text-rose-500" : "text-slate-700",
        sub: n > 0 ? `${n} 个可止盈` : "暂无",
      };
    }

    case "stopLoss": {
      const n = m.stopLosses.length;
      const worst = m.stopLosses[0];
      return {
        value: n > 0 && worst ? fmtPercent(worst.value) : "0",
        valueColor: n > 0 ? "text-emerald-500" : "text-slate-700",
        sub: n > 0 ? `${n} 个需止损` : "无风险",
      };
    }

    case "concentration": {
      const top = m.topBank;
      if (!top) return { value: "—", sub: "无持仓" };
      const warn = top.percent > 50;
      return {
        value: `${top.percent.toFixed(0)}%`,
        valueColor: warn ? "text-amber-500" : "text-slate-700",
        sub: warn ? "集中度偏高" : top.bank,
      };
    }

    case "beatDeposit": {
      const { diff, positive } = m.beatDeposit;
      return {
        value: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`,
        valueColor: positive ? "text-rose-500" : "text-emerald-500",
        unit: "%",
        sub: `vs 定存`,
      };
    }

    case "beatInflation": {
      const { diff, positive } = m.beatInflation;
      return {
        value: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`,
        valueColor: positive ? "text-rose-500" : "text-emerald-500",
        unit: "%",
        sub: `vs 通胀`,
      };
    }

    case "bestWorst": {
      const best = m.bestProduct;
      if (!best) return { value: "—", sub: "无持仓" };
      return {
        value: fmtPercent(best.rate),
        valueColor: "text-rose-500",
        sub: "最佳产品",
      };
    }

    case "assetDistribution": {
      const n = m.assetDistribution.length;
      return {
        value: String(n),
        sub: n > 0 ? "家银行" : "无分布",
      };
    }

    case "hotSearch": {
      return {
        value: "🔥",
        sub: "看热搜",
      };
    }

    case "goal": {
      return {
        value: "—",
        sub: "未设目标",
      };
    }

    case "dca": {
      return {
        value: "—",
        sub: "未设定投",
      };
    }

    case "quickAdd": {
      return {
        value: "⚡",
        sub: "快速加仓",
      };
    }

    case "quickRefresh": {
      return {
        value: "🔄",
        sub: "刷新净值",
      };
    }

    default:
      return { value: "—", sub: "" };
  }
}

/* ============================================================
   磁贴点击目标
   ============================================================ */
function getTileHref(id: string): string | null {
  switch (id) {
    case "assetTrend": return "/calendar";
    case "pending": return "/holdings?view=monitor";
    case "monthStats": return "/transactions";
    case "monthProfit": return "/calendar";
    case "navStale": return "/holdings";
    case "abnormalDrop": return "/holdings";
    case "newHigh": return "/holdings";
    case "idleLong": return "/holdings";
    case "streakWin": return "/holdings";
    case "takeProfit": return "/holdings";
    case "stopLoss": return "/holdings";
    case "concentration": return "/holdings";
    case "beatDeposit": return "/holdings";
    case "beatInflation": return "/holdings";
    case "bestWorst": return "/holdings";
    case "assetDistribution": return "/holdings";
    case "hotSearch": return "/discover?tab=hot";
    case "quickAdd": return "/add";
    case "quickRefresh": return "/holdings";
    default: return null;
  }
}

/* ============================================================
   单个磁贴
   ============================================================ */
function Tile({
  id,
  metrics,
}: {
  id: string;
  metrics: HomeMetrics;
}) {
  const meta = MODULE_MAP[id];
  if (!meta) return null;

  const content = getTileContent(id, metrics);
  const href = getTileHref(id);
  const valueColor = content.valueColor || "text-slate-900";

  const inner = (
    <div
      className={`${TILE_W} ${TILE_H} snap-start flex-shrink-0
                  card p-3.5 flex flex-col justify-between
                  active:scale-[0.97] transition-transform duration-150
                  cursor-pointer select-none`}
    >
      {/* 顶部：图标 + 短名 */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13px] leading-none flex-shrink-0">{meta.icon}</span>
          <span className="text-[11px] text-slate-500 font-medium truncate">
            {meta.shortName}
          </span>
        </div>
        {href && (
          <svg
            className="w-3 h-3 text-slate-300 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>

      {/* 中间：主数值 */}
      <div className="flex items-baseline gap-0.5 min-w-0">
        <span
          className={`font-mono font-bold text-[20px] tabular leading-none truncate ${valueColor}`}
        >
          {content.value}
        </span>
        {content.unit && (
          <span className={`font-mono font-bold text-[12px] tabular flex-shrink-0 ${valueColor}`}>
            {content.unit}
          </span>
        )}
      </div>

      {/* 底部：说明 */}
      <div className="text-[10px] text-slate-400 truncate">
        {content.sub}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block" draggable={false}>
        {inner}
      </Link>
    );
  }
  return <div>{inner}</div>;
}

/* ============================================================
   磁贴区
   ============================================================ */
type Props = {
  ids: string[];
  metrics: HomeMetrics;
};

export default function HomeTiles({ ids, metrics }: Props) {
  const visible = useMemo(
    () => ids.filter(id => MODULE_MAP[id]),
    [ids]
  );

  if (visible.length === 0) {
    return (
      <div className="card p-6 mb-4 text-center">
        <div className="text-slate-300 text-[12px] mb-2">磁贴区是空的</div>
        <div className="text-[10px] text-slate-400">
          去"管理全部模块"添加
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 animate-fade-in-up delay-2">
      <div
        className="flex gap-3 overflow-x-auto no-scrollbar
                   snap-x snap-mandatory
                   -mx-5 px-5 pb-1
                   scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {visible.map((id, i) => (
          <div
            key={id}
            className="animate-fade-in-up"
            style={{ animationDelay: `${0.04 * i}s` }}
          >
            <Tile id={id} metrics={metrics} />
          </div>
        ))}
      </div>
    </div>
  );
}