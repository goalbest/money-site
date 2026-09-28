// lib/homeStore.ts
"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { DEFAULT_LAYOUT, ALL_MODULE_IDS } from "./homeModules";

const STORAGE_KEY = "home_layout_v3";

export type Zone = "tile" | "card" | "hidden";

export type Layout = {
  tile: string[];
  card: string[];
  hidden: string[];
};

/** 默认布局（拷贝，防止外部修改污染常量） */
function getDefaultLayout(): Layout {
  return {
    tile: [...DEFAULT_LAYOUT.tile],
    card: [...DEFAULT_LAYOUT.card],
    hidden: [...DEFAULT_LAYOUT.hidden],
  };
}

/** 校验并修复布局：去掉未知 id，补上缺失的 id（放入 hidden） */
function sanitizeLayout(raw: any): Layout {
  const validIds = new Set(ALL_MODULE_IDS);
  const seen = new Set<string>();

  const clean = (arr: any): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const id of arr) {
      if (typeof id !== "string") continue;
      if (!validIds.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };

  const tile = clean(raw?.tile);
  const card = clean(raw?.card);
  const hidden = clean(raw?.hidden);

  // 缺失的模块 → 放进 hidden
  for (const id of ALL_MODULE_IDS) {
    if (!seen.has(id)) hidden.push(id);
  }

  return { tile, card, hidden };
}

/** 从 localStorage 读 */
function readLayout(): Layout {
  if (typeof window === "undefined") return getDefaultLayout();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultLayout();
    const parsed = JSON.parse(raw);
    return sanitizeLayout(parsed);
  } catch {
    return getDefaultLayout();
  }
}

/** 写入 localStorage（带节流，避免频繁写入） */
let writeTimer: ReturnType<typeof setTimeout> | null = null;
function writeLayout(layout: Layout) {
  if (typeof window === "undefined") return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {}
    writeTimer = null;
  }, 120);
}

/** 找到某 id 所属的 zone */
function findZone(layout: Layout, id: string): Zone | null {
  if (layout.tile.includes(id)) return "tile";
  if (layout.card.includes(id)) return "card";
  if (layout.hidden.includes(id)) return "hidden";
  return null;
}

export function useHomeLayout() {
  const [layout, setLayout] = useState<Layout>(getDefaultLayout);
  const [hydrated, setHydrated] = useState(false);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // 首帧后立即读 localStorage，避免 SSR / CSR 不一致
  useLayoutEffect(() => {
    const next = readLayout();
    setLayout(next);
    setHydrated(true);
  }, []);

  /** 更新布局：自动写入 localStorage */
  const update = useCallback((next: Layout) => {
    setLayout(next);
    writeLayout(next);
  }, []);

  /** 在指定 zone 内移动模块 */
  const moveWithinZone = useCallback(
    (zone: Zone, fromIndex: number, toIndex: number) => {
      const cur = layoutRef.current;
      const arr = [...cur[zone]];
      if (fromIndex < 0 || toIndex < 0) return;
      if (fromIndex >= arr.length || toIndex >= arr.length) return;
      if (fromIndex === toIndex) return;
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      update({ ...cur, [zone]: arr });
    },
    [update]
  );

  /** 跨区移动模块（用于拖动到别的区 / 点击切换显示） */
  const moveToZone = useCallback(
    (id: string, toZone: Zone, toIndex?: number) => {
      const cur = layoutRef.current;
      const fromZone = findZone(cur, id);
      if (fromZone === toZone && toIndex == null) return;

      const next: Layout = {
        tile: [...cur.tile],
        card: [...cur.card],
        hidden: [...cur.hidden],
      };

      // 从原 zone 移除
      if (fromZone) {
        next[fromZone] = next[fromZone].filter(x => x !== id);
      }

      // 插入到目标 zone
      const insertAt = toIndex == null ? next[toZone].length : Math.max(0, Math.min(toIndex, next[toZone].length));
      next[toZone].splice(insertAt, 0, id);

      update(next);
    },
    [update]
  );

  /** 切换显示/隐藏（点卡片时用） */
  const toggleVisible = useCallback(
    (id: string) => {
      const cur = layoutRef.current;
      const zone = findZone(cur, id);
      if (!zone) return;
      if (zone === "hidden") {
        // 从 hidden 恢复到 card（保守选择，用户可再拖动到 tile）
        moveToZone(id, "card");
      } else {
        moveToZone(id, "hidden");
      }
    },
    [moveToZone]
  );

  /** 恢复默认布局 */
  const reset = useCallback(() => {
    update(getDefaultLayout());
  }, [update]);

  return {
    layout,
    hydrated,
    moveWithinZone,
    moveToZone,
    toggleVisible,
    reset,
  };
}