"use client";

import { useState, type ReactNode } from "react";

type Props<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  visibleCount?: number;
  /** @deprecated 保留兼容，不再使用 */
  itemHeight?: number;
  /** @deprecated 保留兼容，不再使用 */
  initialCount?: number;
  /** @deprecated 保留兼容，不再使用 */
  pageSize?: number;
  empty?: ReactNode;
  /** 可选：展开后跳转的链接；不给就在卡片内展开 */
  moreHref?: string;
};

export default function ScrollableList<T>({
  items,
  renderItem,
  visibleCount = 5,
  empty,
  moreHref,
}: Props<T>) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return <>{empty}</>;

  const showAll = expanded || items.length <= visibleCount;
  const visible = showAll ? items : items.slice(0, visibleCount);
  const remaining = items.length - visibleCount;

  return (
    <div>
      {visible.map((item, idx) => renderItem(item, idx))}

      {!showAll && (
        <div className="border-t divider">
          {moreHref ? (
            <a
              href={moreHref}
              className="block w-full py-3 text-center text-[11px]
                         text-slate-500 hover:text-purple-600 font-medium transition-colors"
            >
              还有 {remaining} 条 · 查看全部 →
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="block w-full py-3 text-[11px]
                         text-slate-500 hover:text-purple-600 font-medium transition-colors"
            >
              展开全部（还有 {remaining} 条）
            </button>
          )}
        </div>
      )}

      {showAll && items.length > visibleCount && (
        <div className="border-t divider">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="block w-full py-3 text-[11px]
                       text-slate-500 hover:text-purple-600 font-medium transition-colors"
          >
            收起
          </button>
        </div>
      )}
    </div>
  );
}