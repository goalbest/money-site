"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import PageHeader from "../../PageHeader";

export default function TransactionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const txId = params.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"view" | "edit">("view");

  const [tradeDate, setTradeDate] = useState("");
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
    fetchTx();
  }, [txId]);

  async function fetchTx() {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, amount, shares, price, trade_date, note, created_at, products(id, name, bank, code)")
        .eq("id", Number(txId))
        .maybeSingle();
      if (error || !data) {
        setMsg("未找到该交易记录");
      } else {
        setTx(data);
        setTradeDate(data.trade_date || "");
        setNote(data.note || "");
      }
    } catch (e: any) {
      setMsg("加载失败：" + e.message);
    }
    setLoading(false);
  }

  async function recalcHolding(uid: string, productId: number) {
    const { data: txs } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", uid)
      .eq("product_id", productId)
      .order("trade_date", { ascending: true })
      .order("id", { ascending: true });

    let totalAmount = 0;
    let totalShares = 0;

    (txs || []).forEach((t: any) => {
      const amt = Number(t.amount || 0);
      const sh = Number(t.shares || 0);
      if (t.type === "buy") {
        totalAmount += amt;
        totalShares += sh;
      } else if (t.type === "sell" || t.type === "close") {
        totalAmount -= amt;
        totalShares -= sh;
      }
    });

    const { data: existing } = await supabase
      .from("user_holdings")
      .select("id")
      .eq("user_id", uid)
      .eq("product_id", productId)
      .maybeSingle();

    if (totalShares <= 0.001) {
      if (existing) {
        await supabase
          .from("user_holdings")
          .update({
            status: "closed",
            holding_amount: 0,
            shares: 0,
            closed_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      }
    } else {
      if (existing) {
        await supabase
          .from("user_holdings")
          .update({
            holding_amount: totalAmount,
            shares: totalShares,
            status: "active",
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("user_holdings").insert({
          user_id: uid,
          product_id: productId,
          holding_amount: totalAmount,
          shares: totalShares,
          status: "active",
          hold_date: txs?.[0]?.trade_date || new Date().toISOString().split("T")[0],
        });
      }
    }
  }

  async function handleSave() {
    if (!tx || !userId) return;
    setSubmitting(true);
    try {
      await supabase
        .from("transactions")
        .update({
          trade_date: tradeDate,
          note: note.trim() || null,
        })
        .eq("id", tx.id);

      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");
      router.push("/transactions");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!tx || !userId) return;
    const confirmed = window.confirm(
      `确定删除这条交易记录吗？\n\n删除后，该产品的持仓将根据剩余交易自动重算。`
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await supabase.from("transactions").delete().eq("id", tx.id);
      await recalcHolding(userId, tx.products.id);
      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");
      router.push("/transactions");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="交易详情" backHref="/transactions" />
        <div className="container mx-auto px-4 -mt-4 max-w-2xl">
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="text-gray-400 text-sm mb-4">{msg || "未找到该交易记录"}</div>
            <Link href="/transactions" className="inline-block text-blue-600 text-sm hover:underline">
              返回交易记录 →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const typeMeta: Record<string, { text: string; cls: string; sign: string }> = {
    buy:   { text: "买入", cls: "text-blue-600 bg-blue-50",     sign: "+" },
    sell:  { text: "赎回", cls: "text-orange-600 bg-orange-50", sign: "-" },
    close: { text: "清仓", cls: "text-gray-600 bg-gray-100",    sign: "" },
  };
  const meta = typeMeta[tx.type] || typeMeta.buy;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="交易详情" backHref="/transactions" />

      <div className="container mx-auto px-4 -mt-4 max-w-2xl">
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-[10px] font-medium px-2 py-1 rounded-md ${meta.cls}`}>
              {meta.text}
            </span>
            <h1 className="font-semibold text-gray-900 text-sm leading-snug flex-1">{tx.products?.name}</h1>
          </div>
          <div className="text-[10px] text-gray-400 mb-4">{tx.products?.bank}</div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-center mb-4">
              <div className="text-[10px] text-gray-400 mb-1">交易金额（元）</div>
              <div className="text-2xl font-bold font-mono text-gray-900">
                {meta.sign}{Number(tx.amount || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
              <div>
                <div className="text-[10px] text-gray-400 mb-1">份额</div>
                <div className="text-sm font-mono text-gray-700">
                  {tx.shares ? Number(tx.shares).toFixed(4) : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 mb-1">净值</div>
                <div className="text-sm font-mono text-gray-700">
                  {tx.price ? Number(tx.price).toFixed(4) : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {mode === "view" && (
          <>
            <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">交易日期</span>
                  <span className="font-mono text-gray-900">{tx.trade_date}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">备注</span>
                  <span className="text-gray-900 text-right ml-4 max-w-[60%]">{tx.note || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">记录时间</span>
                  <span className="font-mono text-xs text-gray-400">{tx.created_at?.split("T")[0]}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setMode("edit")}
                className="w-full bg-white text-gray-700 py-3.5 rounded-2xl text-sm font-medium hover:bg-gray-50 transition shadow-sm"
              >
                编辑备注和日期
              </button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className="w-full bg-white text-red-500 py-3.5 rounded-2xl text-sm font-medium hover:bg-red-50 transition shadow-sm disabled:opacity-50"
              >
                删除这笔交易
              </button>
            </div>

            <div className="mt-4 bg-orange-50 rounded-xl p-3 text-[10px] text-orange-600 leading-relaxed">
              ⚠️ 删除后，该产品的持仓会根据剩余交易自动重算。
            </div>
          </>
        )}

        {mode === "edit" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="text-sm font-medium text-gray-700 mb-4">编辑交易</div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">交易日期</label>
                <input
                  type="date"
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">备注</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：加仓、调整仓位"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-[10px] text-gray-500 leading-relaxed">
                💡 金额和份额不允许修改。如需修正，请删除后重新添加。
              </div>
            </div>

            {msg && <div className="mt-4 text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{msg}</div>}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setMode("view"); setMsg(""); }}
                className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={submitting}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {submitting ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}