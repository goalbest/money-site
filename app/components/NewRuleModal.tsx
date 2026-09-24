"use client";

import { useState, useEffect } from "react";
import { getBankInfo } from "../../lib/banks";

type Condition = {
  id: string;
  indicatorType: "annualized" | "unit_nav" | "daily_return";
  period: string;
  operator: string;
  threshold: string;
};

type Props = {
  open: boolean;
  holdings: any[];
  editing?: any;
  onClose: () => void;
  onSave: (data: {
    product_ids: number[];
    conditions: { indicator: string; operator: string; threshold: number }[];
  }) => Promise<void>;
};

const INDICATOR_TYPES = [
  { key: "annualized", label: "年化" },
  { key: "unit_nav", label: "单位净值" },
  { key: "daily_return", label: "日涨跌" },
];

const PERIODS = [
  { key: "7d", label: "近 7 日" },
  { key: "14d", label: "近 14 日" },
  { key: "1m", label: "近 1 月" },
  { key: "3m", label: "近 3 月" },
  { key: "1y", label: "近 1 年" },
];

const OPERATORS = [
  { key: "<", label: "小于" },
  { key: ">", label: "大于" },
  { key: "<=", label: "≤" },
  { key: ">=", label: "≥" },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function parseIndicator(indicator: string) {
  if (indicator === "unit_nav") return { type: "unit_nav" as const, period: "" };
  if (indicator === "daily_return") return { type: "daily_return" as const, period: "" };
  const m = indicator.match(/^annualized_(7d|14d|1m|3m|1y)$/);
  if (m) return { type: "annualized" as const, period: m[1] };
  return { type: "annualized" as const, period: "1m" };
}

function buildIndicator(type: string, period: string) {
  if (type === "annualized") return `annualized_${period}`;
  return type;
}

function getUnit(indicator: string) {
  return indicator === "unit_nav" ? "元" : "%";
}

function getLabel(indicator: string) {
  if (indicator === "unit_nav") return "单位净值";
  if (indicator === "daily_return") return "日涨跌";
  const { period } = parseIndicator(indicator);
  const periodLabel = PERIODS.find(p => p.key === period)?.label || "近 1 月";
  return `${periodLabel}年化`;
}

function newCondition(): Condition {
  return {
    id: uid(),
    indicatorType: "annualized",
    period: "1m",
    operator: "<",
    threshold: "",
  };
}

export default function NewRuleModal({ open, holdings, editing, onClose, onSave }: Props) {
  const [productIds, setProductIds] = useState<number[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([newCondition()]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (editing) {
      setProductIds([editing.product_id]);
      if (Array.isArray(editing.conditions) && editing.conditions.length > 0) {
        setConditions(
          editing.conditions.map((c: any) => {
            const parsed = parseIndicator(c.indicator);
            return {
              id: uid(),
              indicatorType: parsed.type,
              period: parsed.period || "1m",
              operator: c.operator,
              threshold: String(c.threshold),
            };
          })
        );
      } else {
        const parsed = parseIndicator(editing.indicator || "annualized_1m");
        setConditions([
          {
            id: uid(),
            indicatorType: parsed.type,
            period: parsed.period || "1m",
            operator: editing.operator || "<",
            threshold: String(editing.threshold ?? ""),
          },
        ]);
      }
    } else {
      setProductIds(holdings[0]?.product_id ? [holdings[0].product_id] : []);
      setConditions([newCondition()]);
    }
    setMsg("");
  }, [open, editing, holdings]);

  if (!open) return null;

  const isEditing = !!editing;

  function toggleProduct(pid: number) {
    if (isEditing) {
      setProductIds([pid]);
      return;
    }
    setProductIds(prev =>
      prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]
    );
  }

  function selectAll() {
    if (isEditing) return;
    setProductIds(holdings.map(h => h.product_id));
  }

  function clearAll() {
    if (isEditing) return;
    setProductIds([]);
  }

  function updateCondition(id: string, patch: Partial<Condition>) {
    setConditions(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addCondition() {
    setConditions(prev => [...prev, newCondition()]);
  }

  function removeCondition(id: string) {
    if (conditions.length <= 1) return;
    setConditions(prev => prev.filter(c => c.id !== id));
  }

  async function handleSave() {
    if (productIds.length === 0) return setMsg("请选择至少一个产品");

    for (const c of conditions) {
      if (!c.threshold || isNaN(Number(c.threshold))) {
        return setMsg("所有条件都需要填写有效阈值");
      }
    }

    setSaving(true);
    try {
      const conditionsPayload = conditions.map(c => ({
        indicator: buildIndicator(c.indicatorType, c.period),
        operator: c.operator,
        threshold: Number(c.threshold),
      }));

      await onSave({
        product_ids: productIds,
        conditions: conditionsPayload,
      });
      onClose();
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSaving(false);
    }
  }

  const selectedProducts = holdings.filter(h => productIds.includes(h.product_id));

  return (
    <>
      {/* ============ 遮罩 ============ */}
      <div
        className="fixed inset-0 bg-black/40 z-[80] animate-fade-in"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* ============ 底部弹窗（唯一的一个） ============ */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[90] animate-fade-in-up"
        style={{ animationDuration: "0.3s" }}
      >
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col">

            {/* 头部 */}
            <div className="px-5 py-4 border-b divider flex items-center justify-between flex-shrink-0">
              <div className="text-[15px] font-semibold text-slate-900">
                {isEditing ? "编辑规则" : "新建规则"}
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100
                           flex items-center justify-center
                           transition-colors active:scale-90"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 滚动内容 */}
            <div className="p-5 space-y-5 overflow-y-auto flex-1">

              {/* 1. 选择产品 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] text-slate-500">
                    选择产品 {!isEditing && <span className="text-slate-400">（可多选）</span>}
                  </div>
                  {!isEditing && (
                    <div className="flex gap-2">
                      <button
                        onClick={selectAll}
                        className="text-[11px] text-purple-600 font-medium hover:text-purple-700 transition-colors"
                      >
                        全选
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        onClick={clearAll}
                        className="text-[11px] text-slate-400 font-medium hover:text-slate-600 transition-colors"
                      >
                        清空
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setProductPickerOpen(true)}
                  className="input-field w-full px-4 py-3 text-sm
                             flex items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {selectedProducts.length === 0 ? (
                      <span className="text-slate-400">点击选择产品</span>
                    ) : selectedProducts.length === 1 ? (
                      (() => {
                        const info = getBankInfo(selectedProducts[0].products.bank);
                        return (
                          <>
                            <span
                              className="bank-avatar flex-shrink-0"
                              style={{ background: info.bg, color: info.color }}
                            >
                              {info.label}
                            </span>
                            <span className="text-slate-900 truncate">
                              {selectedProducts[0].products.name}
                            </span>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <span className="px-2 py-0.5 rounded-full
                                          bg-purple-100 text-purple-700
                                          text-[11px] font-bold flex-shrink-0">
                          {selectedProducts.length}
                        </span>
                        <span className="text-slate-900 truncate">
                          已选 {selectedProducts.length} 个产品
                        </span>
                      </>
                    )}
                  </span>
                  <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {!isEditing && selectedProducts.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {selectedProducts.map(p => {
                      const info = getBankInfo(p.products.bank);
                      return (
                        <span
                          key={p.product_id}
                          className="inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5
                                     rounded-full bg-slate-50 border border-slate-100
                                     text-[10px] text-slate-600"
                        >
                          <span
                            className="w-3.5 h-3.5 rounded flex items-center justify-center
                                       text-[7px] font-bold flex-shrink-0"
                            style={{ background: info.bg, color: info.color }}
                          >
                            {info.label}
                          </span>
                          <span className="truncate max-w-[120px]">
                            {p.products.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleProduct(p.product_id);
                            }}
                            className="text-slate-400 hover:text-slate-600 ml-0.5"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. 条件列表 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] text-slate-500">
                    触发条件 {conditions.length > 1 && (
                      <span className="text-slate-400">（全部满足时触发）</span>
                    )}
                  </div>
                  {conditions.length > 1 && (
                    <span className="text-[10px] text-purple-600 bg-purple-50
                                     px-2 py-0.5 rounded-full font-medium">
                      AND 组合
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {conditions.map((c, idx) => {
                    const indicator = buildIndicator(c.indicatorType, c.period);
                    const unit = getUnit(indicator);

                    return (
                      <div
                        key={c.id}
                        className="bg-slate-50/60 border border-slate-100 rounded-2xl p-3.5"
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full
                                             bg-gradient-to-br from-violet-500 to-purple-600
                                             text-white text-[10px] font-bold
                                             flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              条件 {idx + 1}
                            </span>
                          </div>
                          {conditions.length > 1 && (
                            <button
                              onClick={() => removeCondition(c.id)}
                              className="w-6 h-6 rounded-full hover:bg-rose-50
                                         flex items-center justify-center
                                         transition-colors"
                            >
                              <svg className="w-3 h-3 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>

                        <div className="segment-group flex mb-2.5" style={{ background: "#ffffff" }}>
                          {INDICATOR_TYPES.map(t => (
                            <button
                              key={t.key}
                              onClick={() => updateCondition(c.id, { indicatorType: t.key as any })}
                              className={`flex-1 py-1.5 text-[11px] segment-item ${
                                c.indicatorType === t.key
                                  ? "segment-item-active"
                                  : "hover:text-slate-700"
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        {c.indicatorType === "annualized" && (
                          <div className="grid grid-cols-5 gap-1.5 mb-2.5">
                            {PERIODS.map(p => (
                              <button
                                key={p.key}
                                onClick={() => updateCondition(c.id, { period: p.key })}
                                className={`py-1.5 rounded-lg text-[10px] font-medium
                                            transition-all duration-200
                                            ${c.period === p.key
                                              ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white"
                                              : "bg-white text-slate-600 hover:bg-slate-100"
                                            }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <select
                            value={c.operator}
                            onChange={(e) => updateCondition(c.id, { operator: e.target.value })}
                            className="input-field px-3 py-2.5 text-[13px] w-20 appearance-none"
                          >
                            {OPERATORS.map(o => (
                              <option key={o.key} value={o.key}>{o.label}</option>
                            ))}
                          </select>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              step="0.0001"
                              value={c.threshold}
                              onChange={(e) => updateCondition(c.id, { threshold: e.target.value })}
                              placeholder="输入阈值"
                              className="input-field w-full px-3 py-2.5 text-[14px] font-mono tabular pr-10"
                            />
                            <span className="absolute inset-y-0 right-3 flex items-center text-[11px] text-slate-400">
                              {unit}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={addCondition}
                  className="w-full mt-3 py-2.5 rounded-2xl
                             border border-dashed border-purple-200
                             bg-purple-50/50
                             text-[12px] text-purple-600 font-medium
                             hover:bg-purple-50 hover:border-purple-300
                             active:scale-[0.99]
                             transition-all duration-200
                             flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  添加条件
                </button>
              </div>

              {/* 3. 预览 */}
              {selectedProducts.length > 0 && conditions.every(c => c.threshold) && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-3.5">
                  <div className="text-[10px] text-purple-500 mb-1.5 font-medium tracking-wider">
                    规则预览
                  </div>
                  <div className="text-[12px] text-purple-700 leading-relaxed">
                    当{" "}
                    <span className="font-semibold">
                      {selectedProducts.length === 1
                        ? selectedProducts[0].products.name
                        : `${selectedProducts.length} 个产品`}
                    </span>{" "}
                    的
                    {conditions.map((c, i) => {
                      const ind = buildIndicator(c.indicatorType, c.period);
                      return (
                        <span key={c.id}>
                          {i > 0 && <span className="mx-1 font-semibold text-purple-500">AND</span>}
                          <span className="font-semibold">{getLabel(ind)}</span>{" "}
                          {OPERATORS.find(o => o.key === c.operator)?.label}{" "}
                          <span className="font-mono font-bold">{c.threshold}{getUnit(ind)}</span>
                        </span>
                      );
                    })}
                    {" "}时触发
                  </div>
                </div>
              )}

              {msg && <div className="text-sm text-rose-500 bg-rose-50 rounded-xl px-4 py-3">{msg}</div>}
            </div>

            {/* 底部按钮：只有这一组 */}
            <div className="px-5 py-4 border-t divider flex gap-2 flex-shrink-0">
              <button onClick={onClose} className="btn-secondary flex-1 py-3 text-sm">
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
              >
                {saving
                  ? "保存中..."
                  : isEditing
                  ? "保存修改"
                  : productIds.length > 1
                  ? `保存到 ${productIds.length} 个产品`
                  : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============ 产品选择器（独立弹层） ============ */}
      {productPickerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[100] animate-fade-in"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => setProductPickerOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[110] animate-fade-in-up"
            style={{ animationDuration: "0.3s" }}
          >
            <div className="max-w-3xl mx-auto px-4 pb-4">
              <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[78vh] flex flex-col">
                <div className="px-5 py-4 border-b divider flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="text-[15px] font-semibold text-slate-900">选择产品</div>
                    {!isEditing && (
                      <span className="text-[11px] text-slate-400">
                        已选 {productIds.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!isEditing && (
                      <>
                        <button
                          onClick={selectAll}
                          className="text-[12px] text-purple-600 font-medium
                                     hover:text-purple-700 transition-colors px-2 py-1"
                        >
                          全选
                        </button>
                        <button
                          onClick={clearAll}
                          className="text-[12px] text-slate-400 font-medium
                                     hover:text-slate-600 transition-colors px-2 py-1"
                        >
                          清空
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setProductPickerOpen(false)}
                      className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100
                                 flex items-center justify-center ml-1
                                 transition-colors active:scale-90"
                    >
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="overflow-y-auto flex-1">
                  {holdings.map((h) => {
                    const p = h.products;
                    if (!p) return null;
                    const info = getBankInfo(p.bank);
                    const isSelected = productIds.includes(h.product_id);
                    return (
                      <button
                        key={h.product_id}
                        onClick={() => toggleProduct(h.product_id)}
                        className={`w-full flex items-center gap-3 px-5 py-3.5
                                    border-b divider last:border-b-0
                                    transition-colors text-left
                                    ${isSelected ? "bg-purple-50" : "hover:bg-slate-50 active:bg-slate-100"}`}
                      >
                        {!isEditing && (
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center
                                        flex-shrink-0 border-2 transition-all
                                        ${isSelected
                                          ? "bg-gradient-to-br from-violet-500 to-purple-600 border-transparent"
                                          : "border-slate-300 bg-white"
                                        }`}
                          >
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                        )}
                        <span
                          className="bank-avatar flex-shrink-0"
                          style={{ background: info.bg, color: info.color }}
                        >
                          {info.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] truncate ${
                            isSelected ? "text-purple-700 font-semibold" : "text-slate-800 font-medium"
                          }`}>
                            {p.name}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {p.bank}
                          </div>
                        </div>
                        {isEditing && isSelected && (
                          <svg className="w-4 h-4 text-purple-600 flex-shrink-0"
                               fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>

                {!isEditing && (
                  <div className="px-5 py-4 border-t divider flex-shrink-0">
                    <button
                      onClick={() => setProductPickerOpen(false)}
                      className="btn-primary w-full py-3 text-sm"
                    >
                      确定{productIds.length > 0 ? `（已选 ${productIds.length}）` : ""}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}