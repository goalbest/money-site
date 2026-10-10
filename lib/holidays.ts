// lib/holidays.ts
import { supabase } from "./supabase";

let cachedHolidays: Map<string, boolean> | null = null;
let cachedYear = -1;

async function loadHolidays(year: number): Promise<Map<string, boolean>> {
  if (cachedYear === year && cachedHolidays) return cachedHolidays;

  const { data, error } = await supabase
    .from("holidays")
    .select("date, is_holiday")
    .eq("year", year);

  const map = new Map<string, boolean>();
  if (!error && data) {
    for (const row of data) {
      // is_holiday=true → 放假
      // is_holiday=false → 调休上班
      map.set(row.date, row.is_holiday);
    }
  }
  cachedHolidays = map;
  cachedYear = year;
  return map;
}

export function isNonTradingDay(date: Date): boolean {
  const dow = date.getDay();
  const s = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  // 先查缓存（同步返回，可能不准，会触发异步加载）
  if (cachedYear === date.getFullYear() && cachedHolidays) {
    const isHol = cachedHolidays.get(s);
    if (isHol === true) return true;  // 法定假日
    if (isHol === false) return false; // 调休上班
  } else {
    // 缓存未命中，触发异步加载（下次调用就有值）
    loadHolidays(date.getFullYear());
  }

  // 兜底：周末
  return dow === 0 || dow === 6;
}

/** 预加载指定年份的节假日（建议在应用初始化时调用） */
export async function preloadHolidays(year?: number) {
  await loadHolidays(year ?? new Date().getFullYear());
}

export function addTradingDays(d: Date, days: number): Date {
  const result = new Date(d);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (!isNonTradingDay(result)) added++;
  }
  return result;
}

export function ensureTradingDay(d: Date): Date {
  const result = new Date(d);
  while (isNonTradingDay(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}