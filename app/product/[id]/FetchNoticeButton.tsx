"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function FetchNoticeButton({ productId }: { productId: number }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"image" | "url">("image");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlResult, setUrlResult] = useState<any>(null);

  const [error, setError] = useState("");

  function reset() {
    setImageFile(null);
    setImagePreview("");
    setOcrResult(null);
    setUrl("");
    setUrlResult(null);
    setError("");
  }

  function close() {
    setOpen(false);
    reset();
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setOcrResult(null);
    setError("");
  }

  async function runOCR() {
    if (!imageFile) return setError("请先选择截图");
    setOcrLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("productId", String(productId));

      const resp = await fetch("/api/ocr-save", {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (data.success) {
        setOcrResult(data.data);
      } else {
        setError(data.error || "识别失败");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOcrLoading(false);
    }
  }

  // ============ 类型判断 ============
  function extractNavList(result: any): any[] {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.navList)) return result.navList;
    if (Array.isArray(result.items)) return result.items;
    if (Array.isArray(result.navHistory)) return result.navHistory;
    if (Array.isArray(result.data)) return result.data;
    return [];
  }

  function isNavHistory(result: any): boolean {
    const list = extractNavList(result);
    if (list.length === 0) return false;
    const first = list[0];
    return !!(first.date && (first.unitNav || first.accumulatedNav));
  }

  // ============ 保存逻辑 ============
  async function saveOcrResult() {
    if (!ocrResult) return;
    setSaving(true);
    setError("");

    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setError("请先登录");
      setSaving(false);
      return;
    }

    try {
      let saved = 0;

      // ===== 类型 1：净值历史列表 =====
      if (isNavHistory(ocrResult)) {
        const navList = extractNavList(ocrResult);
        const rows = navList
          .map(item => ({
            product_id: productId,
            nav_date: item.date,
            unit_nav: parseFloat(item.unitNav),
            accum_nav: item.accumulatedNav ? parseFloat(item.accumulatedNav) : null,
          }))
          .filter(r => r.nav_date && !isNaN(r.unit_nav));

        if (rows.length === 0) {
          setError("未识别到有效的净值数据");
          setSaving(false);
          return;
        }

        // 批量入库
        const { error: e1 } = await supabase
          .from("nav_history")
          .upsert(rows, { onConflict: "product_id,nav_date" });
        if (e1) throw e1;
        saved = rows.length;

        // 更新 products 最新净值
        const latest = [...rows].sort((a, b) => b.nav_date.localeCompare(a.nav_date))[0];
        await supabase
          .from("products")
          .update({
            unit_nav: latest.unit_nav,
            nav_date: latest.nav_date,
          })
          .eq("id", productId);

        console.log(`✅ 保存 ${saved} 天净值`);
      }

      // ===== 类型 2：持仓详情 / 交易详情 =====
      else {
        const fields = extractFields(ocrResult);
        console.log("📋 提取的字段:", fields);

        // 2.1 如果有产品代码，更新 products
        if (fields.productCode) {
          await supabase
            .from("products")
            .update({
              code: fields.productCode,
              bank_code: fields.productCode,
            })
            .eq("id", productId);
        }

        // 2.2 更新 user_holdings
        const holdingUpdate: any = {};
        if (fields.holdingAmount) holdingUpdate.holding_amount = fields.holdingAmount;
        if (fields.shares) holdingUpdate.shares = fields.shares;
        if (fields.purchaseDate) holdingUpdate.hold_date = fields.purchaseDate;
        if (fields.purchaseAmount) holdingUpdate.purchase_amount = fields.purchaseAmount;

        if (Object.keys(holdingUpdate).length > 0) {
          const { error: e2 } = await supabase
            .from("user_holdings")
            .update(holdingUpdate)
            .eq("user_id", userId)
            .eq("product_id", productId);
          if (e2) throw e2;
          saved += Object.keys(holdingUpdate).length;
        }

        // 2.3 如果识别到"购买金额 + 购买日期"，同步写一条买入交易
        if (fields.purchaseAmount && fields.purchaseDate && !fields.isTransaction) {
          const { data: existingTx } = await supabase
            .from("transactions")
            .select("id")
            .eq("user_id", userId)
            .eq("product_id", productId)
            .eq("trade_date", fields.purchaseDate)
            .maybeSingle();

          if (!existingTx) {
            await supabase.from("transactions").insert({
              user_id: userId,
              product_id: productId,
              type: "buy",
              amount: fields.purchaseAmount,
              shares: fields.shares || null,
              price: fields.unitNav || null,
              trade_date: fields.purchaseDate,
              note: "OCR 识别自动录入",
            });
            saved += 1;
          }
        }
      }

      if (saved === 0) {
        setError("没有识别到可保存的字段");
        setSaving(false);
        return;
      }

      // 清缓存
      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_holdings");
      localStorage.removeItem("cache_transactions");

      window.location.reload();
    } catch (e: any) {
      console.error("保存失败:", e);
      setError("保存失败：" + (e.message || "未知错误"));
      setSaving(false);
    }
  }

  // 从各种可能结构里提取字段
  function extractFields(result: any) {
    const f: any = {
      pageType: result.pageType || "",
      productName: result.productName || "",
      productCode: result.productCode || "",
      holdingAmount: null,
      purchaseAmount: null,
      shares: null,
      unitNav: null,
      accumulatedNav: null,
      navDate: null,
      purchaseDate: null,
      profit: null,
      dailyProfit: null,
      isTransaction: result.pageType === "transaction_detail" || result.pageType === "交易详情",
    };

    // 顶层字段
    const num = (v: any) => {
      if (v === null || v === undefined || v === "") return null;
      const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
      return isNaN(n) ? null : n;
    };

    f.holdingAmount = num(result.holdingAmount || result.持仓金额);
    f.purchaseAmount = num(result.purchaseAmount || result.购买金额);
    f.shares = num(result.shares || result.份额);
    f.unitNav = num(result.unitNav || result.单位净值);
    f.accumulatedNav = num(result.accumulatedNav || result.累计净值);
    f.navDate = result.navDate || result.净值日期 || null;
    f.purchaseDate = result.purchaseDate || result.购买日期 || null;
    f.profit = num(result.profit || result.持仓收益);
    f.dailyProfit = num(result.dailyProfit || result.日收益);

    return f;
  }

  async function runUrlFetch() {
    if (!url.trim()) return setError("请粘贴链接");
    if (!url.startsWith("http")) return setError("链接必须以 http 开头");

    setUrlLoading(true);
    setError("");
    setUrlResult(null);

    try {
      const resp = await fetch("/api/fetch-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, url: url.trim() }),
      });
      const data = await resp.json();
      if (data.success) {
        setUrlResult(data);
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setError(data.error || "抓取失败");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUrlLoading(false);
    }
  }

  function NavRow({ item }: { item: any }) {
    return (
      <tr className="border-b border-gray-100">
        <td className="py-2 text-xs font-mono text-gray-700 px-2">{item.date || "—"}</td>
        <td className="py-2 text-xs font-mono text-gray-700 text-right px-2">
          {item.accumulatedNav || "—"}
        </td>
        <td className="py-2 text-xs font-mono text-gray-900 text-right px-2 font-medium">
          {item.unitNav || "—"}
        </td>
      </tr>
    );
  }

  const FIELD_LABELS: Record<string, string> = {
    pageType: "页面类型",
    productName: "产品名称",
    productCode: "产品代码",
    holdingAmount: "持仓金额",
    purchaseAmount: "购买金额",
    shares: "份额",
    unitNav: "单位净值",
    accumulatedNav: "累计净值",
    navDate: "净值日期",
    purchaseDate: "购买日期",
    profit: "收益",
    dailyProfit: "日收益",
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
      >
        📷 补充数据
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-gray-800">补充产品数据</h3>
              <button onClick={close} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
              <button onClick={() => { setMode("image"); reset(); }} className={`flex-1 py-2 text-xs rounded-md transition ${mode === "image" ? "bg-white text-blue-600 font-medium shadow-sm" : "text-gray-500"}`}>📷 上传截图</button>
              <button onClick={() => { setMode("url"); reset(); }} className={`flex-1 py-2 text-xs rounded-md transition ${mode === "url" ? "bg-white text-blue-600 font-medium shadow-sm" : "text-gray-500"}`}>🔗 粘贴链接</button>
            </div>

            {mode === "image" && (
              <>
                {/* ★ 改后的提示文字 */}
                <div className="text-xs text-gray-500 mb-3 leading-relaxed">
                  上传产品截图，AI 会自动识别图片信息。
                  <div className="text-[10px] text-gray-400 mt-1">
                    支持：持仓详情、交易详情、历史净值等多种页面
                  </div>
                </div>

                <label className="block border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 transition">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    disabled={ocrLoading || !!ocrResult}
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
                  <div className="mt-4 flex flex-col items-center justify-center py-6">
                    <div className="relative w-14 h-14 mb-4">
                      <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
                      <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center text-xl">🤖</div>
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-1">正在识别图片信息...</div>
                    <div className="text-xs text-gray-400">AI 首次识别约需 5-10 秒，请耐心等待</div>
                  </div>
                )}

                {imageFile && !ocrResult && !ocrLoading && (
                  <button
                    onClick={runOCR}
                    className="w-full mt-3 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
                  >
                    开始识别
                  </button>
                )}

                {ocrResult && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-green-600 text-sm">✅</span>
                      <span className="text-sm font-medium text-gray-800">识别成功，请确认</span>
                    </div>

                    {/* 净值历史表格 */}
                    {isNavHistory(ocrResult) && (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="text-xs text-gray-500 mb-2">
                          共识别 {extractNavList(ocrResult).length} 天净值
                        </div>
                        <div className="bg-white rounded-lg max-h-64 overflow-y-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="py-2 text-left text-[10px] font-medium text-gray-500 px-2">日期</th>
                                <th className="py-2 text-right text-[10px] font-medium text-gray-500 px-2">累计净值</th>
                                <th className="py-2 text-right text-[10px] font-medium text-gray-500 px-2">单位净值</th>
                              </tr>
                            </thead>
                            <tbody>
                              {extractNavList(ocrResult).map((item, idx) => (
                                <NavRow key={idx} item={item} />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 其他类型字段列表 */}
                    {!isNavHistory(ocrResult) && (
                      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                        {Object.entries(ocrResult)
                          .filter(([_, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
                          .map(([key, value]) => (
                            <div key={key} className="flex justify-between items-start text-xs py-1.5 border-b border-gray-100 last:border-b-0">
                              <span className="text-gray-500 flex-shrink-0">
                                {FIELD_LABELS[key] || key}
                              </span>
                              <span className="text-gray-900 font-medium text-right ml-3 break-all">
                                {String(value)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}

                    <button
                      onClick={() => { setOcrResult(null); setImageFile(null); setImagePreview(""); }}
                      className="text-[10px] text-blue-600 hover:underline mt-3"
                    >
                      重新上传
                    </button>
                  </div>
                )}
              </>
            )}

            {mode === "url" && (
              <>
                <div className="text-xs text-gray-500 mb-3 leading-relaxed">从 App 复制产品公告页完整链接，粘贴到下方。</div>
                <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={urlLoading} />
                {!urlResult && <button onClick={runUrlFetch} disabled={urlLoading || !url.trim()} className="w-full mt-3 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">{urlLoading ? "抓取中..." : "确认抓取"}</button>}
                {urlResult && <div className="mt-3 bg-green-50 rounded-xl p-3"><div className="text-xs text-green-700 font-medium">✅ 抓取成功</div><div className="text-xs text-gray-700">净值：{urlResult.nav}</div><div className="text-xs text-gray-700">净值日期：{urlResult.navDate}</div></div>}
              </>
            )}

            {error && <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 leading-relaxed">{error}</div>}

            <div className="flex gap-2 mt-4">
              <button onClick={close} disabled={saving} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition">取消</button>
              {mode === "image" && ocrResult && (
                <button onClick={saveOcrResult} disabled={saving} className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition">{saving ? "保存中..." : "确认并保存"}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}