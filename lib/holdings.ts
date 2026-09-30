"use client";

import { supabase } from "./supabase";

/**
 * 根据该产品的所有交易记录，重算 user_holdings
 * - shares: 所有买入份额 - 所有卖出份额
 * - holding_amount: shares × 最新单位净值
 * - purchase_amount: 剩余成本（卖出按比例扣减）
 * - status: shares <= 0.01 → closed，否则 active
 * - hold_date: 首次买入日期
 */
export async function recalcHoldingFromTransactions(
  userId: string,
  productId: number
) {
  const { data: txs } = await supabase
    .from("transactions")
    .select("id, type, amount, shares, price, trade_date")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("trade_date", { ascending: true })
    .order("id", { ascending: true });

  if (!txs || txs.length === 0) return;

  let shares = 0;
  let cost = 0;
  let firstBuyDate: string | null = null;
  let closedAmount = 0;

  txs.forEach((t: any) => {
    const sh = Number(t.shares || 0);
    const amt = Number(t.amount || 0);
    if (t.type === "buy") {
      if (!firstBuyDate) firstBuyDate = t.trade_date;
      shares += sh;
      cost += amt;
    } else if (t.type === "sell") {
      if (shares > 0) {
        const ratio = Math.min(1, sh / shares);
        cost -= cost * ratio;
        shares -= sh;
      }
    } else if (t.type === "close") {
      closedAmount = amt;
      shares = 0;
      cost = 0;
    }
  });

  /* 拉最新净值 */
  const { data: prod } = await supabase
    .from("products")
    .select("unit_nav")
    .eq("id", productId)
    .maybeSingle();
  const latestNav = Number(prod?.unit_nav || 0);
  const holdingAmount = latestNav > 0 ? shares * latestNav : cost;
  const isClosed = shares <= 0.01;

  const { data: existing } = await supabase
    .from("user_holdings")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("user_holdings")
      .update({
        shares: isClosed ? 0 : shares,
        holding_amount: isClosed ? 0 : holdingAmount,
        purchase_amount: cost,
        hold_date: firstBuyDate,
        status: isClosed ? "closed" : "active",
        closed_amount: isClosed ? closedAmount : null,
        closed_at: isClosed ? new Date().toISOString() : null,
      })
      .eq("id", existing.id);
  } else if (!isClosed) {
    await supabase.from("user_holdings").insert({
      user_id: userId,
      product_id: productId,
      shares,
      holding_amount: holdingAmount,
      purchase_amount: cost,
      hold_date: firstBuyDate,
      status: "active",
    });
  }
}

/** 查某个日期的净值（取该日期或之前最近一天） */
export async function fetchNavByDate(
  productId: number,
  date: string
): Promise<number | null> {
  if (!productId || !date) return null;
  const { data } = await supabase
    .from("nav_history")
    .select("unit_nav")
    .eq("product_id", productId)
    .lte("nav_date", date)
    .order("nav_date", { ascending: false })
    .limit(1);
  if (data && data.length > 0) return Number(data[0].unit_nav);
  return null;
}