import { useState, useEffect } from "react";

export function useCountUp(target: number, duration = 800) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (displayValue === target) return;

    let start = displayValue;
    let end = target;
    let startTime: number | null = null;
    let animationFrame: number;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      
      // easeOutQuart 缓动，顺滑无比
      const ease = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(start + (end - start) * ease);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
    // 依赖项只有 target 和 duration，绝不多余触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]); 

  return displayValue;
}