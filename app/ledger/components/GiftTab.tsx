"use client";

import { useState, useMemo } from "react";
import Pagination from "./Pagination";

export default function GiftTab({ gifts, subTab, setSubTab, searchTerm, openDetail }: any) {
  const [giftView, setGiftView] = useState<"list" | "by_person" | "by_year">("list");
  const [giftPage, setGiftPage] = useState(1);
  const PAGE_SIZE = 20;

  const giftSummary = useMemo(() => {
    const data = gifts.filter((g: any) => g.owner === (subTab === "bin" ? "斌" : "贝"));
    let totalGift = 0, thisYearGift = 0, thisYearCount = 0;
    const currentYear = new Date().getFullYear().toString();
    const personGiftMap = new Map<string, number>();
    data.forEach((g: any) => {
      const amt = Number(g.amount); totalGift += amt;
      if (g.trade_date.startsWith(currentYear)) { thisYearGift += amt; thisYearCount++; }
      personGiftMap.set(g.person, (personGiftMap.get(g.person) || 0) + amt);
    });
    let maxAmount = 0, maxPerson = "";
    personGiftMap.forEach((amt, person) => { if (amt > maxAmount) { maxAmount = amt; maxPerson = person; } });
    return { totalGift, thisYearGift, thisYearCount, maxAmount, maxPerson, totalPeople: personGiftMap.size };
  }, [gifts, subTab]);

  const giftAnalytics = useMemo(() => {
    let data = gifts.filter((g: any) => g.owner === (subTab === "bin" ? "斌" : "贝"));
    if (searchTerm) data = data.filter((g: any) => g.person.includes(searchTerm));
    const personMap: Record<string, number> = {}; const yearMap: Record<string, number> = {};
    data.forEach((g: any) => {
      personMap[g.person] = (personMap[g.person] || 0) + Number(g.amount);
      const y = g.trade_date.slice(0, 4); yearMap[y] = (yearMap[y] || 0) + Number(g.amount);
    });
    return {
      byPerson: Object.entries(personMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      byYear: Object.entries(yearMap).map(([year, amount]) => ({ year, amount })).sort((a, b) => b.year.localeCompare(a.year)),
      filteredList: data
    };
  }, [gifts, subTab, searchTerm]);

  const paginatedGifts = giftAnalytics.filteredList.slice((giftPage - 1) * PAGE_SIZE, giftPage * PAGE_SIZE);

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <div className="relative inline-flex bg-slate-200/50 backdrop-blur-md p-1 rounded-full border border-white/40 shadow-sm">
          <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300" style={{ width: "calc(50% - 2px)", transform: `translateX(${subTab === "bin" ? 0 : 100}%)`, left: "4px" }} />
          <button onClick={() => setSubTab("bin")} className={`px-6 py-1.5 rounded-full text-[12px] font-medium relative z-10 transition-colors ${subTab === "bin" ? "text-purple-600" : "text-slate-500"}`}>斌</button>
          <button onClick={() => setSubTab("bei")} className={`px-6 py-1.5 rounded-full text-[12px] font-medium relative z-10 transition-colors ${subTab === "bei" ? "text-purple-600" : "text-slate-500"}`}>贝</button>
        </div>
        <div className="relative inline-flex bg-slate-200/50 backdrop-blur-md p-1 rounded-full border border-white/40 shadow-sm">
          <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300" style={{ width: "calc(33.33% - 2px)", transform: `translateX(${giftView === "list" ? 0 : giftView === "by_person" ? 100 : 200}%)`, left: "4px" }} />
          <button onClick={() => setGiftView("list")} className={`px-3 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${giftView === "list" ? "text-purple-600" : "text-slate-500"}`}>明细</button>
          <button onClick={() => setGiftView("by_person")} className={`px-3 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${giftView === "by_person" ? "text-purple-600" : "text-slate-500"}`}>按人</button>
          <button onClick={() => setGiftView("by_year")} className={`px-3 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${giftView === "by_year" ? "text-purple-600" : "text-slate-500"}`}>按年</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gradient-to-br from-indigo-50/80 to-white backdrop-blur-md rounded-3xl p-4 shadow-sm border border-indigo-100/50 flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 mb-1">累计心意支出</div>
          <div className="text-[24px] font-bold text-slate-900 font-mono tracking-tight mb-2">¥{giftSummary.totalGift.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</div>
          <div className="text-[10px] text-slate-400 flex items-center gap-2">
            <span className="bg-slate-100/80 text-slate-600 px-1.5 py-0.5 rounded font-medium">今年 ¥{giftSummary.thisYearGift.toLocaleString()}</span>
            <span className="bg-slate-100/80 text-slate-600 px-1.5 py-0.5 rounded font-medium">{giftSummary.thisYearCount} 次</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-50/80 to-white backdrop-blur-md rounded-3xl p-4 shadow-sm border border-blue-100/50 flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 mb-1">按人看份量最重</div>
          <div className="text-[24px] font-bold text-slate-900 font-mono tracking-tight mb-2">¥{giftSummary.maxAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</div>
          <div className="text-[10px] text-slate-400 flex items-center gap-2">
            <span className="bg-purple-50/80 text-purple-600 px-1.5 py-0.5 rounded font-medium">最多：{giftSummary.maxPerson || "-"}</span>
            <span>共 {giftSummary.totalPeople} 人</span>
          </div>
        </div>
      </div>

      {giftView === "list" && (
        <>
          <div className="space-y-3">
            {paginatedGifts.map(g => (
              <div key={g.id} onClick={() => openDetail(g, "gift")} className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 p-4 group cursor-pointer hover:bg-slate-50/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">🎁</span>
                    <div>
                      <div className="text-[14px] font-bold text-slate-800">给 {g.person}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{g.trade_date} · {g.occasion}</div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-[16px] text-emerald-600">-{Number(g.amount).toFixed(2)}</div>
                </div>
                <div className="text-[12px] text-slate-600 bg-white/60 p-2.5 rounded-xl mt-3 border border-slate-100">{g.details || "无详细说明"}</div>
              </div>
            ))}
          </div>
          <Pagination page={giftPage} setPage={setGiftPage} total={giftAnalytics.filteredList.length} />
        </>
      )}

      {giftView === "by_person" && (
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 overflow-hidden">
          {giftAnalytics.byPerson.map(p => (
            <div key={p.name} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
              <div className="text-[14px] font-medium text-slate-800">{p.name}</div>
              <div className="font-mono font-bold text-[15px] text-emerald-600">-{p.amount.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}

      {giftView === "by_year" && (
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 overflow-hidden">
          {giftAnalytics.byYear.map(y => (
            <div key={y.year} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
              <div className="text-[14px] font-medium text-slate-800">{y.year} 年</div>
              <div className="font-mono font-bold text-[15px] text-emerald-600">-{y.amount.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}