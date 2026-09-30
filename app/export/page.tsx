"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  exportHoldingsCSV,
  exportTransactionsCSV,
  exportAllJSON,
} from "../../lib/exportData";

type Status = { type: "idle" | "loading" | "ok" | "err"; msg?: string };

export default function ExportPage() {
  const router = useRouter();
  const [holdStatus, setHoldStatus] = useState<Status>({ type: "idle" });
  const [txStatus, setTxStatus] = useState<Status>({ type: "idle" });
  const [allStatus, setAllStatus] = useState<Status>({ type: "idle" });

  async function handleExportHoldings() {
    setHoldStatus({ type: "loading" });
    try {
      const n = await exportHoldingsCSV();
      setHoldStatus({ type: "ok", msg: `已导出 ${n} 条持仓` });
    } catch (e: any) {
      setHoldStatus({ type: "err", msg: e.message || "导出失败" });
    }
  }

  async function handleExportTx() {
    setTxStatus({ type: "loading" });
    try {
      const n = await exportTransactionsCSV();
      setTxStatus({ type: "ok", msg: `已导出 ${n} 条交易` });
    } catch (e: any) {
      setTxStatus({ type: "err", msg: e.message || "导出失败" });
    }
  }

  async function handleExportAll() {
    setAllStatus({ type: "loading" });
    try {
      const r = await exportAllJSON();
      setAllStatus({
        type: "ok",
        msg: `已导出：${r.holdings} 持仓 · ${r.transactions} 交易 · ${r.rules} 规则`,
      });
    } catch (e: any) {
      setAllStatus({ type: "err", msg: e.message || "导出失败" });
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-6 max-w-3xl">

        {/* 顶部栏 */}
        <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white border border-slate-200
                       hover:border-slate-300 hover:bg-slate-50
                       flex items-center justify-center flex-shrink-0
                       transition-all duration-300 active:scale-90"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">
              数据导出
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              备份你的理财数据
            </div>
          </div>
        </div>

        {/* 卡片 1：持仓数据 */}
        <ExportCard
          icon="📊"
          iconBg="from-blue-500 to-indigo-600"
          title="持仓数据"
          desc="当前所有持仓产品、金额、份额、净值"
          status={holdStatus}
          onExport={handleExportHoldings}
        />

        {/* 卡片 2：交易记录 */}
        <ExportCard
          icon="📝"
          iconBg="from-amber-500 to-orange-600"
          title="交易记录"
          desc="全部买入 / 赎回历史"
          status={txStatus}
          onExport={handleExportTx}
        />

        {/* 卡片 3：完整备份 */}
        <ExportCard
          icon="💾"
          iconBg="from-violet-500 to-purple-600"
          title="完整备份"
          desc="持仓 + 交易 + 监控规则，JSON 格式"
          status={allStatus}
          onExport={handleExportAll}
        />

        {/* 说明 */}
        <div className="card-tile p-4 mt-5 animate-fade-in-up delay-4">
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <div className="font-medium text-slate-500 mb-1.5">说明</div>
            <div>· 文件保存在你本地设备，不会上传到任何服务器</div>
            <div>· CSV 可用 Excel / WPS / Numbers 打开</div>
            <div>· JSON 是完整备份，未来可用于恢复数据</div>
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}

/* ============ 单个导出卡片 ============ */
function ExportCard({
  icon,
  iconBg,
  title,
  desc,
  status,
  onExport,
}: {
  icon: string;
  iconBg: string;
  title: string;
  desc: string;
  status: Status;
  onExport: () => void;
}) {
  const loading = status.type === "loading";
  return (
    <div className="card p-5 mb-4 animate-fade-in-up">
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-11 h-11 rounded-2xl icon-hi
                        bg-gradient-to-br ${iconBg}
                        flex items-center justify-center
                        shadow-md shadow-slate-200/50 flex-shrink-0`}>
          <span className="text-[20px] relative z-10">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-slate-900">{title}</div>
          <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{desc}</div>
        </div>
      </div>

      <button
        onClick={onExport}
        disabled={loading}
        className="btn-secondary w-full py-2.5 text-[13px] font-medium
                   flex items-center justify-center gap-1.5
                   disabled:opacity-50"
      >
        {loading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            导出中...
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            导出
          </>
        )}
      </button>

      {status.type === "ok" && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-emerald-50 text-[11px] text-emerald-700
                        flex items-center gap-1.5 animate-fade-in">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {status.msg}
        </div>
      )}

      {status.type === "err" && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-rose-50 text-[11px] text-rose-600">
          {status.msg}
        </div>
      )}
    </div>
  );
}