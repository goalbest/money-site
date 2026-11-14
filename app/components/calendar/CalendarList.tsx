"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { getBankInfo } from "../../../lib/banks";

type Props = {
  viewMode: "calendar" | "byProduct";
  setViewMode: (v: "calendar" | "byProduct") => void;
  selectedProduct: number | null;
  setSelectedProduct: (id: number | null) => void;
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  holdings: any[];
  bankFilter: string;
  dayMap: Record<string, number>;
  productDayMap: Record<string, Record<number, number>>;
  productMonthlyMap: Record<number, number>;
  productZeroDaysMap: Record<number, number>;
  isProductDetailMode: boolean;
  selectedProductMeta: any;
  displayTotalProfit: number;
  dailyList: any[];
  productMonthlyList: any[];
  getDayProducts: (date: string) => any[];
  fmtProfit: (n: number) => string;
  selectedProductDayProfit: number;
  privacy?: boolean;
};

export default function CalendarList({
  viewMode, setViewMode, selectedProduct, setSelectedProduct, selectedDate, setSelectedDate,
  holdings, bankFilter, dayMap, productDayMap, productMonthlyMap, productZeroDaysMap,
  isProductDetailMode, selectedProductMeta, displayTotalProfit, dailyList, productMonthlyList,
  getDayProducts, fmtProfit, selectedProductDayProfit, privacy = false
}: Props) {
  
  // ========== 分页逻辑 ==========
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // 当切换银行、Tab或返回列表时，重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [bankFilter, viewMode, selectedProduct]);

  // 计算产品列表的当月正负收益
  const processedProductList = useMemo(() => {
    return productMonthlyList.map((row) => {
      let pos = 0;
      let neg = 0;
      Object.values(productDayMap).forEach((dayMap) => {
        const p = dayMap[row.productId];
        if (p != null) {
          if (p > 0) pos += p;
          if (p < 0) neg += p;
        }
      });
      return { ...row, pos, neg };
    });
  }, [productMonthlyList, productDayMap]);

  const totalPages = Math.ceil(processedProductList.length / ITEMS_PER_PAGE);
  
  // 防止由于数据减少导致页码越界
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedProductList = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return processedProductList.slice(start, start + ITEMS_PER_PAGE);
  }, [processedProductList, currentPage]);


  // ========== 单日正负拆解 ==========
  const calcDayPosNeg = (date: string) => {
    let pos = 0;
    let neg = 0;
    if (isProductDetailMode) return { pos, neg };

    const dayProducts = productDayMap[date] || {};
    Object.entries(dayProducts).forEach(([pidStr, p]) => {
      const pid = Number(pidStr);
      const holding = holdings.find((h: any) => h.product_id === pid || h.products?.id === pid);
      const meta = holding?.products;
      if (!meta) return;
      if (bankFilter !== "全部" && meta.bank !== bankFilter) return;
      if (p > 0) pos += p;
      if (p < 0) neg += p;
    });
    return { pos, neg };
  };

  // ========== 当前进入的单产品，其整月正负收益 ==========
  const selectedProductPosNeg = useMemo(() => {
    if (selectedProduct == null) return { pos: 0, neg: 0 };
    let pos = 0;
    let neg = 0;
    Object.values(productDayMap).forEach(map => {
      const p = map[selectedProduct];
      if (p != null) {
        if (p > 0) pos += p;
        if (p < 0) neg += p;
      }
    });
    return { pos, neg };
  }, [selectedProduct, productDayMap]);

  return (
    <>
      <div className="mb-4">
        <div className="segment-group flex">
          <button onClick={() => { setViewMode("calendar"); setSelectedProduct(null); setSelectedDate(null); }} className={`flex-1 py-2.5 text-[13px] segment-item flex items-center justify-center gap-1.5 ${viewMode === "calendar" ? "segment-item-active" : "hover:text-slate-700"}`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" /></svg>
            日历
          </button>
          <button onClick={() => { setViewMode("byProduct"); setSelectedDate(null); }} className={`flex-1 py-2.5 text-[13px] segment-item flex items-center justify-center gap-1.5 ${viewMode === "byProduct" ? "segment-item-active" : "hover:text-slate-700"}`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            产品
          </button>
        </div>
      </div>

      <div>
        {viewMode === "byProduct" && !selectedProduct ? (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b divider flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold text-slate-900">本月产品收益</div>
                <div className="text-[11px] text-slate-400 mt-0.5">点击产品查看其每日收益</div>
              </div>
              <div className="text-[11px] text-slate-400 tabular">{processedProductList.length} 个</div>
            </div>

            {paginatedProductList.length === 0 ? (
              <div className="py-12 text-center text-slate-300 text-xs">{bankFilter === "全部" ? "本月暂无产品收益数据" : "该银行本月无数据"}</div>
            ) : (
              <div>
                {paginatedProductList.map((row, i) => {
                  const info = getBankInfo(row.bank);
                  const zeroRatio = row.days > 0 ? row.zeroDays / row.days : 0;
                  const zeroColor = zeroRatio >= 0.5 ? "text-amber-500" : "text-slate-400";
                  // 全局排名（用于显示左侧的 1,2,3 金银铜）
                  const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + i;

                  return (
                    <button key={row.productId} onClick={() => { setSelectedProduct(row.productId); setSelectedDate(null); }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 border-b divider last:border-b-0 transition-colors text-left">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${globalIndex === 0 ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white" : globalIndex === 1 ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white" : globalIndex === 2 ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white" : "bg-slate-100 text-slate-500"}`}>{globalIndex + 1}</span>
                      <span className="bank-avatar flex-shrink-0" style={{ background: info.bg, color: info.color }}>{info.label}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-slate-900 font-medium truncate">{row.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
                          <span>{row.bank}</span><span className="text-slate-300">·</span><span>{row.days} 天</span>
                          {row.zeroDays > 0 && (<><span className="text-slate-300">·</span><span className={zeroColor}>挂 0 {row.zeroDays} 天</span></>)}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className={`font-mono font-bold text-[14px] tabular ${row.profit > 0 ? "text-rose-500" : row.profit < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                          {fmtProfit(row.profit)}
                        </div>
                        {(row.pos > 0 || row.neg < 0) && (
                          <div className="flex items-center gap-2 bg-slate-50/90 px-2 py-0.5 rounded-md border border-slate-200/50">
                            <span className="text-[11px] font-mono font-medium text-red-500">
                              {privacy ? "••" : `+${row.pos.toFixed(0)}`}
                            </span>
                            <span className="text-[11px] font-mono font-medium text-green-500">
                              {privacy ? "••" : row.neg.toFixed(0)}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ★ 底部翻页器设计 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/30">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 active:scale-95 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                
                <div className="text-[12px] font-medium text-slate-500 tabular flex items-center">
                  <span className="text-slate-800 font-bold text-[14px]">{currentPage}</span>
                  <span className="mx-1 text-slate-300">/</span>
                  <span>{totalPages}</span>
                </div>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 active:scale-95 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
          </div>
        ) : selectedDate ? (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 bg-slate-50/60 border-b divider flex items-center gap-3">
              <button onClick={() => setSelectedDate(null)} className="w-9 h-9 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center flex-shrink-0 transition-all active:scale-90">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-[15px] tabular shadow-md shadow-purple-500/20 flex-shrink-0">{Number(selectedDate.slice(-2))}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">{selectedDate.slice(5).replace("-", " 月 ")} 日</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{isProductDetailMode ? selectedProductMeta.name : `${getDayProducts(selectedDate).length} 个产品`}</div>
              </div>
              
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className={`font-mono font-bold text-[18px] tabular ${(isProductDetailMode ? selectedProductDayProfit : (Object.values(productDayMap[selectedDate] || {}).reduce((a: any, b: any) => a + b, 0))) > 0 ? "text-rose-500" : (isProductDetailMode ? selectedProductDayProfit : (Object.values(productDayMap[selectedDate] || {}).reduce((a: any, b: any) => a + b, 0))) < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                  {fmtProfit(isProductDetailMode ? selectedProductDayProfit : (Object.values(productDayMap[selectedDate] || {}).reduce((a: any, b: any) => a + b, 0)))}
                </div>
                {(() => {
                  const { pos, neg } = calcDayPosNeg(selectedDate);
                  if (isProductDetailMode || (pos === 0 && neg === 0)) return null;
                  return (
                    <div className="flex items-center gap-2 bg-white/60 px-2.5 py-1 rounded-md border border-slate-200/60">
                      <span className="text-[11px] font-mono font-medium text-red-500">{privacy ? "••" : `+${pos.toFixed(0)}`}</span>
                      <span className="text-[11px] font-mono font-medium text-green-500">{privacy ? "••" : neg.toFixed(0)}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {isProductDetailMode ? (
              <div className="px-5 py-4">
                <div className="text-[12px] text-slate-500 text-center py-3">该产品当日收益 {fmtProfit(selectedProductDayProfit)}</div>
                <Link href={`/product/${selectedProduct}`} className="block text-center py-3 text-[12px] text-purple-600 font-medium hover:bg-purple-50 rounded-xl transition-colors">查看产品详情 →</Link>
              </div>
            ) : getDayProducts(selectedDate).length === 0 ? (
              <div className="py-12 text-center text-slate-300 text-xs">{bankFilter === "全部" ? "当天无收益数据（可能未到购买日或没有净值更新）" : "该银行当天无数据"}</div>
            ) : (
              <div>
                {getDayProducts(selectedDate).map((row) => {
                  const info = getBankInfo(row.bank);
                  return (
                    <Link key={row.productId} href={`/product/${row.productId}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 border-b divider last:border-b-0 transition-colors">
                      <span className="bank-avatar" style={{ background: info.bg, color: info.color }}>{info.label}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-slate-900 font-medium truncate">{row.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{row.bank}</div>
                      </div>
                      <div className={`font-mono font-bold text-[14px] tabular ${row.profit > 0 ? "text-rose-500" : row.profit < 0 ? "text-emerald-500" : "text-slate-400"}`}>{fmtProfit(row.profit)}</div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="card overflow-hidden">
            {isProductDetailMode ? (
              <div className="px-5 py-4 bg-slate-50/60 border-b divider flex items-center gap-3">
                <button onClick={() => { setSelectedProduct(null); setSelectedDate(null); }} className="w-9 h-9 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center flex-shrink-0 transition-all active:scale-90">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-[14px] shadow-md shadow-purple-500/20 flex-shrink-0">{getBankInfo(selectedProductMeta.bank).label}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-slate-900 truncate">{selectedProductMeta.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">{selectedProductMeta.bank} · 本月 {dailyList.length} 天</div>
                </div>
                
                {/* ★ 单产品详情头部：加上整月正负拆解 */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className={`font-mono font-bold text-[16px] tabular ${displayTotalProfit > 0 ? "text-rose-500" : displayTotalProfit < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                    {fmtProfit(displayTotalProfit)}
                  </div>
                  {(selectedProductPosNeg.pos > 0 || selectedProductPosNeg.neg < 0) && (
                    <div className="flex items-center gap-2 bg-white/60 px-2.5 py-1 rounded-md border border-slate-200/60">
                      <span className="text-[11px] font-mono font-medium text-red-500">
                        {privacy ? "••" : `+${selectedProductPosNeg.pos.toFixed(0)}`}
                      </span>
                      <span className="text-[11px] font-mono font-medium text-green-500">
                        {privacy ? "••" : selectedProductPosNeg.neg.toFixed(0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 border-b divider flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-slate-900">本月每日明细</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">点击上方日历格子查看单日明细</div>
                </div>
                <div className="text-[11px] text-slate-400 tabular flex-shrink-0">{dailyList.length} 天</div>
              </div>
            )}

            <div>
              {dailyList.length === 0 ? (
                <div className="py-12 text-center text-slate-300 text-xs">本月暂无收益数据</div>
              ) : (
                dailyList.map((row) => {
                  const profit = row.profit;
                  const { pos, neg } = calcDayPosNeg(row.date);
                  
                  return (
                    <button key={row.date} onClick={() => setSelectedDate(row.date)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 border-b divider last:border-b-0 transition-colors text-left">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[12px] font-semibold tabular ${profit > 0 ? "bg-rose-50 text-rose-600" : profit < 0 ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-500"}`}>{Number(row.date.slice(-2))}</div>
                        <div>
                          <div className="text-[12px] text-slate-700 font-medium">{row.date.slice(5).replace("-", " 月 ")} 日</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{isProductDetailMode ? selectedProductMeta.bank : `${row.count} 个产品`}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className={`font-mono font-bold text-[14px] tabular ${profit > 0 ? "text-rose-500" : profit < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                          {fmtProfit(profit)}
                        </div>
                        {!isProductDetailMode && (pos > 0 || neg < 0) && (
                          <div className="flex items-center gap-2 bg-slate-50/90 px-2 py-0.5 rounded-md border border-slate-200/50">
                            <span className="text-[11px] font-mono font-medium text-red-500">
                              {privacy ? "••" : `+${pos.toFixed(0)}`}
                            </span>
                            <span className="text-[11px] font-mono font-medium text-green-500">
                              {privacy ? "••" : neg.toFixed(0)}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}