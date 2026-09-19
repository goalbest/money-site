"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function WatchlistPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    setUserId(id);
    if (!id) {
      setLoading(false);
      return;
    }
    async function fetchData() {
      const { data } = await supabase
        .from("user_watchlist")
        .select("id, holding_amount, products(id, name, bank, unit_nav, annualized_1m, nav_date)")
        .eq("user_id", id);
      if (data) setItems(data);
      setLoading(false);
    }
    fetchData();
  }, []);

  async function updateAmount(watchId: number, amount: number) {
    await supabase.from("user_watchlist").update({ holding_amount: amount }).eq("id", watchId);
    setItems((prev) => prev.map((it) => (it.id === watchId ? { ...it, holding_amount: amount } : it)));
  }

  async function removeItem(watchId: number) {
    if (!confirm("确定要从自选中删除吗？")) return;
    await supabase.from("user_watchlist").delete().eq("id", watchId);
    setItems((prev) => prev.filter((it) => it.id !== watchId));
  }

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  if (!userId) {
    return (
      <main className="container mx-auto p-6 max-w-2xl text-center">
        <p className="text-gray-500 mb-4">请先登录后查看自选</p>
        <Link href="/login" className="text-blue-600 hover:underline">去登录 →</Link>
      </main>
    );
  }

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <Link href="/" className="text-blue-600 text-sm hover:underline mb-4 inline-block">← 返回首页</Link>
      <h1 className="text-2xl font-bold mb-6">我的自选（{items.length}）</h1>

      {items.length === 0 ? (
        <p className="text-gray-500 text-center py-12">
          还没有自选，去首页点 ☆ 加自选吧
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const p = it.products;
            if (!p) return null;
            const annual = Number(p.annualized_1m) || 0;
            const amount = Number(it.holding_amount) || 0;
            const estimate = (amount * annual) / 100;

            return (
              <div key={it.id} className="border rounded-lg p-4 bg-white shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <Link href={`/product/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <div className="text-xs text-gray-500 mt-1">
                      {p.bank} · 单位净值 {Number(p.unit_nav).toFixed(4)} · 净值日 {p.nav_date}
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(it.id)}
                    className="text-red-500 text-sm hover:underline whitespace-nowrap"
                  >
                    删除
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 items-center">
                  <div>
                    <label className="text-xs text-gray-500 block">持仓金额（元）</label>
                    <input
                      type="number"
                      defaultValue={it.holding_amount || ""}
                      onBlur={(e) => updateAmount(it.id, Number(e.target.value) || 0)}
                      className="w-full border rounded px-2 py-1 mt-1 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">近1月年化</div>
                    <div className="text-lg font-bold text-red-500 mt-1">
                      +{annual.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">预估年收益</div>
                    <div className="text-lg font-bold text-green-600 mt-1">
                      {estimate.toFixed(2)} 元
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}