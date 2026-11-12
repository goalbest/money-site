import React from "react";
import { daysInMonth, firstWeekday, monthEnd, todayStr } from "./utils";

type Props = {
  month: string;
  productDayMap: Record<string, Record<number, number>>;
  dayMap: Record<string, number>;
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  isProductDetailMode: boolean;
  selectedProduct: number | null;
  bankFilter: string;
  holdings: any[];
  navRows: any[];
  maxAbs: number;
  privacy: boolean;
};

export default function CalendarGrid({
  month, productDayMap, dayMap, selectedDate, setSelectedDate, isProductDetailMode,
  selectedProduct, bankFilter, holdings, navRows, maxAbs, privacy
}: Props) {
  const today = todayStr();

  function getDisplayDayProfit(date: string): number | null {
    if (isProductDetailMode && selectedProduct != null) {
      return productDayMap[date]?.[selectedProduct] ?? null;
    }
    if (!productDayMap[date]) {
      return navRows.some(n => n.nav_date === date) ? 0 : null;
    }
    if (bankFilter === "全部") return dayMap[date] ?? 0;
    
    let sum = 0;
    let has = false;
    Object.entries(productDayMap[date]).forEach(([pidStr, profit]) => {
      const meta = holdings.find((h: any) => h.product_id === Number(pidStr))?.products;
      if (meta?.bank === bankFilter) {
        sum += profit;
        has = true;
      }
    });
    return has ? sum : null;
  }

  function fmtCell(n: number) {
    if (privacy) return "••";
    if (n === 0) return "0";
    const sign = n > 0 ? "+" : "";
    const abs = Math.abs(n);
    if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}万`;
    return `${sign}${abs.toFixed(0)}`;
  }

  function fmtCellSmall(n: number) {
    if (privacy) return "••";
    if (n === 0) return "0";
    return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
  }

  const calendarCells = React.useMemo(() => {
    const firstDay = firstWeekday(month);
    const total = daysInMonth(month);
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  return (
    <div className="card p-4 mb-4">
      <div className="grid grid-cols-7 mb-2">
        {["日", "一", "二", "三", "四", "五", "六"].map(w => (
          <div key={w} className="text-center text-[10px] text-slate-400 font-medium py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {calendarCells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="cal-cell cal-cell-empty" />;
          const profit = getDisplayDayProfit(date);
          const isSelected = date === selectedDate;
          const isToday = date === today;

          let cls = "cal-cell";
          if (isSelected) cls += " cal-cell-selected";
          else if (isToday) cls += " cal-cell-today";

          let bgStyle: React.CSSProperties = {};
          if (!isSelected && profit !== null && profit !== 0) {
            const alpha = 0.06 + Math.min(Math.abs(profit) / maxAbs, 1) * 0.22;
            bgStyle.background = profit > 0 ? `rgba(244, 63, 94, ${alpha})` : `rgba(16, 185, 129, ${alpha})`;
          }

          const valColor = profit === null ? "" : profit > 0 ? "text-rose-600" : profit < 0 ? "text-emerald-600" : "text-slate-400";
          const cellText = profit === null ? "" : isProductDetailMode ? fmtCellSmall(profit) : fmtCell(profit);

          return (
            <button key={date} onClick={() => setSelectedDate(isSelected ? null : date)} className={cls} style={bgStyle}>
              <span className="cal-cell-num">{Number(date.slice(-2))}</span>
              {profit !== null && <span className={`cal-cell-val ${valColor}`}>{cellText}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}