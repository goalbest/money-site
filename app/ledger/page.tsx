"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getHoldingMarketValue } from "../../lib/holdings";

import DepositTab from "./components/DepositTab";
import SocialTab from "./components/SocialTab";
import GiftTab from "./components/GiftTab";
import NotesTab from "./components/NotesTab";
import LedgerModals from "./components/LedgerModals"; // ★ 注意这里是引用

const TABS = [
  { key: "deposit", label: "资金" },
  { key: "social", label: "人情" },
  { key: "gift", label: "心意" },
  { key: "notes", label: "随手记" },
];

export default function LedgerPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"deposit" | "social" | "gift" | "notes">("deposit");
  const [subTab, setSubTab] = useState<"bin" | "bei">("bin");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [transactions, setTransactions] = useState<any[]>([]);
  const [socials, setSocials] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [realWealthAmount, setRealWealthAmount] = useState(0);

  const [modalType, setModalType] = useState<"deposit" | "social" | "gift" | "notes" | "snapshot" | null>(null);
  const [viewingItem, setViewingItem] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [viewingSocialPerson, setViewingSocialPerson] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
    fetchData(id);
  }, [router]);

  async function fetchData(id: string) {
    const [txRes, socRes, gftRes, noteRes, snapRes, holdingsRes] = await Promise.all([
      supabase.from("ledger_transactions").select("*").eq("user_id", id).order("trade_date", { ascending: false }),
      supabase.from("ledger_social").select("*").eq("user_id", id).order("trade_date", { ascending: false }),
      supabase.from("ledger_gifts").select("*").eq("user_id", id).order("trade_date", { ascending: false }),
      supabase.from("ledger_notes").select("*").eq("user_id", id).order("note_date", { ascending: false }),
      supabase.from("ledger_snapshots").select("*").eq("user_id", id).order("month", { ascending: false }),
      supabase.from("user_holdings").select("*, products(unit_nav)").eq("user_id", id).eq("status", "active")
    ]);
    
    setTransactions(txRes.data || []); 
    setSocials(socRes.data || []); 
    setGifts(gftRes.data || []); 
    setNotes(noteRes.data || []); 
    setSnapshots(snapRes.data || []);

    if (holdingsRes.data) {
      const total = holdingsRes.data.reduce((sum, h) => sum + getHoldingMarketValue(h) + Number(h.in_transit_amount || 0), 0);
      setRealWealthAmount(total);
    }
  }

  function openDetail(item: any, type: "deposit" | "social" | "gift" | "notes") {
    setViewingItem(item);
    setIsEditing(false); 
    setModalType(type);
  }

  function openAdd() {
    setViewingItem(null);
    setIsEditing(true); 
    setModalType(activeTab);
  }

  async function handleDelete(id: string, type: string) {
    if (!confirm("确认删除这条记录吗？")) return;
    const table = type === "deposit" ? "ledger_transactions" : type === "social" ? "ledger_social" : type === "gift" ? "ledger_gifts" : "ledger_notes";
    await supabase.from(table).delete().eq("id", id);
    if (userId) fetchData(userId);
    setModalType(null);
  }

  async function handleArchive(id: string) {
    await supabase.from("ledger_notes").update({ status: "已归档" }).eq("id", id);
    if (userId) fetchData(userId);
  }

  function openSnapshot(monthStr: string) {
    setModalType("snapshot");
  }

  const activeTabIndex = TABS.findIndex(t => t.key === activeTab);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[22px] font-bold tracking-tight text-slate-900">记账本</div>
            <div className="text-[12px] text-slate-400 mt-0.5">流水分析 · 资产透视</div>
          </div>
          <button onClick={() => setIsSearchOpen(!isSearchOpen)} className={`w-9 h-9 flex items-center justify-center rounded-2xl border backdrop-blur-md transition-all ${isSearchOpen ? "bg-purple-50/80 border-purple-200 text-purple-600" : "bg-white/60 border-white/50 text-slate-600"}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </button>
        </div>
        
        <div className={`overflow-hidden transition-all duration-300 ${isSearchOpen ? "max-h-20 mb-4 opacity-100" : "max-h-0 opacity-0"}`}>
          <input type="text" placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-4 py-2.5 bg-white/60 backdrop-blur-md border border-white/50 rounded-2xl text-[13px] outline-none focus:border-purple-400 transition-all" />
        </div>

        <div className="relative flex bg-slate-200/50 backdrop-blur-md p-1 rounded-2xl mb-4 sticky top-2 z-20 border border-white/40 shadow-sm">
          <div className="absolute top-1 bottom-1 bg-white rounded-xl shadow-sm transition-transform duration-300" style={{ width: "calc(25% - 2px)", transform: `translateX(${activeTabIndex * 100}%)`, left: "4px" }} />
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key as any); setSearchTerm(""); setIsSearchOpen(false); }} className={`flex-1 py-2.5 text-[13px] font-medium relative z-10 transition-colors rounded-xl ${activeTab === tab.key ? "text-purple-600" : "text-slate-500"}`}>{tab.label}</button>
          ))}
        </div>

        {activeTab === "deposit" && (
          <DepositTab 
            transactions={transactions} snapshots={snapshots} realWealthAmount={realWealthAmount}
            searchTerm={searchTerm} openSnapshot={openSnapshot} openDetail={openDetail}
          />
        )}
        {activeTab === "social" && (
          <SocialTab 
            socials={socials} subTab={subTab} setSubTab={setSubTab} 
            searchTerm={searchTerm} openDetail={openDetail} setViewingSocialPerson={setViewingSocialPerson}
          />
        )}
        {activeTab === "gift" && (
          <GiftTab 
            gifts={gifts} subTab={subTab} setSubTab={setSubTab} 
            searchTerm={searchTerm} openDetail={openDetail}
          />
        )}
        {activeTab === "notes" && (
          <NotesTab 
            notes={notes} openDetail={openDetail} handleArchive={handleArchive} handleDelete={handleDelete}
          />
        )}
      </div>

      <button onClick={openAdd} className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full bg-white/30 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.15)] text-purple-700 hover:text-purple-800 active:scale-90 transition-all duration-300" style={{ bottom: "calc(100px + env(safe-area-inset-bottom))", right: "20px" }}>
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      </button>

      <LedgerModals 
        modalType={modalType} setModalType={setModalType}
        viewingItem={viewingItem} isEditing={isEditing} setIsEditing={setIsEditing}
        viewingSocialPerson={viewingSocialPerson} setViewingSocialPerson={setViewingSocialPerson}
        userId={userId} activeTab={activeTab} subTab={subTab} 
        fetchData={fetchData} handleDelete={handleDelete}
        snapshots={snapshots} realWealthAmount={realWealthAmount}
        transactions={transactions} // ★ 加上这一行，传入流水
      />
    </div>
  );
}