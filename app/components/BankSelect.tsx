"use client";

import { useState, useMemo } from "react";
import { BANKS } from "../../lib/banks";

type Props = {
  open: boolean;
  current?: string;
  onClose: () => void;
  onSelect: (bank: string) => void;
};

/* 常用大行（放最前） */
const COMMON_BANKS = new Set([
  // 国有 6 大行
  "工银理财", "农银理财", "中银理财", "建信理财", "交银理财", "中邮理财",
  // 股份制 9 家
  "招银理财", "兴银理财", "浦银理财", "信银理财", "光大理财",
  "民生理财", "华夏理财", "广银理财", "平安理财",
]);

/* ★ 汉字 → 拼音首字母（覆盖常见银行名首字） */
const PINYIN_MAP: Record<string, string> = {
  阿: "A",
  北: "B", 渤: "B",
  成: "C", 常: "C", 长: "C", 重: "C",
  大: "D", 东: "D",
  法: "F", 富: "F",
  广: "G", 贵: "G", 光: "G", 工: "G", 高: "G", 赣: "G",
  哈: "H", 杭: "H", 恒: "H", 华: "H", 徽: "H", 汇: "H", 河: "H", 湖: "H", 华: "H",
  建: "J", 交: "J", 锦: "J", 京: "J", 江: "J", 九: "J", 金: "J",
  客: "K", 昆: "K",
  蓝: "L", 齐: "Q",
  民: "M",
  南: "N", 宁: "N", 农: "N",
  平: "P", 浦: "P",
  齐: "Q", 青: "Q", 泉: "Q",
  上: "S", 盛: "S", 施: "S", 顺: "S", 苏: "S", 绍: "S", 深: "S", 三: "S", 上: "S",
  天: "T", 台: "T", 通: "T", 泰: "T",
  微: "W", 温: "W", 网: "W", 无: "W",
  厦: "X", 西: "X", 新: "X", 信: "X", 兴: "X", 湘: "X",
  烟: "Y", 渝: "Y", 亿: "Y", 银: "Y", 扬: "Y",
  浙: "Z", 郑: "Z", 中: "Z", 众: "Z", 重: "Z", 招: "Z", 紫: "Z", 郑: "Z",
};

function pinyinLetter(name: string): string {
  const first = name[0];
  return PINYIN_MAP[first] || "#";
}

export default function BankSelect({ open, current, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");

  /* 过滤 + 分组 */
  const { commonList, groupedOthers, fallbackList, searchMode, total } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? BANKS.filter(
          b =>
            b.name.toLowerCase().includes(term) ||
            b.label.toLowerCase().includes(term) ||
            b.keywords.some(k => k.toLowerCase().includes(term))
        )
      : BANKS;

    // 搜索模式：不分组，直接平铺
    if (term) {
      return {
        commonList: [],
        groupedOthers: {} as Record<string, typeof BANKS>,
        fallbackList: filtered,
        searchMode: true,
        total: filtered.length,
      };
    }

    const common = filtered.filter(b => COMMON_BANKS.has(b.name));
    const fallback = filtered.filter(b => b.name === "其他");
    const others = filtered.filter(
      b => !COMMON_BANKS.has(b.name) && b.name !== "其他"
    );

    // 按拼音首字母分组
    const grouped: Record<string, typeof BANKS> = {};
    others.forEach(b => {
      const letter = pinyinLetter(b.name);
      if (!grouped[letter]) grouped[letter] = [];
      grouped[letter].push(b);
    });

    // 组内按拼音排序
    Object.keys(grouped).forEach(k => {
      grouped[k].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    });

    return {
      commonList: common,
      groupedOthers: grouped,
      fallbackList: fallback,
      searchMode: false,
      total: filtered.length,
    };
  }, [search]);

  if (!open) return null;

  const letters = Object.keys(groupedOthers).sort();
  const hasAny = total > 0;

  function renderItem(b: (typeof BANKS)[number]) {
    const isSelected = b.name === current;
    return (
      <button
        key={b.name}
        onClick={() => {
          onSelect(b.name);
          onClose();
        }}
        className={`w-full flex items-center gap-3 px-5 py-3
                    border-b divider last:border-b-0
                    transition-colors duration-150 text-left
                    ${isSelected
                      ? "bg-purple-50"
                      : "hover:bg-slate-50 active:bg-slate-100"}`}
      >
        <span
          className="bank-avatar flex-shrink-0"
          style={{ background: b.bg, color: b.color }}
        >
          {b.label}
        </span>
        <span
          className={`flex-1 text-[14px] ${
            isSelected
              ? "text-purple-700 font-semibold"
              : "text-slate-800 font-medium"
          }`}
        >
          {b.name}
        </span>
        {isSelected && (
          <svg
            className="w-4 h-4 text-purple-600 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[300] animate-fade-in"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      <div
        className="fixed bottom-0 left-0 right-0 z-[310] animate-slide-up"
        style={{ animationDuration: "0.3s" }}
      >
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl mb-2 max-h-[78vh] flex flex-col">

            {/* 头部 */}
            <div className="px-5 py-4 border-b divider flex items-center justify-between flex-shrink-0">
              <div className="text-[15px] font-semibold text-slate-900">
                选择所属银行
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100
                           flex items-center justify-center
                           transition-colors active:scale-90"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 搜索框 */}
            <div className="px-5 py-3 border-b divider flex-shrink-0">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg
                    className="w-4 h-4 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜索银行名"
                  className="input-field w-full pl-10 pr-9 py-2.5 text-[13px]"
                  autoFocus
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* 列表 */}
            <div className="overflow-y-auto flex-1">
              {!hasAny ? (
                <div className="py-12 text-center">
                  <div className="text-slate-300 text-[12px] mb-2">
                    没有找到匹配的银行
                  </div>
                  <button
                    onClick={() => setSearch("")}
                    className="text-[11px] text-purple-600 font-medium hover:underline"
                  >
                    清空搜索
                  </button>
                </div>
              ) : searchMode ? (
                /* ---------- 搜索模式：平铺显示 ---------- */
                <>
                  <div className="px-5 py-2 bg-slate-50/80 border-b divider sticky top-0 z-[1]">
                    <span className="text-[11px] font-semibold text-slate-500">
                      搜索结果 · {total}
                    </span>
                  </div>
                  {fallbackList.map(renderItem)}
                </>
              ) : (
                /* ---------- 正常模式：分组显示 ---------- */
                <>
                  {/* 常用大行 */}
                  {commonList.length > 0 && (
                    <>
                      <div className="px-5 py-2 bg-slate-50/80 border-b divider sticky top-0 z-[1] flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-600">
                          🔥 常用大行
                        </span>
                        <span className="text-[10px] text-slate-400">
                          · {commonList.length}
                        </span>
                      </div>
                      {commonList.map(renderItem)}
                    </>
                  )}

                  {/* 按字母分组的其他银行 */}
                  {letters.map(letter => (
                    <div key={letter}>
                      <div
                        id={`bank-letter-${letter}`}
                        className="px-5 py-1.5 bg-slate-50/90 border-b divider sticky top-0 z-[1]"
                      >
                        <span className="text-[11px] font-bold text-slate-400 tracking-wider">
                          {letter}
                        </span>
                      </div>
                      {groupedOthers[letter].map(renderItem)}
                    </div>
                  ))}

                  {/* 其他（兜底） */}
                  {fallbackList.length > 0 && (
                    <>
                      <div className="px-5 py-2 bg-slate-50/80 border-b divider sticky top-0 z-[1]">
                        <span className="text-[11px] font-semibold text-slate-500">
                          其他
                        </span>
                      </div>
                      {fallbackList.map(renderItem)}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-white rounded-2xl py-4 text-[15px] font-semibold
                       text-slate-700 shadow-2xl active:bg-slate-50 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </>
  );
}