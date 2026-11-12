export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  const end = new Date(y, m, 0);
  return `${month}-${String(end.getDate()).padStart(2, "0")}`;
}

export function prevMonthLastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, -6); 
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function firstWeekday(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).getDay();
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtMonthCN(month: string) {
  const [y, m] = month.split("-");
  return `${y} 年 ${Number(m)} 月`;
}