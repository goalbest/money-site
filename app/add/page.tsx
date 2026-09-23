"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import PageHeader from "../PageHeader";

// 根据产品名 / 代码自动推断银行
function guessBank(name: string, code: string): string {
  const n = name || "";
  if (/中邮|邮储|鸿运|鸿锦|优盛|福瑞|灵活添利|财富鑫鑫|鸿业远图/.test(n)) return "中邮理财";
  if (/交银/.test(n)) return "交银理财";
  if (/招银|招睿/.test(n)) return "招银理财";
  if (/工银|工行/.test(n)) return "工银理财";
  if (/建信|建行/.test(n)) return "建信理财";
  if (/农银|农行/.test(n)) return "农银理财";
  if (/中银|中行/.test(n)) return "中银理财";
  if (/兴银|兴业/.test(n)) return "兴银理财";
  if (/浦银|浦发/.test(n)) return "浦银理财";
  if (/信银|中信/.test(n)) return "信银理财";
  if (/光大/.test(n)) return "光大理财";
  if (/民生/.test(n)) return "民生理财";
  if (/平安/.test(n)) return "平安理财";
  if (/华夏/.test(n)) return "华夏理财";
  if (/广银|广发/.test(n)) return "广银理财";
  if (/上银|上海银行/.test(n)) return "上银理财";
  if (/苏银|江苏银行/.test(n)) return "苏银理财";
  if (/宁银|宁波银行/.test(n)) return "宁银理财";
  if (/南银|南京银行/.test(n)) return "南银理财";
  if (/杭银|杭州银行/.test(n)) return "杭银理财";

  if (code) {
    if (/^2401NB/i.test(code)) return "中邮理财";
    if (/^JY/i.test(code)) return "交银理财";
    if (/^ZY/i.test(code)) return "招银理财";
  }
  return "其他";
}

export default function AddPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<"search" | "image">("search");

  // 搜索
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  // 图片识别
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrLoaded, setOcrLoaded] = useState(false);
  const [rawOcrData, setRawOcrData] = useState<any>(null);

  // 交易信息
  const [nav, setNav] = useState("");
  const [navDate, setNavDate] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().split("T")[0]);
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [bank, setBank] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
  }, [router]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchTerm.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, bank, code")
        .or(`name.ilike.%${searchTerm}%,bank.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
        .limit(20);
      setResults(data || []);
      setSearching(false);
      setShowResults(true);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchTerm]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleNavChange(v: string) {
    setNav(v);
    const n = Number(v);
    if (n > 0 && amount && Number(amount) > 0) setShares((Number(amount) / n).toFixed(4));
  }
  function handleAmountChange(v: string) {
    setAmount(v);
    const n = Number(nav);
    if (n > 0 && Number(v) > 0) setShares((Number(v) / n).toFixed(4));
  }
  function handleSharesChange(v: string) {
    setShares(v);
    const n = Number(nav);
    if (n > 0 && Number(v) > 0) setAmount((Number(v) * n).toFixed(2));
  }

  function selectProduct(p: any) {
    setSelected(p);
    setSearchTerm(p.name);
    setProductName(p.name);
    setProductCode(p.code || "");
    setBank(p.bank || "");
    setShowResults(false);
    setNav("");
    setNavDate(null);
    setShares("");
    setAmount("");
  }

  function clearSelected() {
    setSelected(null);
    setSearchTerm("");
    setNav("");
    setNavDate(null);
    setAmount("");
    setShares("");
    setProductName("");
    setProductCode("");
    setBank("");
    setMsg("");
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setOcrLoaded(false);
    setRawOcrData(null);
    setMsg("");
  }

  async function runOCR() {
    if (!imageFile) return setMsg("请先选择截图");
    setOcrLoading(true);
    setMsg("");

    try {
      const formData = new FormData();
      formData.append("image", imageFile);

      const resp = await fetch("/api/ocr-save", { method: "POST", body: formData });
      const data = await resp.json();

      if (!data.success) {
        setMsg(data.error || "识别失败");
        setOcrLoading(false);
        return;
      }

      const info = data.data;
      console.log("📋 AI 原始返回:", JSON.stringify(info, null, 2));
      setRawOcrData(info);

      const num = (v: any) => {
        if (v === null || v === undefined || v === "") return null;
        const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
        return isNaN(n) ? null : n;
      };

      const fixDate = (d: any) => {
        if (!d) return null;
        const s = String(d).trim();
        const m = s.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
        if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
        return s;
      };

      const flat: Record<string, any> = {};
      const flatten = (obj: any, prefix = "") => {
        if (!obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj)) {
          if (v && typeof v === "object" && !Array.isArray(v)) {
            flatten(v, prefix + k + ".");
          } else if (!Array.isArray(v)) {
            flat[k] = v;
            if (prefix) flat[prefix + k] = v;
          }
        }
      };
      flatten(info);

      const pick = (...keywords: string[]) => {
        for (const kw of keywords) {
          if (flat[kw] !== undefined && flat[kw] !== null && flat[kw] !== "") return flat[kw];
        }
        for (const kw of keywords) {
          for (const [k, v] of Object.entries(flat)) {
            if (k.toLowerCase().includes(kw.toLowerCase()) && v !== null && v !== "" && typeof v !== "object") {
              return v;
            }
          }
        }
        return null;
      };

      const pName = pick("productName", "产品名称", "product_name", "name");
      if (pName) {
        const cleaned = String(pName).replace(/[（(][A-Z0-9]{6,}[)）]\s*$/, "").trim();
        setProductName(cleaned);
      }

      const pCode = pick("productCode", "产品代码", "product_code", "code", "产品编号");
      if (pCode) setProductCode(String(pCode));

      const pDate = pick("purchaseDate", "购买日期", "申请日期", "applicationDate", "tradeDate", "买入日期", "资金扣款日");
      if (pDate) {
        const fd = fixDate(pDate);
        if (fd) setBuyDate(fd);
      }

      const nv = pick("unitNav", "单位净值", "确认净值", "净值", "nav", "netValue");
      let navNum: number | null = null;
      if (nv) {
        const n = num(nv);
        if (n && n >= 0.5 && n <= 2.0) {
          navNum = n;
          setNav(n.toFixed(4));
        }
      }

      const nvd = pick("navDate", "净值日期", "netValueDate");
      if (nvd) setNavDate(fixDate(nvd));

      const sh = pick("shares", "份额", "委托份额", "确认份额", "持有份额", "shareAmount");
      let shNum: number | null = null;
      if (sh) {
        const n = num(sh);
        const isYearLike = n !== null && Number.isInteger(n) && n >= 1900 && n <= 2100;
        if (n && !isYearLike) {
          shNum = n;
          setShares(n.toFixed(4));
        }
      }

      const am = pick("purchaseAmount", "购买金额", "持仓金额", "确认金额", "amount", "holdingAmount");
      let amNum: number | null = null;
      if (am) {
        const n = num(am);
        if (n && n > 0) {
          amNum = n;
          setAmount(n.toFixed(2));
        }
      }

      // 三字段联动补全
      if (navNum && amNum && !shNum) {
        setShares((amNum / navNum).toFixed(4));
      }
      if (navNum && shNum && !amNum) {
        setAmount((shNum * navNum).toFixed(2));
      }
      if (amNum && shNum && !navNum) {
        const calcNav = amNum / shNum;
        if (calcNav >= 0.5 && calcNav <= 2.0) {
          setNav(calcNav.toFixed(4));
        }
      }

      setOcrLoaded(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setOcrLoading(false);
    }
  }

  async function handleSubmit() {
    if (!productName.trim()) return setMsg("请填写产品名称");
    if (!amount || Number(amount) <= 0) return setMsg("请填写有效的购买金额");
    if (!userId) return;

    setSubmitting(true);
    setMsg("");

    try {
      const buyAmt = Number(amount);
      const shareNum = Number(shares) || (nav ? buyAmt / Number(nav) : 0);

      let productId: number | null = null;
      if (selected) {
        productId = selected.id;
      } else if (productCode.trim()) {
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("code", productCode.trim())
          .maybeSingle();
        if (existing) productId = existing.id;
      }

      if (!productId) {
        const finalBank = bank.trim() || guessBank(productName, productCode);
        const { data: newProduct, error: insErr } = await supabase
          .from("products")
          .insert({
            name: productName.trim(),
            code: productCode.trim() || null,
            bank: finalBank,
            bank_code: productCode.trim() || null,
          })
          .select("id")
          .single();
        if (insErr || !newProduct) {
          setMsg("创建产品失败：" + (insErr?.message || ""));
          setSubmitting(false);
          return;
        }
        productId = newProduct.id;
      }

      const { data: existing } = await supabase
        .from("user_holdings")
        .select("id, holding_amount, shares")
        .eq("user_id", userId)
        .eq("product_id", productId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("user_holdings")
          .update({
            holding_amount: Number(existing.holding_amount || 0) + buyAmt,
            shares: Number(existing.shares || 0) + shareNum,
            status: "active",
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("user_holdings").insert({
          user_id: userId,
          product_id: productId,
          holding_amount: buyAmt,
          shares: shareNum,
          purchase_amount: buyAmt,
          hold_date: buyDate,
          status: "active",
        });
      }

      await supabase.from("transactions").insert({
        user_id: userId,
        product_id: productId,
        type: "buy",
        amount: buyAmt,
        shares: shareNum,
        price: nav ? Number(nav) : null,
        trade_date: buyDate,
        note: existing ? "追加购买" : "首次购买",
      });

      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");

      router.push("/holdings");
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  const showForm = selected || ocrLoaded;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="添加产品" backHref="/" />

      <div className="container mx-auto px-4 -mt-4 max-w-2xl">
        <div className="flex gap-1 mb-4 bg-white rounded-2xl shadow-sm p-1">
          <button
            onClick={() => setMode("search")}
            className={`flex-1 py-2.5 text-sm rounded-xl transition ${
              mode === "search" ? "bg-blue-600 text-white font-medium shadow-sm" : "text-gray-500"
            }`}
          >
            🔍 搜索产品
          </button>
          <button
            onClick={() => setMode("image")}
            className={`flex-1 py-2.5 text-sm rounded-xl transition ${
              mode === "image" ? "bg-blue-600 text-white font-medium shadow-sm" : "text-gray-500"
            }`}
          >
            📷 上传截图
          </button>
        </div>

        {mode === "search" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">搜索产品</label>
            <div ref={searchBoxRef} className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (selected && e.target.value !== selected.name) setSelected(null);
                }}
                onFocus={() => searchTerm.trim() && !selected && setShowResults(true)}
                placeholder="输入产品名称、银行或代码"
                className="w-full border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />

              {showResults && !selected && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 max-h-80 overflow-y-auto">
                  {searching ? (
                    <div className="p-4 text-center text-xs text-gray-400">搜索中...</div>
                  ) : results.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400">
                      没有找到该产品
                      <div className="text-[10px] text-gray-300 mt-2">
                        试试"上传截图"模式，AI 会智能识别
                      </div>
                    </div>
                  ) : (
                    results.map(r => (
                      <button
                        key={r.id}
                        onClick={() => selectProduct(r)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-b-0 transition"
                      >
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="text-sm text-gray-800 flex-1 pr-2 leading-snug">{r.name}</div>
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                            {r.bank}
                          </span>
                        </div>
                        {r.code && <div className="text-[10px] text-gray-400 font-mono">{r.code}</div>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selected && (
              <div className="mt-4 bg-blue-50 rounded-xl p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 mb-1">{selected.name}</div>
                  <div className="text-[10px] text-gray-500">
                    {selected.bank}
                    {selected.code && <span className="ml-2 font-mono">{selected.code}</span>}
                  </div>
                </div>
                <button onClick={clearSelected} className="text-blue-600 text-xs hover:underline">重选</button>
              </div>
            )}
          </div>
        )}

        {mode === "image" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">上传截图</label>
            <div className="text-xs text-gray-500 mb-3 leading-relaxed">
              AI 会自动识别产品名、代码、金额、份额、净值、日期等信息
            </div>

            <label className="block border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 transition">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                disabled={ocrLoading}
              />
              {imagePreview ? (
                <img src={imagePreview} alt="预览" className="max-h-48 mx-auto rounded-lg" />
              ) : (
                <>
                  <div className="text-3xl mb-2">📷</div>
                  <div className="text-xs text-gray-500">点击选择图片</div>
                </>
              )}
            </label>

            {ocrLoading && (
              <div className="mt-4 flex flex-col items-center py-4">
                <div className="relative w-14 h-14 mb-3">
                  <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-xl">🤖</div>
                </div>
                <div className="text-sm font-medium text-gray-700">正在识别图片信息...</div>
                <div className="text-xs text-gray-400 mt-1">约需 5-10 秒</div>
              </div>
            )}

            {imageFile && !ocrLoading && !ocrLoaded && (
              <button
                onClick={runOCR}
                className="w-full mt-3 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
              >
                开始识别
              </button>
            )}

            {ocrLoaded && (
              <div className="mt-3 bg-green-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-green-700 font-medium">✅ 已识别，请确认下方信息</div>
                  <button
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview("");
                      setOcrLoaded(false);
                      setRawOcrData(null);
                    }}
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    重新上传
                  </button>
                </div>
                <div className="text-[10px] text-gray-600 space-y-1 bg-white/60 rounded-lg p-2">
                  <div>产品：{productName || "—"}</div>
                  <div>代码：{productCode || "—"}</div>
                  <div>日期：{buyDate || "—"}</div>
                  <div>金额：{amount || "—"}</div>
                  <div>份额：{shares || "—"}</div>
                  <div>净值：{nav || "—"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <div className="text-sm font-medium text-gray-700 mb-4">交易信息</div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">产品名称</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="产品名称"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">产品代码</label>
                <input
                  type="text"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  placeholder="如 2401NB006B"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">银行</label>
                <input
                  type="text"
                  value={bank || guessBank(productName, productCode)}
                  onChange={(e) => setBank(e.target.value)}
                  placeholder="自动推断，可修改"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">购买日期</label>
                <input
                  type="date"
                  value={buyDate}
                  onChange={(e) => setBuyDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {navDate && <div className="text-[10px] text-gray-400 mt-1.5">已匹配净值日 {navDate}</div>}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">净值</label>
                <input
                  type="number"
                  step="0.0001"
                  value={nav}
                  onChange={(e) => handleNavChange(e.target.value)}
                  placeholder="如 1.0588"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  购买金额（元）<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="如 10000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">份额（自动计算）</label>
                <input
                  type="number"
                  step="0.0001"
                  value={shares}
                  onChange={(e) => handleSharesChange(e.target.value)}
                  placeholder="自动计算"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {msg && (
              <div className="mt-4 text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{msg}</div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full mt-5 bg-blue-600 text-white py-3.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {submitting ? "保存中..." : "确认添加"}
            </button>
          </div>
        )}

        {!showForm && (
          <div className="text-xs text-gray-400 text-center py-6 leading-relaxed">
            {mode === "search" ? "从搜索结果中选择产品" : "上传截图后 AI 自动填充信息"}
          </div>
        )}
      </div>
    </div>
  );
}