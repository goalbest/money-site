"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Link from "next/link";

const BANKS = [
  "中邮理财", "邮储银行", "农银理财", "工银理财", "建信理财", "中银理财", "交银理财",
  "招银理财", "兴银理财", "浦银理财", "信银理财", "光大理财", "民生理财",
  "平安理财", "华夏理财", "广银理财", "北京银行", "上银理财", "苏银理财",
  "宁银理财", "南银理财", "杭银理财", "上海农商行",
];

export default function AddPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [code, setCode] = useState("");
  const [holdingAmount, setHoldingAmount] = useState("");
  const [inTransitAmount, setInTransitAmount] = useState("");
  const [holdDate, setHoldDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    const savedUserId = localStorage.getItem("user_id");
    if (!savedUserId) {
      router.push("/login");
      return;
    }
    setUserId(savedUserId);
  }, [router]);

  async function handleSubmit() {
    if (!name.trim()) return setMsg("请填写产品名称");
    if (!bank) return setMsg("请选择银行");
    if (!holdingAmount || Number(holdingAmount) <= 0) return setMsg("请填写有效的持仓金额");
    if (!userId) return setMsg("请先登录");

    setSubmitting(true);
    setMsg("");

    try {
      // 1. 检查 products 表里是否已经有这个产品
      let productId: number | null = null;
      if (code.trim()) {
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("bank", bank)
          .eq("code", code.trim())
          .maybeSingle();
        if (existing) productId = existing.id;
      }

      // 2. 如果没有，插入到 products 表
      if (!productId) {
        const { data: newProduct, error: insErr } = await supabase
          .from("products")
          .insert({
            name: name.trim(),
            bank,
            code: code.trim() || null,
          })
          .select("id")
          .single();

        if (insErr || !newProduct) {
          setMsg("添加产品失败：" + (insErr?.message || "未知错误"));
          setSubmitting(false);
          return;
        }
        productId = newProduct.id;
      }

      // 3. 加入持仓
      const { error: holdErr } = await supabase
        .from("user_holdings")
        .insert({
          user_id: userId,
          product_id: productId,
          holding_amount: Number(holdingAmount),
          in_transit_amount: Number(inTransitAmount || 0),
          hold_date: holdDate,
        });

      if (holdErr) {
        setMsg("保存持仓失败：" + holdErr.message);
        setSubmitting(false);
        return;
      }

      router.push("/");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 max-w-2xl flex items-center gap-3">
          <Link href="/" className="text-gray-600 hover:text-gray-900 text-lg">←</Link>
          <h1 className="font-semibold text-gray-800">添加产品</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-6 max-w-2xl">
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
          {/* 产品名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              产品名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：灵活·鸿运日开22号B"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 银行 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              发行机构 <span className="text-red-500">*</span>
            </label>
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">请选择</option>
              {BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* 产品编码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              产品编码（可选）
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="例：Z7001126000862"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <div className="text-xs text-gray-400 mt-1">
              填写编码后，系统可自动抓取该产品的净值数据
            </div>
          </div>

          {/* 持仓金额 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              持仓金额（元）<span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={holdingAmount}
              onChange={(e) => setHoldingAmount(e.target.value)}
              placeholder="例：50000"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          {/* 在途金额 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              在途金额（元）
            </label>
            <input
              type="number"
              value={inTransitAmount}
              onChange={(e) => setInTransitAmount(e.target.value)}
              placeholder="例：0"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          {/* 买入日期 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              买入日期
            </label>
            <input
              type="date"
              value={holdDate}
              onChange={(e) => setHoldDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 错误提示 */}
          {msg && (
            <div className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">
              {msg}
            </div>
          )}

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {submitting ? "保存中..." : "保存"}
          </button>
        </div>

        {/* 提示 */}
        <div className="mt-6 text-xs text-gray-400 text-center leading-relaxed">
          添加后可自动追踪净值变化<br/>
          每日更新收益 · 查看历史走势
        </div>
      </div>
    </div>
  );
}