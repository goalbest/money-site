"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getBankInfo } from "../../lib/banks";
import { recalcHoldingFromTransactions } from "../../lib/holdings";
import BankSelect from "../components/BankSelect";
import ParseLinkInput from "../components/ParseLinkInput";

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

const QUICK_AMOUNTS = [
  { label: "1千", value: 1000 },
  { label: "5千", value: 5000 },
  { label: "1万", value: 10000 },
  { label: "5万", value: 50000 },
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function AddPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<"search" | "image" | "manual">("search");

  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [recentAdded, setRecentAdded] = useState<any[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageFullOpen, setImageFullOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrLoaded, setOcrLoaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [nav, setNav] = useState("");
  const [navDate, setNavDate] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const [buyDate, setBuyDate] = useState(todayStr());
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [bank, setBank] = useState("");
  const [note, setNote] = useState("");

  const [existingHolding, setExistingHolding] = useState<any>(null);

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [bankSelectOpen, setBankSelectOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [scrollDir, setScrollDir] = useState<"up" | "down">("up");

  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const lastYRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  /* ★ 用户是否手动改过净值输入框（手改后不再自动覆盖） */
  const navTouchedRef = useRef(false);

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) {
      router.push("/login");
      return;
    }
    setUserId(id);
    (async () => {
      const { data } = await supabase
        .from("user_holdings")
        .select("id, product_id, products(id, name, bank, code)")
        .eq("user_id", id)
        .eq("status", "active")
        .order("id", { ascending: false })
        .limit(5);
      setRecentAdded((data || []).filter((h: any) => h.products));
    })();
  }, [router]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastYRef.current + 8) setScrollDir("down");
      else if (y < lastYRef.current - 8) setScrollDir("up");
      lastYRef.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
        .select("id, name, bank, code, unit_nav, nav_date, daily_return, annualized_1m")
        .or(`name.ilike.%${searchTerm}%,bank.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
        .limit(30);
      setResults(data || []);
      setSearching(false);
      setShowResults(true);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
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

  useEffect(() => {
    if (!userId || !productName.trim()) {
      setExistingHolding(null);
      return;
    }
    const pid = selected?.id;
    if (!pid) {
      setExistingHolding(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("user_holdings")
        .select("id, holding_amount, shares")
        .eq("user_id", userId)
        .eq("product_id", pid)
        .maybeSingle();
      setExistingHolding(data);
    })();
  }, [userId, selected, productName]);

  const handleNavChange = useCallback(
    (v: string) => {
      /* ★ 用户手动改净值 → 打标记，之后不再自动覆盖 */
      navTouchedRef.current = true;
      setNav(v);
      const n = Number(v);
      if (n > 0 && amount && Number(amount) > 0) setShares((Number(amount) / n).toFixed(4));
    },
    [amount]
  );
  const handleAmountChange = useCallback(
    (v: string) => {
      setAmount(v);
      const n = Number(nav);
      if (n > 0 && Number(v) > 0) setShares((Number(v) / n).toFixed(4));
    },
    [nav]
  );
  const handleSharesChange = useCallback(
    (v: string) => {
      setShares(v);
      const n = Number(nav);
      if (n > 0 && Number(v) > 0) setAmount((Number(v) * n).toFixed(2));
    },
    [nav]
  );

  function addQuickAmount(v: number) {
    const str = String(v);
    setAmount(str);
    const n = Number(nav);
    if (n > 0) setShares((v / n).toFixed(4));
  }

  /* ★ 改日期 → 自动查当日净值（仅当用户未手动编辑过） */
  useEffect(() => {
    if (mode === "image") return;
    if (!buyDate || !selected?.id) return;
    if (navTouchedRef.current) return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("nav_history")
        .select("nav_date, unit_nav")
        .eq("product_id", selected.id)
        .lte("nav_date", buyDate)
        .order("nav_date", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (data && data.length > 0) {
        setNav(Number(data[0].unit_nav).toFixed(4));
        setNavDate(data[0].nav_date);
      }
    })();
    return () => { cancelled = true; };
  }, [buyDate, selected]);

  function selectProduct(p: any) {
    /* ★ 换产品 → 重置标记，恢复自动填 */
    navTouchedRef.current = false;
    setSelected(p);
    setSearchTerm(p.name);
    setProductName(p.name);
    setProductCode(p.code || "");
    setBank(p.bank || "");
    setShowResults(false);
  }

  function clearSelected() {
    /* ★ 清空 → 重置标记 */
    navTouchedRef.current = false;
    setSelected(null);
    setSearchTerm("");
    setProductName("");
    setProductCode("");
    setBank("");
    setMsg("");
  }

  function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setOcrLoaded(false);
    setMsg("");
  }

  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) {
      const f = item.getAsFile();
      if (f) handleImageFile(f);
    }
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
      const num = (v: any) => {
        if (v == null || v === "") return null;
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
          if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, prefix + k + ".");
          else if (!Array.isArray(v)) {
            flat[k] = v;
            if (prefix) flat[prefix + k] = v;
          }
        }
      };
      flatten(info);

      const pick = (...keywords: string[]) => {
        for (const kw of keywords)
          if (flat[kw] !== undefined && flat[kw] !== null && flat[kw] !== "") return flat[kw];
        for (const kw of keywords) {
          for (const [k, v] of Object.entries(flat)) {
            if (
              k.toLowerCase().includes(kw.toLowerCase()) &&
              v !== null &&
              v !== "" &&
              typeof v !== "object"
            )
              return v;
          }
        }
        return null;
      };

      const pName = pick("productName", "产品名称", "product_name", "name");
      if (pName)
        setProductName(
          String(pName)
            .replace(/[（(][A-Z0-9]{6,}[)）]\s*$/, "")
            .trim()
        );

      const pCode = pick("productCode", "产品代码", "product_code", "code", "产品编号");
      if (pCode) setProductCode(String(pCode));

      const pDate = pick(
        "purchaseDate",
        "购买日期",
        "申请日期",
        "applicationDate",
        "tradeDate",
        "买入日期",
        "资金扣款日"
      );
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

      if (navNum && amNum && !shNum) setShares((amNum / navNum).toFixed(4));
      if (navNum && shNum && !amNum) setAmount((shNum * navNum).toFixed(2));
      if (amNum && shNum && !navNum) {
        const c = amNum / shNum;
        if (c >= 0.5 && c <= 2.0) setNav(c.toFixed(4));
      }

      if (!bank) {
        const gb = guessBank(String(pName || ""), String(pCode || ""));
        if (gb !== "其他") setBank(gb);
      }

      setOcrLoaded(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setOcrLoading(false);
    }
  }

  async function handleSubmit() {
    if (!productName.trim()) {
      setMsg("请填写产品名称");
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setMsg("请填写有效的购买金额");
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!userId) return;

    setSubmitting(true);
    setMsg("");

    const buyAmt = Number(amount);
    const shareNum = Number(shares) || (nav ? buyAmt / Number(nav) : 0);

    if (!shareNum || shareNum <= 0) {
      setMsg("请填写净值或份额，否则无法计算持仓");
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setSubmitting(false);
      return;
    }

    try {

      let productId: number | null = null;
      if (selected) productId = selected.id;
      else if (productCode.trim()) {
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("code", productCode.trim())
          .maybeSingle();
        if (existing) productId = existing.id;
      }

      if (!productId) {
        const finalBank = bank.trim() || guessBank(productName, productCode);

        let finalBankCode = productCode.trim() || null;
        let finalName = productName.trim();
        let extraFields: any = {};

        try {
          const fillR = await fetch("/api/fill-bank-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: finalName,
              code: finalBankCode,
              bank: finalBank,
            }),
          });
          const fillData = await fillR.json();
          if (fillData.ok && fillData.bank_code) {
            if (fillData.existing_id) {
              productId = fillData.existing_id;
              console.log("产品已存在，复用 id:", productId);
            } else {
              finalBankCode = fillData.bank_code;
              if (fillData.name) finalName = fillData.name;
              extraFields = {
                unit_nav: fillData.unit_nav,
                annual_7d_yield: fillData.annual_7d_yield,
                daily_income: fillData.daily_income,
                risk_level: fillData.risk_level,
                nav_date: fillData.nav_date,
              };
            }
          }
        } catch (e) {
          console.warn("bank_code 补全失败:", e);
        }

        if (!productId) {
          const { data: newProduct, error: insErr } = await supabase
            .from("products")
            .insert({
              name: finalName,
              code: productCode.trim() || null,
              bank: finalBank,
              bank_code: finalBankCode,
              ...extraFields,
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
      }

      /* ★ 先写交易记录，再按交易重算持仓 */

      await supabase.from("transactions").insert({
        user_id: userId,
        product_id: productId,
        type: "buy",
        amount: buyAmt,
        shares: shareNum,
        price: nav ? Number(nav) : null,
        trade_date: buyDate,
        note: note || (existingHolding ? "追加购买" : "首次购买"),
      });

      await recalcHoldingFromTransactions(userId, productId!);

      localStorage.removeItem("cache_home_cache_v3");
      localStorage.removeItem("cache_transactions");
      localStorage.removeItem("cache_holdings");

      setSuccessOpen(true);
      setSubmitting(false);
    } catch (e: any) {
      setMsg("出错：" + e.message);
      setSubmitting(false);
    }
  }

  function resetForm() {
    /* ★ 重置标记 */
    navTouchedRef.current = false;
    setSelected(null);
    setSearchTerm("");
    setImageFile(null);
    setImagePreview("");
    setOcrLoaded(false);
    setNav("");
    setNavDate(null);
    setAmount("");
    setShares("");
    setBuyDate(todayStr());
    setProductName("");
    setProductCode("");
    setBank("");
    setNote("");
    setMsg("");
    setSuccessOpen(false);
    setMode("search");
  }

  const showForm = mode === "manual" || !!selected || ocrLoaded;

  const inferredBank = bank || guessBank(productName, productCode);
  const bankInfo = getBankInfo(inferredBank);

  const groupedResults = results.reduce((acc: Record<string, any[]>, r: any) => {
    const b = r.bank || "其他";
    if (!acc[b]) acc[b] = [];
    acc[b].push(r);
    return acc;
  }, {});

  function highlight(text: string, keyword: string) {
    if (!keyword) return text;
    const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-amber-100 text-amber-800 px-0.5 rounded">
          {text.slice(idx, idx + keyword.length)}
        </mark>
        {text.slice(idx + keyword.length)}
      </>
    );
  }

  const navWarning = nav && (Number(nav) < 0.5 || Number(nav) > 2.0);
  const dateWarning = buyDate > todayStr();

  return (
    <div className="min-h-screen pb-32">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white border border-slate-200
                       hover:border-slate-300 hover:bg-slate-50
                       flex items-center justify-center flex-shrink-0
                       transition-all duration-300 active:scale-90"
            aria-label="返回"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">添加产品</div>
            <div className="text-[12px] text-slate-400 mt-0.5">搜索已有、上传截图、或手动录入</div>
          </div>
        </div>

        <div className="segment-group flex mb-5 animate-fade-in-up">
          <button
            onClick={() => setMode("search")}
            className={`flex-1 py-2.5 text-[13px] segment-item
                        flex items-center justify-center gap-1.5
                        ${mode === "search" ? "segment-item-active" : "hover:text-slate-700"}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            搜索
          </button>
          <button
            onClick={() => setMode("image")}
            className={`flex-1 py-2.5 text-[13px] segment-item
                        flex items-center justify-center gap-1.5
                        ${mode === "image" ? "segment-item-active" : "hover:text-slate-700"}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            截图
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex-1 py-2.5 text-[13px] segment-item
                        flex items-center justify-center gap-1.5
                        ${mode === "manual" ? "segment-item-active" : "hover:text-slate-700"}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            手动
          </button>
        </div>

        {/* 搜索模式 */}
        {mode === "search" && (
          <div className="card p-5 mb-4 animate-fade-in-up delay-1">
            <div ref={searchBoxRef} className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results.length > 0 && !selected) {
                    selectProduct(results[0]);
                  }
                }}
                placeholder="输入产品名、银行或代码"
                className="input-field w-full pl-11 pr-10 py-3.5 text-sm"
                autoFocus
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(""); setSelected(null); setResults([]); }}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              {showResults && !selected && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 max-h-96 overflow-y-auto">
                  {searching ? (
                    <div className="p-6 text-center text-xs text-slate-400">搜索中...</div>
                  ) : results.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="text-xs text-slate-400 mb-3">没有找到该产品</div>
                      <button
                        onClick={() => setMode("manual")}
                        className="text-[12px] text-purple-600 font-medium hover:underline"
                      >
                        手动录入 →
                      </button>
                    </div>
                  ) : (
                    Object.entries(groupedResults).map(([b, list]) => {
                      const bi = getBankInfo(b);
                      return (
                        <div key={b}>
                          <div className="px-4 py-2 bg-slate-50/70 border-b divider
                                          flex items-center gap-2 sticky top-0">
                            <span className="bank-avatar" style={{ background: bi.bg, color: bi.color }}>
                              {bi.label}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-600">{b}</span>
                            <span className="text-[10px] text-slate-400">· {list.length}</span>
                          </div>
                          {list.map((r: any) => (
                            <button
                              key={r.id}
                              onClick={() => selectProduct(r)}
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 active:bg-slate-100
                                         border-b divider last:border-b-0 transition-colors"
                            >
                              <div className="text-[13px] text-slate-900 font-medium leading-snug mb-1">
                                {highlight(r.name, searchTerm)}
                              </div>
                              {r.code && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {highlight(r.code, searchTerm)}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {selected && (
              <div className="mt-4 flex items-center gap-3 p-3 rounded-xl
                              bg-purple-50/60 border border-purple-100">
                <span className="bank-avatar flex-shrink-0"
                      style={{ background: bankInfo.bg, color: bankInfo.color }}>
                  {bankInfo.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-900 font-medium truncate">
                    {selected.name}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {selected.bank}{selected.code ? ` · ${selected.code}` : ""}
                  </div>
                </div>
                <button
                  onClick={clearSelected}
                  className="text-[11px] text-purple-600 font-medium px-2 py-1"
                >
                  重选
                </button>
              </div>
            )}

            {!selected && recentAdded.length > 0 && (
              <div className="mt-5 pt-4 border-t divider">
                <div className="text-[11px] text-slate-400 mb-2.5">最近添加</div>
                <div className="space-y-1">
                  {recentAdded.slice(0, 3).map((h: any) => {
                    const bi = getBankInfo(h.products.bank);
                    return (
                      <button
                        key={h.id}
                        onClick={() => selectProduct(h.products)}
                        className="w-full flex items-center gap-2.5 py-2 px-2 -mx-2
                                   rounded-lg hover:bg-slate-50 transition-colors text-left"
                      >
                        <span className="bank-avatar flex-shrink-0"
                              style={{ background: bi.bg, color: bi.color }}>
                          {bi.label}
                        </span>
                        <span className="text-[12px] text-slate-700 truncate flex-1">
                          {h.products.name}
                        </span>
                        <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 搜不到产品时：粘贴分享链接 */}
        {mode === "search" && !selected && (
          <div className="mb-4 animate-fade-in-up delay-2">
            <div className="flex items-start gap-2.5 mb-2.5 px-1">
              <div className="w-7 h-7 rounded-lg bg-purple-50
                              flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-purple-600" fill="none"
                     stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">搜不到产品？</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  把银行 App 里产品的<b className="text-slate-700">分享链接</b>复制过来，一键添加
                </div>
              </div>
            </div>

            <ParseLinkInput />

            <details className="mt-2.5 rounded-2xl bg-white border border-slate-100 overflow-hidden">
              <summary className="px-4 py-3 text-[12px] font-medium text-slate-700
                                  cursor-pointer flex items-center gap-1.5 select-none
                                  list-none hover:bg-slate-50/60 transition-colors">
                <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0"
                     fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                怎么复制分享链接？
                <svg className="w-3 h-3 text-slate-400 ml-auto flex-shrink-0"
                     fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>

              <div className="px-4 pb-4 pt-1 text-[11px] text-slate-500 leading-relaxed space-y-3
                              border-t border-slate-100">
                <div>
                  <div className="font-semibold text-slate-700 mb-1">① 打开产品页</div>
                  <div>在手机银行 App 里进到该产品详情页，点右上角<b className="text-slate-700">「分享」</b>。</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 mb-1">② 有「复制链接」按钮</div>
                  <div>直接点 <b className="text-slate-700">「复制链接」</b>，回到本页粘贴到输入框。</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 mb-1">③ 只有「分享到微信」</div>
                  <div>先分享到微信（可以发给自己或文件传输助手），在微信里打开这条链接 → 点右上角 <b className="text-slate-700">「...」</b> → 点 <b className="text-slate-700">「复制链接」</b> → 回到本页粘贴。</div>
                </div>
                <div className="pt-2.5 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
                  <b className="text-slate-500">举例：</b>招银 App 的产品页只有"分享到微信"，需要先分享到微信，再在微信里点右上角复制链接。
                </div>
              </div>
            </details>
          </div>
        )}

        {/* 截图模式 */}
        {mode === "image" && (
          <div className="card p-5 mb-4 animate-fade-in-up delay-1" onPaste={handlePaste}>
            <div className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              支持点击、拖拽、或 <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono">Ctrl+V</kbd> 粘贴
            </div>

            {!imagePreview ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleImageFile(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
                            transition-all duration-200
                            ${dragOver
                              ? "border-purple-400 bg-purple-50/50 scale-[1.01]"
                              : "border-slate-200 hover:border-purple-300 hover:bg-purple-50/30"}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
                  className="hidden"
                  disabled={ocrLoading}
                />
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl
                                bg-gradient-to-br from-violet-500 to-purple-600
                                flex items-center justify-center
                                shadow-lg shadow-purple-500/25">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </div>
                <div className="text-[13px] text-slate-700 font-medium">
                  {dragOver ? "松开手指即可上传" : "点击或拖拽上传截图"}
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5">
                  银行APP持仓截图 / 交易记录截图
                </div>
              </div>
            ) : (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="预览"
                  onClick={() => setImageFullOpen(true)}
                  className="w-full max-h-72 object-contain rounded-xl cursor-zoom-in"
                />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(""); setOcrLoaded(false); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur
                             flex items-center justify-center text-white
                             hover:bg-black/70 transition-colors active:scale-90"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {ocrLoading && (
              <div className="mt-4 flex flex-col items-center py-4">
                <div className="relative w-14 h-14 mb-3">
                  <div className="absolute inset-0 rounded-full border-4 border-purple-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-600 animate-spin" />
                </div>
                <div className="text-[13px] font-medium text-slate-700">正在识别图片...</div>
                <div className="text-[11px] text-slate-400 mt-1">约需 5-10 秒</div>
              </div>
            )}

            {imageFile && !ocrLoading && !ocrLoaded && (
              <button
                onClick={runOCR}
                className="btn-primary w-full mt-4 py-3 text-sm font-semibold"
              >
                开始识别
              </button>
            )}

            {ocrLoaded && (
              <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-[12px] text-emerald-700 font-medium">
                    识别完成，请核对下方表单
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 表单区 */}
        {showForm && (
          <div ref={formRef} className="card p-5 mb-4 animate-fade-in-up delay-2">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[14px] font-semibold text-slate-900">
                {mode === "manual" ? "录入信息" : "交易信息"}
              </div>
              {existingHolding && (
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600
                                 text-[10px] font-semibold">
                  已持有 ¥{Number(existingHolding.holding_amount || 0).toFixed(2)}
                </span>
              )}
            </div>

            {selected && (selected.unit_nav != null || selected.daily_return != null) && (
              <div className="mb-4 -mt-1 px-3.5 py-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] text-slate-400 mb-0.5">最新净值</div>
                    <div className="font-mono font-bold text-[13px] text-slate-900 tabular">
                      {selected.unit_nav != null ? Number(selected.unit_nav).toFixed(4) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 mb-0.5">今日涨跌</div>
                    <div className={`font-mono font-bold text-[13px] tabular ${
                      Number(selected.daily_return || 0) > 0 ? "text-rose-500"
                      : Number(selected.daily_return || 0) < 0 ? "text-emerald-500"
                      : "text-slate-400"
                    }`}>
                      {selected.daily_return != null
                        ? `${Number(selected.daily_return) >= 0 ? "+" : ""}${Number(selected.daily_return).toFixed(2)}%`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 mb-0.5">近1月年化</div>
                    <div className={`font-mono font-bold text-[13px] tabular ${
                      Number(selected.annualized_1m || 0) > 0 ? "text-rose-500"
                      : Number(selected.annualized_1m || 0) < 0 ? "text-emerald-500"
                      : "text-slate-400"
                    }`}>
                      {selected.annualized_1m != null
                        ? `${Number(selected.annualized_1m) >= 0 ? "+" : ""}${Number(selected.annualized_1m).toFixed(2)}%`
                        : "—"}
                    </div>
                  </div>
                </div>
                {selected.nav_date && (
                  <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    净值更新至 {selected.nav_date}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">
                  产品名称 <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <span className="bank-avatar" style={{ background: bankInfo.bg, color: bankInfo.color }}>
                      {bankInfo.label}
                    </span>
                  </span>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="输入产品名，自动推断银行"
                    className="input-field w-full pl-14 pr-4 py-3 text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">产品代码</label>
                  <input
                    type="text"
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                    placeholder="如 2401NB006B"
                    className="input-field w-full px-3 py-3 text-[12px] font-mono tabular"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">所属银行</label>
                  <button
                    type="button"
                    onClick={() => setBankSelectOpen(true)}
                    className="input-field w-full px-3 py-3 text-[12px]
                               flex items-center justify-between text-left"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="bank-avatar flex-shrink-0"
                            style={{ background: bankInfo.bg, color: bankInfo.color }}>
                        {bankInfo.label}
                      </span>
                      <span className="truncate">{inferredBank}</span>
                    </span>
                    <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">购买日期</label>
                  <input
                    type="date"
                    value={buyDate}
                    max={todayStr()}
                    onChange={(e) => setBuyDate(e.target.value)}
                    className={`input-field w-full px-3 py-3 text-[12px] tabular ${
                      dateWarning ? "border-rose-300" : ""
                    }`}
                  />
                  {dateWarning && (
                    <div className="text-[10px] text-rose-500 mt-1">日期不能晚于今天</div>
                  )}
                  {navDate && !dateWarning && (
                    <div className="text-[10px] text-slate-400 mt-1">已匹配 {navDate} 净值</div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-2">单位净值</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    value={nav}
                    onChange={(e) => handleNavChange(e.target.value)}
                    placeholder="1.0588"
                    className={`input-field w-full px-3 py-3 text-[13px] font-mono tabular ${
                      navWarning ? "border-amber-300" : ""
                    }`}
                  />
                  {navWarning && (
                    <div className="text-[10px] text-amber-500 mt-1">净值通常 0.5 ~ 2.0</div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">
                  购买金额（元）<span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="10000"
                  className="input-field w-full px-3 py-3.5 text-[16px] font-mono tabular font-semibold"
                />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {QUICK_AMOUNTS.map(q => (
                    <button
                      key={q.value}
                      onClick={() => addQuickAmount(q.value)}
                      className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-600
                                 text-[11px] font-medium hover:bg-purple-100
                                 active:scale-95 transition-all"
                    >
                      {q.label}
                    </button>
                  ))}
                  {amount && (
                    <button
                      onClick={() => handleAmountChange("")}
                      className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500
                                 text-[11px] font-medium hover:bg-slate-200
                                 active:scale-95 transition-all"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">
                  份额
                  {nav && amount && (
                    <span className="ml-1.5 text-purple-500 font-normal">（已自动计算）</span>
                  )}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  value={shares}
                  onChange={(e) => handleSharesChange(e.target.value)}
                  placeholder="自动计算"
                  className="input-field w-full px-3 py-3 text-[15px] font-mono tabular"
                />
                {amount && Number(amount) > 0 && !nav && !shares && (
                  <div className="text-[10px] text-amber-500 mt-1.5 flex items-center gap-1">
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0L3.16 16.25A2 2 0 005 19z" />
                    </svg>
                    未填净值或份额，保存后持仓金额将算不出来
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-2">备注（选填）</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：定投、加仓"
                  className="input-field w-full px-3 py-3 text-[13px]"
                />
              </div>
            </div>

            {msg && (
              <div className="mt-4 text-[13px] text-rose-500 bg-rose-50 rounded-xl px-4 py-3">
                {msg}
              </div>
            )}
          </div>
        )}

        {!showForm && (
          <div className="text-center py-10 animate-fade-in-up delay-3">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100
                            flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="text-[13px] text-slate-400">
              {mode === "search" ? "从上方搜索并选择产品" : "上传截图后自动填充"}
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>

      {/* 底部固定提交栏 */}
      {showForm && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40"
          style={{
            background: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderTop: "1px solid #eef0f5",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="max-w-3xl mx-auto px-5 py-3 flex gap-2">
            <button
              onClick={resetForm}
              className="btn-secondary px-5 py-3 text-[13px] font-medium"
            >
              重置
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary flex-1 py-3 text-[14px] font-semibold disabled:opacity-50"
            >
              {submitting
                ? "保存中..."
                : existingHolding
                ? `追加 ¥${amount || "0"}`
                : "确认添加"}
            </button>
          </div>
        </div>
      )}

      <BankSelect
        open={bankSelectOpen}
        current={inferredBank}
        onClose={() => setBankSelectOpen(false)}
        onSelect={(b) => setBank(b)}
      />

      {imageFullOpen && imagePreview && (
        <div
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setImageFullOpen(false)}
        >
          <img src={imagePreview} alt="放大" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {successOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[100] animate-fade-in"
            style={{ backdropFilter: "blur(4px)" }}
          />
          <div className="fixed inset-0 z-[110] flex items-center justify-center px-6">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full animate-scale-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full
                              bg-gradient-to-br from-violet-500 to-purple-600
                              flex items-center justify-center
                              shadow-lg shadow-purple-500/25">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center mb-6">
                <div className="text-[17px] font-bold text-slate-900 mb-1">添加成功</div>
                <div className="text-[12px] text-slate-400">{productName}</div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={resetForm}
                  className="btn-secondary w-full py-3 text-[13px] font-medium"
                >
                  再添加一个
                </button>
                <button
                  onClick={() => router.push("/holdings")}
                  className="btn-primary w-full py-3 text-[14px] font-semibold"
                >
                  去持仓查看
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}