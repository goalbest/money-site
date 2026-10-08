"use client";

import { useMemo } from "react";
import type { HomeMetrics } from "./homeMetrics";
import type { SnapData } from "./useAssetSnapshots";

/**
 * 根据当前数据推荐最有信息量的 4 个磁贴
 * 优先级：异常 > 行动项 > 日常信息
 */
export function useRecommendedTiles(
  metrics: HomeMetrics,
  snap: SnapData
): string[] {
  return useMemo(() => {
    const picks: string[] = [];

    // 1. 资产走势（永远第一位）
    picks.push("assetTrend");

    // 2. 异常事件（优先显示）
    if (metrics.abnormalDrops.length > 0 && picks.length < 4) {
      picks.push("abnormalDrop");
    }
    if (metrics.takeProfits.length > 0 && picks.length < 4) {
      picks.push("takeProfit");
    }
    if (metrics.stopLosses.length > 0 && picks.length < 4) {
      picks.push("stopLoss");
    }

    // 3. 行动项
    if (metrics.pendingCount > 0 && picks.length < 4) {
      picks.push("pending");
    }
    if (metrics.navStaleCount > 0 && picks.length < 4) {
      picks.push("navStale");
    }

    // 4. 补足到 4 个（日常信息）
    const fillers = ["monthProfit", "monthStats", "assetDistribution"];
    for (const f of fillers) {
      if (picks.length >= 4) break;
      picks.push(f);
    }

    return picks.slice(0, 4);
  }, [metrics, snap]);
}