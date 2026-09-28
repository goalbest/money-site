"use client";

import { useEffect, useRef, useState } from "react";

type Options = {
  /**
   * 首次启动延迟（毫秒）
   * 用于等首屏渲染稳定后再开始动画，避免主线程繁忙时动画被"跑完"
   * 推荐 100~200ms
   */
  startDelay?: number;
};

/**
 * 数字滚动动画
 * - 从"当前值"平滑过渡到目标值（不是永远从 0）
 * - 目标值没变时不重播
 * - 支持延迟启动，避免首屏卡顿
 */
export function useCountUp(target: number, duration = 1000, options: Options = {}) {
  const { startDelay = 0 } = options;
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // 取消上一次未完成的动画
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const from = fromRef.current;
    const to = target;

    // 值几乎没变 → 直接落值，不播动画
    if (Math.abs(to - from) < 0.005) {
      fromRef.current = to;
      setValue(to);
      return;
    }

    const startAt = performance.now() + startDelay;
    const total = Math.max(1, duration);

    const tick = (now: number) => {
      const elapsed = now - startAt;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(elapsed / total, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      fromRef.current = next;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setValue(to);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, duration, startDelay]);

  return value;
}