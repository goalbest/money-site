"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ParseLinkInput() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleParse() {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const r = await fetch("/api/parse-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await r.json();

      if (!r.ok || data.error) {
        setResult({ ok: false, msg: data.error || "解析失败" });
      } else {
        setResult({ ok: true, msg: data.message || "添加成功" });
        setUrl("");
        // 2 秒后刷新，让产品列表更新
        setTimeout(() => router.refresh(), 2000);
      }
    } catch (e: any) {
      setResult({ ok: false, msg: `网络错误: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600
                        flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor"
               viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div>
          <div className="text-[14px] font-bold text-slate-900">粘贴产品链接</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            从银行 App 分享的产品链接，一键添加
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleParse()}
          placeholder="https://u.psbc.com/xxxxx"
          className="input-field flex-1 px-3.5 py-3 text-sm"
          disabled={loading}
        />
        <button
          onClick={handleParse}
          disabled={loading || !url.trim()}
          className="btn-primary px-5 py-3 text-[13px] whitespace-nowrap
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "解析中..." : "解析"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-3 px-3.5 py-2.5 rounded-xl text-[12px] font-medium ${
            result.ok
              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
              : "bg-rose-50 text-rose-700 border border-rose-100"
          }`}
        >
          {result.msg}
        </div>
      )}
    </div>
  );
}