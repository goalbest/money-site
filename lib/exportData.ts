"use client";

import { supabase } from "./supabase";

/* ============ CSV 工具 ============ */
function escapeCSV(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCSV(headers: string[], rows: any[][]): string {
  const lines = [
    headers.map(escapeCSV).join(","),
    ...rows.map(r => r.map(escapeCSV).join(",")),
  ];
  // ★ 加 BOM 让 Excel 正确识别中文
  return "\uFEFF" + lines.join("\n");
}

/* ============ 下载工具 ============ */
function download(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/* ============ 拉数据 ============ */
async function fetchAll() {
  const userId = localStorage.getItem("user_id");
  if (!userId) throw new Error("请先登录");

  const [holdingsRes, txRes, rulesRes] = await Promise.all([
    supabase
      .from("user_holdings")
      .select("id, holding_amount, in_transit_amount, shares, purchase_amount, hold_date, closed_at, closed_amount, status, products(id, name, bank, code, category, unit_nav, annualized_1m, daily_return, nav_date)")
      .eq("user_id", userId),
    supabase
      .from("transactions")
      .select("id, type, amount, shares, price, trade_date, note, product_id, products(name, bank, code)")
      .eq("user_id", userId)
      .order("trade_date", { ascending: false }),
    supabase
      .from("watch_rules")
      .select("*")
      .eq("user_id", userId),
  ]);

  return {
    userId,
    holdings: holdingsRes.data || [],
    transactions: txRes.data || [],
    rules: rulesRes.data || [],
  };
}

/* ============ 导出持仓 CSV ============ */
export async function exportHoldingsCSV() {
  const { holdings } = await fetchAll();

  const headers = [
    "产品名称", "银行", "产品代码", "类别",
    "持仓金额", "在途金额", "份额",
    "单位净值", "近1月年化(%)", "今日涨跌(%)", "净值日期",
    "购买金额", "持有天数", "状态",
  ];

  const today = new Date();
  const rows = holdings.map((h: any) => {
    const p = h.products || {};
    const days = h.hold_date
      ? Math.max(0, Math.floor((today.getTime() - new Date(h.hold_date).getTime()) / 86400000))
      : "";
    return [
      p.name, p.bank, p.code, p.category,
      h.holding_amount, h.in_transit_amount, h.shares,
      p.unit_nav, p.annualized_1m, p.daily_return, p.nav_date,
      h.purchase_amount, days,
      h.status === "active" ? "持有中" : "已清仓",
    ];
  });

  download(`持仓数据_${todayStr()}.csv`, toCSV(headers, rows));
  return holdings.length;
}

/* ============ 导出交易 CSV ============ */
export async function exportTransactionsCSV() {
  const { transactions } = await fetchAll();

  const TX_LABEL: Record<string, string> = {
    buy: "买入",
    sell: "赎回",
    close: "清仓",
  };

  const headers = [
    "交易日期", "类型", "产品名称", "银行", "产品代码",
    "金额", "份额", "净值", "备注",
  ];

  const rows = transactions.map((t: any) => [
    t.trade_date,
    TX_LABEL[t.type] || t.type,
    t.products?.name || "",
    t.products?.bank || "",
    t.products?.code || "",
    t.amount, t.shares, t.price,
    t.note || "",
  ]);

  download(`交易记录_${todayStr()}.csv`, toCSV(headers, rows));
  return transactions.length;
}

/* ============ 导出完整 JSON ============ */
export async function exportAllJSON() {
  const data = await fetchAll();

  const payload = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    holdings: data.holdings,
    transactions: data.transactions,
    watchRules: data.rules,
  };

  download(
    `理财数据备份_${todayStr()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );

  return {
    holdings: data.holdings.length,
    transactions: data.transactions.length,
    rules: data.rules.length,
  };
}