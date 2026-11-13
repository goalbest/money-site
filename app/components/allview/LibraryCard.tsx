"use client";

import Link from "next/link";
import { getBankInfo } from "../../../lib/banks";

export default function LibraryCard({ h, navHistory, onToggleWatch }: any) {
  const p = h.products;
  const bankInfo = getBankInfo(p.bank);
  const allNavs = navHistory[p.id] || [];
  const wanfen = allNavs.length >= 2 ? (allNavs[allNavs.length-1].nav - allNavs[allNavs.length-2].nav) * 10000 : 0;
  const navValue = Number(p.unit_nav || 0).toFixed(4);
  const annual1m = Number(p.annualized_1m || 0);

  return (
    <Link href={`/product/${p.id}`} className="card mb-3 overflow-hidden block hover:bg-slate-50 transition-colors">
      <div className="px-4 py-3 border-b divider bg-slate-50/30 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 pr-4">
          <span className="bank-avatar flex-shrink-0" style={{ background: bankInfo.bg, color: bankInfo.color }}>{bankInfo.label}</span>
          <div className="text-[14px] text-slate-900 font-medium leading-snug truncate">{p.name}</div>
        </div>
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWatch(Number(p.id), e); }} 
          className="p-1 -mt-1 -mr-1 text-slate-300 hover:text-amber-400"
        >
          <svg className={`w-5 h-5 ${h.isWatched ? "fill-amber-400 text-amber-400" : "fill-transparent"}`} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
      </div>
      <div className="px-4 py-3 grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] text-slate-400 mb-1">最新净值</div>
          <div className="font-mono font-bold text-[14px] text-slate-900 truncate">{navValue}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-slate-400 mb-1">万收</div>
          <div className={`font-mono font-semibold text-[14px] ${wanfen > 0 ? "text-rose-500" : wanfen < 0 ? "text-emerald-500" : "text-slate-300"}`}>
            {allNavs.length < 2 ? "-" : (wanfen >= 0 ? "+" : "") + wanfen.toFixed(2)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400 mb-1">近1月年化</div>
          <div className={`font-mono font-semibold text-[14px] ${annual1m > 0 ? "text-rose-500" : annual1m < 0 ? "text-emerald-500" : "text-slate-300"}`}>
            {annual1m > 0 ? "+" : ""}{annual1m.toFixed(2)}%
          </div>
        </div>
      </div>
    </Link>
  );
}