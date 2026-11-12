"use client";

import { useState, useMemo } from "react";
import Pagination from "./Pagination";

export default function SocialTab({ socials, subTab, setSubTab, searchTerm, openDetail, setViewingSocialPerson }: any) {
  const [socialView, setSocialView] = useState<"list" | "summary">("summary");
  const [socialStatus, setSocialStatus] = useState("all");
  const [socialSort, setSocialSort] = useState("default");
  const [socialSortDesc, setSocialSortDesc] = useState(true);
  const [listSort, setListSort] = useState("date");
  const [listSortDesc, setListSortDesc] = useState(true);
  const [socialPage, setSocialPage] = useState(1);

  const PAGE_SIZE = 20;

  const socialSummary = useMemo(() => {
    const data = socials.filter((s: any) => s.owner === (subTab === "bin" ? "斌" : "贝"));
    let sendTotal = 0, recvTotal = 0;
    const peopleMap = new Map<string, { send: number, recv: number }>();
    data.forEach((s: any) => {
      const amt = Number(s.amount);
      if (!peopleMap.has(s.person)) peopleMap.set(s.person, { send: 0, recv: 0 });
      const p = peopleMap.get(s.person)!;
      if (s.type === "送") { sendTotal += amt; p.send += amt; }
      else { recvTotal += amt; p.recv += amt; }
    });
    let pendingCount = 0, settledCount = 0, pendingAmount = 0;
    peopleMap.forEach(p => {
      const net = p.recv - p.send;
      if (net > 0) { pendingCount++; pendingAmount += net; }
      else { settledCount++; }
    });
    return { sendTotal, recvTotal, netRecv: recvTotal - sendTotal, pendingCount, settledCount, pendingAmount, totalCount: data.length, totalPeople: peopleMap.size };
  }, [socials, subTab]);

  const socialAnalytics = useMemo(() => {
    const data = socials.filter((s: any) => s.owner === (subTab === "bin" ? "斌" : "贝"));
    const map: Record<string, { person: string, send: number, recv: number }> = {};
    data.forEach((s: any) => {
      if (!map[s.person]) map[s.person] = { person: s.person, send: 0, recv: 0 };
      if (s.type === "送") map[s.person].send += Number(s.amount);
      else map[s.person].recv += Number(s.amount);
    });
    let list = Object.values(map);
    if (searchTerm) list = list.filter(item => item.person.includes(searchTerm));
    
    if (socialStatus === "unsettled") list = list.filter(item => item.send !== item.recv); 
    else if (socialStatus === "to_receive") list = list.filter(item => item.recv > item.send); 
    else if (socialStatus === "to_return") list = list.filter(item => item.send > item.recv); 
    else if (socialStatus === "settled") list = list.filter(item => item.send === item.recv);
    
    if (socialSort === "amount") list.sort((a, b) => (b.send + b.recv) - (a.send + a.recv));
    else if (socialSort === "name") list.sort((a, b) => a.person.localeCompare(b.person, 'zh-CN'));
    else list.sort((a, b) => Math.abs(b.send - b.recv) - Math.abs(a.send - a.recv)); 

    if (!socialSortDesc) list.reverse(); 
    return list;
  }, [socials, subTab, socialStatus, socialSort, socialSortDesc, searchTerm]);

  const socialListData = useMemo(() => {
    let data = socials.filter((s: any) => s.owner === (subTab === "bin" ? "斌" : "贝"));
    if (searchTerm) data = data.filter((s: any) => s.person.includes(searchTerm) || (s.reason || "").includes(searchTerm));
    data.sort((a: any, b: any) => {
      let diff = 0;
      if (listSort === "date") diff = new Date(b.trade_date).getTime() - new Date(a.trade_date).getTime();
      else if (listSort === "amount") diff = Number(b.amount) - Number(a.amount);
      else if (listSort === "name") diff = a.person.localeCompare(b.person, 'zh-CN');
      return listSortDesc ? diff : -diff;
    });
    return data;
  }, [socials, subTab, listSort, listSortDesc, searchTerm]);

  const paginatedSocials = socialAnalytics.slice((socialPage - 1) * PAGE_SIZE, socialPage * PAGE_SIZE);
  const paginatedSocialList = socialListData.slice((socialPage - 1) * PAGE_SIZE, socialPage * PAGE_SIZE);

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex justify-between items-center">
          <div className="relative inline-flex bg-slate-200/50 backdrop-blur-md p-1 rounded-full border border-white/40 shadow-sm">
            <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300" style={{ width: "calc(50% - 2px)", transform: `translateX(${subTab === "bin" ? 0 : 100}%)`, left: "4px" }} />
            <button onClick={() => setSubTab("bin")} className={`px-6 py-1.5 rounded-full text-[12px] font-medium relative z-10 transition-colors ${subTab === "bin" ? "text-purple-600" : "text-slate-500"}`}>斌</button>
            <button onClick={() => setSubTab("bei")} className={`px-6 py-1.5 rounded-full text-[12px] font-medium relative z-10 transition-colors ${subTab === "bei" ? "text-purple-600" : "text-slate-500"}`}>贝</button>
          </div>
          <div className="relative inline-flex bg-slate-200/50 backdrop-blur-md p-1 rounded-full border border-white/40 shadow-sm">
            <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300" style={{ width: "calc(50% - 2px)", transform: `translateX(${socialView === "list" ? 0 : 100}%)`, left: "4px" }} />
            <button onClick={() => setSocialView("list")} className={`px-5 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${socialView === "list" ? "text-purple-600" : "text-slate-500"}`}>流水</button>
            <button onClick={() => setSocialView("summary")} className={`px-5 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${socialView === "summary" ? "text-purple-600" : "text-slate-500"}`}>按人算</button>
          </div>
        </div>
        
        {socialView === "list" && (
          <div className="flex justify-end items-center mt-2">
            <div className="flex items-center gap-1 bg-white/80 backdrop-blur-md border border-white/50 rounded-xl px-2 py-1 shadow-sm">
              <select value={listSort} onChange={e => setListSort(e.target.value)} className="text-[11px] text-slate-500 bg-transparent outline-none cursor-pointer py-0.5">
                <option value="date">按时间排</option><option value="amount">按金额排</option><option value="name">按姓名排</option>
              </select>
              <div className="w-px h-3 bg-slate-200 mx-1"></div>
              <button onClick={() => setListSortDesc(!listSortDesc)} className="p-0.5 hover:bg-slate-50 rounded text-slate-500 transition-colors">
                {listSortDesc ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>}
              </button>
            </div>
          </div>
        )}

        {socialView === "summary" && (
          <div className="flex justify-between items-center mt-2 flex-wrap gap-2">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {[{ key: "all", label: "全部" }, { key: "unsettled", label: "未清" }, { key: "to_receive", label: "待收" }, { key: "to_return", label: "待回" }, { key: "settled", label: "平衡" }].map(s => (
                <button key={s.key} onClick={() => setSocialStatus(s.key)} className={`px-3 py-1 rounded-xl text-[11px] border transition-all shrink-0 ${socialStatus === s.key ? "bg-purple-50 text-purple-600 border-purple-200 font-medium shadow-sm" : "bg-white/80 backdrop-blur border-white/50 text-slate-500"}`}>{s.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-white/80 backdrop-blur-md border border-white/50 rounded-xl px-2 py-1 shadow-sm">
              <select value={socialSort} onChange={e => setSocialSort(e.target.value)} className="text-[11px] text-slate-500 bg-transparent outline-none cursor-pointer py-0.5">
                <option value="default">按差额排</option><option value="amount">按总额排</option><option value="name">按姓名排</option>
              </select>
              <div className="w-px h-3 bg-slate-200 mx-1"></div>
              <button onClick={() => setSocialSortDesc(!socialSortDesc)} className="p-0.5 hover:bg-slate-50 rounded text-slate-500 transition-colors">
                {socialSortDesc ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gradient-to-br from-indigo-50/80 to-white backdrop-blur-md rounded-3xl p-4 shadow-sm border border-indigo-100/50 flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 mb-1">待回礼 (净人情)</div>
          <div className="text-[24px] font-bold text-slate-900 font-mono tracking-tight mb-2">¥{socialSummary.pendingAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</div>
          <div className="text-[10px] text-slate-400 flex items-center gap-2">
            <span className="bg-emerald-50/80 text-emerald-600 px-1.5 py-0.5 rounded font-medium">{socialSummary.pendingCount} 人待回</span>
            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{socialSummary.settledCount} 人已平</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-50/80 to-white backdrop-blur-md rounded-3xl p-4 shadow-sm border border-blue-100/50 flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 mb-1 flex justify-between">
            <span>礼金往来总览</span><span className="text-[9px] bg-slate-100/80 text-slate-500 px-1 rounded">{socialSummary.totalCount} 笔</span>
          </div>
          <div className="flex flex-col gap-1 mb-2">
            <div className="flex justify-between items-center"><span className="text-[11px] text-slate-400">送出</span><span className="text-[14px] font-bold font-mono text-emerald-600">¥{socialSummary.sendTotal.toLocaleString()}</span></div>
            <div className="flex justify-between items-center"><span className="text-[11px] text-slate-400">收到</span><span className="text-[14px] font-bold font-mono text-rose-500">¥{socialSummary.recvTotal.toLocaleString()}</span></div>
          </div>
          <div className="text-[10px] text-slate-400 border-t border-slate-200/50 pt-2 flex justify-between items-center">
            <span>共 {socialSummary.totalPeople} 人</span>
            <span className={`font-bold px-1.5 py-0.5 rounded ${socialSummary.netRecv >= 0 ? "text-emerald-600 bg-emerald-50/50" : "text-rose-500 bg-rose-50/50"}`}>净收 {socialSummary.netRecv >= 0 ? '+' : ''}{socialSummary.netRecv.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {socialView === "summary" ? (
        <>
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 overflow-hidden">
            {paginatedSocials.map(s => {
              const net = s.send - s.recv;
              return (
                <div key={s.person} onClick={() => setViewingSocialPerson(s.person)} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors cursor-pointer">
                  <div className="text-[14px] font-medium text-slate-800">{s.person}</div>
                  <div className="flex items-center gap-5">
                    <div className="text-right"><div className="text-[10px] text-slate-400 mb-0.5">送出</div><div className="text-[13px] text-slate-600 font-mono font-medium">{s.send > 0 ? s.send : "-"}</div></div>
                    <div className="text-right"><div className="text-[10px] text-slate-400 mb-0.5">收到</div><div className="text-[13px] text-rose-500 font-mono font-medium">{s.recv > 0 ? s.recv : "-"}</div></div>
                    <div className="w-[70px] flex justify-end">
                      {net > 0 && <span className="px-2 py-1 rounded-md text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-100">待收 {net}</span>}
                      {net < 0 && <span className="px-2 py-1 rounded-md text-[10px] bg-amber-50 text-amber-600 border border-amber-100">待回 {Math.abs(net)}</span>}
                      {net === 0 && <span className="px-2 py-1 rounded-md text-[10px] bg-slate-50 text-slate-400 border border-slate-200">已平</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={socialPage} setPage={setSocialPage} total={socialAnalytics.length} />
        </>
      ) : (
        <>
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 overflow-hidden">
            {paginatedSocialList.map(s => (
              <div key={s.id} onClick={() => openDetail(s, "social")} className="group px-5 py-3.5 border-b border-slate-100 last:border-b-0 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-[14px]">{s.person.slice(0,1)}</div>
                  <div>
                    <div className="text-[13px] font-medium text-slate-800">{s.person} · {s.type}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{s.trade_date} · {s.reason}</div>
                  </div>
                </div>
                <div className={`font-mono font-bold text-[15px] ${s.type === "送" ? "text-emerald-600" : "text-rose-500"}`}>{s.type === "送" ? "-" : "+"}{Number(s.amount).toFixed(2)}</div>
              </div>
            ))}
          </div>
          <Pagination page={socialPage} setPage={setSocialPage} total={socialListData.length} />
        </>
      )}
    </div>
  );
}