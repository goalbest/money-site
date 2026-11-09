"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import * as XLSX from "xlsx";
import { getHoldingMarketValue } from "../../lib/holdings";

type TabType = "deposit" | "social" | "gift" | "notes";
type SubTabType = "bin" | "bei";
type SocialViewMode = "list" | "summary";
type SocialStatusFilter = "all" | "unsettled" | "to_receive" | "to_return" | "settled";
type GiftViewMode = "list" | "by_person" | "by_year";
type SocialSort = "default" | "amount" | "name";
type ListSort = "date" | "amount" | "name";

const TABS = [
  { key: "deposit", label: "资金" },
  { key: "social", label: "人情" },
  { key: "gift", label: "心意" },
  { key: "notes", label: "随手记" },
];

const DEFAULT_ACCOUNTS = ["余额", "理财", "基金", "股票", "借款", "日常"];
const PRESET_CATEGORIES = ["理财收益", "大额消费", "教育", "日常", "其他"];
const NOTE_TARGETS = ["存款", "人情·斌", "人情·贝", "心意·斌", "心意·贝", "待定"];
const PAGE_SIZE = 20;

function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = val;
    let end = target;
    let startTime: number | null = null;
    let animationFrame: number;
    
    function animate(time: number) {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      setVal(start + (end - start) * ease);
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    }
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [target, duration]);
  return val;
}

export default function LedgerPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("deposit");
  const [subTab, setSubTab] = useState<SubTabType>("bin");

  // 搜索与分页
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [depositPage, setDepositPage] = useState(1);
  const [socialPage, setSocialPage] = useState(1);
  const [giftPage, setGiftPage] = useState(1);

  // 视图模式
  const [socialView, setSocialView] = useState<SocialViewMode>("summary");
  const [socialStatus, setSocialStatus] = useState<SocialStatusFilter>("all");
  const [socialSort, setSocialSort] = useState<SocialSort>("default");
  const [socialSortDesc, setSocialSortDesc] = useState(true); 
  const [listSort, setListSort] = useState<ListSort>("date");
  const [listSortDesc, setListSortDesc] = useState(true);
  const [giftView, setGiftView] = useState<GiftViewMode>("list");
  
  // ★ 大卡片折叠状态
  const [isAssetExpanded, setIsAssetExpanded] = useState(false);

  // 月报年份切换
  const currentYearStr = new Date().getFullYear().toString();
  const [viewYear, setViewYear] = useState(currentYearStr);
  const listRef = useRef<HTMLDivElement>(null);
  
  // 数据
  const [transactions, setTransactions] = useState<any[]>([]);
  const [socials, setSocials] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [realWealthAmount, setRealWealthAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // 弹窗与详情/编辑状态
  const [modalType, setModalType] = useState<TabType | "snapshot" | null>(null);
  const [viewingItem, setViewingItem] = useState<any>(null); 
  const [isEditing, setIsEditing] = useState(false); 
  const [viewingSocialPerson, setViewingSocialPerson] = useState<string | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // 智能提示状态
  const [showNameSuggest, setShowNameSuggest] = useState(false);
  const [showReasonSuggest, setShowReasonSuggest] = useState(false);
  const [showAccountSuggest, setShowAccountSuggest] = useState(false);

  // 资金表单状态
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [depositType, setDepositType] = useState<"转入" | "转出">("转入");
  const [depositAccount, setDepositAccount] = useState("余额");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [depositCategory, setDepositCategory] = useState("日常");
  const [showCategorySuggest, setShowCategorySuggest] = useState(false);

  // 人情表单状态
  const [socialName, setSocialName] = useState("");
  const [socialType, setSocialType] = useState<"送" | "收">("送");
  const [socialAmount, setSocialAmount] = useState("");
  const [socialReason, setSocialReason] = useState("");

  // 心意表单状态
  const [giftName, setGiftName] = useState("");
  const [giftOccasion, setGiftOccasion] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftDetails, setGiftDetails] = useState("");

  // 随手记表单状态
  const [noteContent, setNoteContent] = useState("");
  const [noteAmount, setNoteAmount] = useState("");
  const [noteTarget, setNoteTarget] = useState("存款");

  // 对账表单状态
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().split("T")[0]); 
  const [snapshotStart, setSnapshotStart] = useState("");
  const [snapshotTotal, setSnapshotTotal] = useState("");
  const [snapshotDetails, setSnapshotDetails] = useState<{name: string, amount: string, isLocked?: boolean}[]>([]);

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) { router.push("/login"); return; }
    setUserId(id);
    fetchData(id);
  }, [router]);

  useEffect(() => { 
    setDepositPage(1); setSocialPage(1); setGiftPage(1); 
  }, [searchTerm, activeTab, socialView, giftView, socialStatus, socialSort, socialSortDesc, listSort, listSortDesc]);

  useEffect(() => {
    if (modalType === "snapshot") {
      const sum = snapshotDetails.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      setSnapshotTotal(sum > 0 ? sum.toString() : "");
    }
  }, [snapshotDetails, modalType]);

  async function fetchData(id: string) {
    setLoading(true);
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

    setLoading(false);
  }

  // 动态提取所有历史账户名
  const allAccountNames = useMemo(() => {
    const names = new Set<string>(DEFAULT_ACCOUNTS);
    transactions.forEach(t => { if (t.account) names.add(t.account); });
    snapshots.forEach(s => {
      if (s.details) {
        Object.keys(s.details).forEach(k => {
          if (k !== "_order" && k !== "_locked" && k !== "start_balance" && k !== "snapshotDate") names.add(k);
        });
      }
    });
    return Array.from(names);
  }, [transactions, snapshots]);

  const existingNames = useMemo(() => {
    const names = new Set<string>();
    socials.forEach(s => names.add(s.person));
    gifts.forEach(g => names.add(g.person));
    return Array.from(names);
  }, [socials, gifts]);

  const existingReasons = useMemo(() => {
    const reasons = new Set<string>();
    socials.forEach(s => { if (s.reason) reasons.add(s.reason); });
    return Array.from(reasons);
  }, [socials]);

  async function handleDelete(id: string, type: TabType) {
    if (!confirm("确认删除这条记录吗？")) return;
    const table = type === "deposit" ? "ledger_transactions" : type === "social" ? "ledger_social" : type === "gift" ? "ledger_gifts" : "ledger_notes";
    await supabase.from(table).delete().eq("id", id);
    if (userId) fetchData(userId);
  }

  async function handleDeleteSnapshot(month: string) {
    if (!confirm("确认删除此月的对账记录吗？")) return;
    await supabase.from("ledger_snapshots").delete().eq("user_id", userId).eq("month", month);
    setModalType(null);
    if (userId) fetchData(userId);
  }

  async function handleArchive(id: string) {
    await supabase.from("ledger_notes").update({ status: "已归档" }).eq("id", id);
    if (userId) fetchData(userId);
  }

  function handleExport() {
    if (transactions.length === 0 && socials.length === 0 && gifts.length === 0 && notes.length === 0 && snapshots.length === 0) {
      alert("当前没有数据可导出！");
      return;
    }
    try {
      const wb = XLSX.utils.book_new();

      if (transactions.length > 0) {
        const txData = transactions.map(t => ({ 
          "记录ID": t.id, "日期": t.trade_date, "账户": t.account, "收支": t.type, 
          "金额(元)": Number(t.amount), "分类": t.category, "摘要/备注": t.note || ""
        })).sort((a, b) => b["日期"].localeCompare(a["日期"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txData), "资金流水");
      }

      if (socials.length > 0) {
        const socialData = socials.map(s => ({ 
          "记录ID": s.id, "日期": s.trade_date, "姓名": s.person, "方向": s.type, 
          "金额(元)": Number(s.amount), "事由/备注": s.reason || "", "所属(斌/贝)": s.owner
        })).sort((a, b) => b["日期"].localeCompare(a["日期"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(socialData), "人情往来");
      }

      if (gifts.length > 0) {
        const giftData = gifts.map(g => ({ 
          "记录ID": g.id, "日期": g.trade_date, "给谁": g.person, "场合": g.occasion || "", 
          "金额(元)": Number(g.amount), "礼品明细": g.details || "", "所属(斌/贝)": g.owner
        })).sort((a, b) => b["日期"].localeCompare(a["日期"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(giftData), "心意明细");
      }

      if (notes.length > 0) {
        const noteData = notes.map(n => ({ 
          "记录ID": n.id, "日期": n.note_date, "内容": n.content, 
          "金额": n.amount ? Number(n.amount) : "", "归入": n.target, "状态": n.status
        })).sort((a, b) => b["日期"].localeCompare(a["日期"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(noteData), "随手记");
      }

      if (snapshots.length > 0) {
        const snapData = snapshots.map(s => {
           const row: any = { "月份": s.month, "对账日期": s.details?.snapshotDate || "", "总资产(元)": Number(s.total_assets) };
           const order = s.details?._order || Object.keys(s.details || {}).filter(k => k !== "_order" && k !== "_locked" && k !== "start_balance" && k !== "snapshotDate");
           order.forEach((key: string) => { if (s.details[key] !== undefined) row[`子账户-${key}`] = Number(s.details[key]); });
           row["月初结转"] = s.details?.start_balance ? Number(s.details.start_balance) : "";
           row["锁定账户"] = (s.details?._locked || []).join(", ");
           return row;
        }).sort((a, b) => b["月份"].localeCompare(a["月份"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(snapData), "月末资产对账");
      }

      XLSX.writeFile(wb, `记账本全量导出_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e) {
      console.error(e);
      alert("导出失败，请确认已在终端运行 npm install xlsx");
    }
  }

  function openDetail(item: any, type: TabType) {
    setViewingItem(item);
    setFormDate(item.trade_date || item.note_date);
    if (type === "deposit") {
      setDepositType(item.type); setDepositAccount(item.account || "余额"); setDepositAmount(item.amount.toString()); setDepositNote(item.note || ""); setDepositCategory(item.category || "日常");
    } else if (type === "social") {
      setSocialName(item.person); setSocialType(item.type); setSocialAmount(item.amount.toString()); setSocialReason(item.reason || "");
    } else if (type === "gift") {
      setGiftName(item.person); setGiftOccasion(item.occasion || ""); setGiftAmount(item.amount.toString()); setGiftDetails(item.details || "");
    } else if (type === "notes") {
      setNoteContent(item.content); setNoteAmount(item.amount ? item.amount.toString() : ""); setNoteTarget(item.target || "存款");
    }
    setIsEditing(false); setModalType(type);
  }

  function openAdd() {
    setViewingItem(null);
    setFormDate(new Date().toISOString().split("T")[0]);
    setDepositAmount(""); setDepositNote(""); setSocialAmount(""); setSocialName(""); setSocialReason("");
    setGiftAmount(""); setGiftName(""); setGiftDetails(""); setGiftOccasion("");
    setNoteContent(""); setNoteAmount(""); setNoteTarget("存款");
    setIsEditing(true); setModalType(activeTab);
  }

  function openSnapshot(monthStr: string) {
    const existing = snapshots.find(s => s.month === monthStr);
    let initialDate = `${monthStr}-01`;
    if (existing?.details?.snapshotDate) {
      initialDate = existing.details.snapshotDate;
    }
    setSnapshotDate(initialDate);
    updateSnapshotDetailsForMonth(monthStr);
    setModalType("snapshot");
  }

  const updateSnapshotDetailsForMonth = (monthStr: string) => {
    const existing = snapshots.find(s => s.month === monthStr);
    
    let prevEndBalance = "";
    const [y, m] = monthStr.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevSnap = snapshots.find(s => s.month === prevMonthStr);
    if (prevSnap) prevEndBalance = prevSnap.total_assets.toString();

    let currentDetails: { name: string, amount: string, isLocked?: boolean }[] = [];
    
    const latestAnySnapshot = snapshots[0];
    const templateDetails = existing?.details || latestAnySnapshot?.details || {};
    
    let validKeys = templateDetails._order || Object.keys(templateDetails).filter(k => k !== 'start_balance' && k !== '_order' && k !== '_locked' && k !== 'snapshotDate');
    if (validKeys.length === 0) {
      validKeys = ["余额", "理财", "基金", "股票", "毕", "妈"];
    }

    currentDetails = validKeys.map((key: string) => {
      const amount = existing && existing.details[key] !== undefined ? existing.details[key].toString() : "";
      return { 
        name: key, 
        amount: key === "理财" ? realWealthAmount.toFixed(2) : amount, 
        isLocked: templateDetails._locked?.includes(key) || key === "理财"
      };
    });

    setSnapshotDetails(currentDetails);
    setSnapshotStart(existing?.details?.start_balance ? existing.details.start_balance.toString() : prevEndBalance);
  };

  const handleDateChange = (dateStr: string) => {
    setSnapshotDate(dateStr);
    if (dateStr) {
       updateSnapshotDetailsForMonth(dateStr.slice(0, 7));
    }
  };

  async function handleSave() {
    if (!userId) return;
    if (modalType === "deposit") {
      const data = { user_id: userId, trade_date: formDate, type: depositType, amount: Number(depositAmount), note: depositNote, category: depositCategory, account: depositAccount };
      if (viewingItem) await supabase.from("ledger_transactions").update(data).eq("id", viewingItem.id);
      else await supabase.from("ledger_transactions").insert(data);
    } 
    else if (modalType === "social") {
      const data = { user_id: userId, trade_date: formDate, person: socialName, type: socialType, amount: Number(socialAmount), reason: socialReason, owner: subTab === "bin" ? "斌" : "贝" };
      if (viewingItem) await supabase.from("ledger_social").update(data).eq("id", viewingItem.id);
      else await supabase.from("ledger_social").insert(data);
    } 
    else if (modalType === "gift") {
      const data = { user_id: userId, trade_date: formDate, person: giftName, occasion: giftOccasion, amount: Number(giftAmount), details: giftDetails, owner: subTab === "bin" ? "斌" : "贝" };
      if (viewingItem) await supabase.from("ledger_gifts").update(data).eq("id", viewingItem.id);
      else await supabase.from("ledger_gifts").insert(data);
    }
    else if (modalType === "notes") {
      const data = { user_id: userId, note_date: formDate, content: noteContent, amount: noteAmount ? Number(noteAmount) : null, target: noteTarget, status: "待整理" };
      if (viewingItem) await supabase.from("ledger_notes").update(data).eq("id", viewingItem.id);
      else await supabase.from("ledger_notes").insert(data);
    }
    setModalType(null); setViewingItem(null); setIsEditing(false); setViewingSocialPerson(null);
    fetchData(userId);
  }

  async function handleSaveSnapshot() {
    if (!userId) return;
    const detailObj: Record<string, any> = {};
    const orderArr: string[] = [];
    const lockedArr: string[] = [];
    
    snapshotDetails.forEach(d => { 
      if (d.name && d.amount) {
        detailObj[d.name] = Number(d.amount);
        orderArr.push(d.name);
        if (d.isLocked) lockedArr.push(d.name);
      } 
    });
    
    if (snapshotStart) detailObj.start_balance = Number(snapshotStart);
    detailObj._order = orderArr;
    detailObj._locked = lockedArr;
    detailObj.snapshotDate = snapshotDate;

    const targetMonth = snapshotDate.slice(0, 7);

    await supabase.from("ledger_snapshots").upsert({ 
      user_id: userId, month: targetMonth, total_assets: Number(snapshotTotal), details: detailObj 
    }, { onConflict: "user_id, month" });
    setModalType(null);
    fetchData(userId);
  }

  const monthReport = useMemo(() => {
    const currentY = new Date().getFullYear();
    const currentM = new Date().getMonth() + 1;
    const nowMonthStr = `${currentY}-${String(currentM).padStart(2, '0')}`;

    let earliestDate = nowMonthStr;
    transactions.forEach(t => { if (t.trade_date < earliestDate) earliestDate = t.trade_date.slice(0, 7); });
    snapshots.forEach(s => { if (s.month < earliestDate) earliestDate = s.month; });

    const allMonths = [];
    let [startY, startM] = earliestDate.split("-").map(Number);
    let [endY, endM] = nowMonthStr.split("-").map(Number);

    let y = endY, m = endM;
    while (y > startY || (y === startY && m >= startM)) {
      allMonths.push(`${y}-${String(m).padStart(2, '0')}`);
      m--;
      if (m === 0) { m = 12; y--; }
    }

    const ascMonths = [...allMonths].reverse();
    const map: Record<string, any> = {};
    let lastEndBalance = 0;

    const calculated = ascMonths.map((m) => {
      const flow = transactions.filter(t => t.trade_date.startsWith(m));
      const income = flow.filter(t => t.type === "转入").reduce((s, t) => s + Number(t.amount), 0);
      const expense = flow.filter(t => t.type === "转出").reduce((s, t) => s + Number(t.amount), 0);
      
      const snap = snapshots.find(s => s.month === m);
      const trueTotal = snap ? Number(snap.total_assets) : null;
      
      let startBalance = lastEndBalance;
      if (snap?.details?.start_balance) {
        startBalance = Number(snap.details.start_balance);
      }
      
      let calcEndBalance = startBalance + income - expense;
      if (trueTotal !== null) calcEndBalance = trueTotal;
      
      let diff = null;
      if (trueTotal !== null) {
        diff = trueTotal - (startBalance + income - expense);
      }

      lastEndBalance = calcEndBalance;
      const res = { month: m, income, expense, startBalance, calcEndBalance, trueTotal, diff };
      map[m] = res;
      return res;
    });

    return calculated.reverse();
  }, [transactions, snapshots]);

  const displayAssets = useMemo(() => {
    const nowM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const nowData = monthReport.find(m => m.month === nowM);
    return nowData ? nowData.calcEndBalance : 0;
  }, [monthReport]);
  const animatedAssets = useCountUp(displayAssets, 1000);

  const latestSnapshot = snapshots[0] || null;

  const displayDist = useMemo(() => {
    if (!latestSnapshot) return {};
    
    let baseDist: Record<string, number> = {};
    const detailObj = latestSnapshot.details || {};
    
    const order = detailObj._order || Object.keys(detailObj).filter(k => k !== "start_balance" && k !== "_order" && k !== "_locked" && k !== "snapshotDate");
    order.forEach((k: string) => {
       if (detailObj[k] !== undefined) baseDist[k] = Number(detailObj[k]);
    });

    const snapDate = latestSnapshot.details?.snapshotDate || `${latestSnapshot.month}-01`;
    transactions.forEach(t => {
      if (t.trade_date > snapDate) {
        const acc = t.account || "余额";
        if (baseDist[acc] === undefined) baseDist[acc] = 0; 
        if (t.type === "转入") baseDist[acc] += Number(t.amount);
        else baseDist[acc] -= Number(t.amount);
      }
    });

    if (baseDist["理财"] !== undefined || realWealthAmount > 0) {
      baseDist["理财"] = realWealthAmount;
    }

    return baseDist;
  }, [latestSnapshot, realWealthAmount, transactions]);

  const allDepositRecords = useMemo(() => {
    const snapRecords = snapshots.map(s => {
      const totalAssets = Number(s.total_assets);
      const dateStr = s.details?.snapshotDate || `${s.month}-28`;
      return {
        id: `snap-${s.id || s.month}`,
        isSnapshot: true,
        trade_date: dateStr, 
        type: "对账",
        amount: totalAssets,
        note: `登记月末资产`,
        category: "资产登记",
        account: "全部",
        original: s
      };
    });
    const combined = [...transactions, ...snapRecords];
    return combined.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  }, [transactions, snapshots]);

  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return allDepositRecords;
    const kw = searchTerm.toLowerCase();
    return allDepositRecords.filter(t => (t.note || "").toLowerCase().includes(kw) || (t.category || "").toLowerCase().includes(kw) || (t.account || "").toLowerCase().includes(kw));
  }, [allDepositRecords, searchTerm]);

  const paginatedTransactions = filteredTransactions.slice((depositPage - 1) * PAGE_SIZE, depositPage * PAGE_SIZE);
  
  const groupedPageTransactions = useMemo(() => {
    const groups: Record<string, any[]> = {};
    paginatedTransactions.forEach(t => {
      const m = t.trade_date.slice(0, 7);
      if (!groups[m]) groups[m] = [];
      groups[m].push(t);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [paginatedTransactions]);

  const socialListData = useMemo(() => {
    let data = socials.filter(s => s.owner === (subTab === "bin" ? "斌" : "贝"));
    if (searchTerm) {
      data = data.filter(s => s.person.includes(searchTerm) || (s.reason || "").includes(searchTerm));
    }
    
    data.sort((a, b) => {
      let diff = 0;
      if (listSort === "date") {
        diff = new Date(b.trade_date).getTime() - new Date(a.trade_date).getTime();
      } else if (listSort === "amount") {
        diff = Number(b.amount) - Number(a.amount);
      } else if (listSort === "name") {
        diff = a.person.localeCompare(b.person, 'zh-CN');
      }
      return listSortDesc ? diff : -diff;
    });
    
    return data;
  }, [socials, subTab, listSort, listSortDesc, searchTerm]);

  const socialAnalytics = useMemo(() => {
    const data = socials.filter(s => s.owner === (subTab === "bin" ? "斌" : "贝"));
    const map: Record<string, { person: string, send: number, recv: number }> = {};
    data.forEach(s => {
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
  
  const paginatedSocials = socialAnalytics.slice((socialPage - 1) * PAGE_SIZE, socialPage * PAGE_SIZE);
  const paginatedSocialList = socialListData.slice((socialPage - 1) * PAGE_SIZE, socialPage * PAGE_SIZE);

  const giftAnalytics = useMemo(() => {
    let data = gifts.filter(g => g.owner === (subTab === "bin" ? "斌" : "贝"));
    if (searchTerm) data = data.filter(g => g.person.includes(searchTerm));
    const personMap: Record<string, number> = {};
    const yearMap: Record<string, number> = {};
    data.forEach(g => {
      personMap[g.person] = (personMap[g.person] || 0) + Number(g.amount);
      const y = g.trade_date.slice(0, 4);
      yearMap[y] = (yearMap[y] || 0) + Number(g.amount);
    });
    return {
      byPerson: Object.entries(personMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      byYear: Object.entries(yearMap).map(([year, amount]) => ({ year, amount })).sort((a, b) => b.year.localeCompare(a.year)),
      filteredList: data
    };
  }, [gifts, subTab, searchTerm]);
  const paginatedGifts = giftAnalytics.filteredList.slice((giftPage - 1) * PAGE_SIZE, giftPage * PAGE_SIZE);

  const activeTabIndex = TABS.findIndex(t => t.key === activeTab);

  const socialSummary = useMemo(() => {
    const data = socials.filter(s => s.owner === (subTab === "bin" ? "斌" : "贝"));
    let sendTotal = 0, recvTotal = 0;
    const peopleMap = new Map<string, { send: number, recv: number }>();
    
    data.forEach(s => {
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
    
    return { 
      sendTotal, recvTotal, 
      netRecv: recvTotal - sendTotal, 
      pendingCount, settledCount, pendingAmount,
      totalCount: data.length, totalPeople: peopleMap.size 
    };
  }, [socials, subTab]);

  const giftSummary = useMemo(() => {
    const data = gifts.filter(g => g.owner === (subTab === "bin" ? "斌" : "贝"));
    let totalGift = 0, thisYearGift = 0, thisYearCount = 0;
    const currentYear = new Date().getFullYear().toString();
    const personGiftMap = new Map<string, number>();
    
    data.forEach(g => {
      const amt = Number(g.amount);
      totalGift += amt;
      if (g.trade_date.startsWith(currentYear)) {
        thisYearGift += amt;
        thisYearCount++;
      }
      personGiftMap.set(g.person, (personGiftMap.get(g.person) || 0) + amt);
    });
    
    let maxAmount = 0, maxPerson = "";
    personGiftMap.forEach((amt, person) => {
      if (amt > maxAmount) { maxAmount = amt; maxPerson = person; }
    });
    
    return { totalGift, thisYearGift, thisYearCount, maxAmount, maxPerson, totalPeople: personGiftMap.size };
  }, [gifts, subTab]);

  const Pagination = ({ page, setPage, total }: any) => {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between mt-4 mb-2 bg-white/80 backdrop-blur rounded-xl p-2 border border-slate-100 shadow-sm">
        <button onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:text-purple-600 disabled:opacity-30 bg-slate-50 rounded-lg transition-all">上一页</button>
        <span className="text-[12px] text-slate-500 font-mono">第 <span className="text-purple-600 font-bold">{page}</span> / {totalPages} 页</span>
        <button onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:text-purple-600 disabled:opacity-30 bg-slate-50 rounded-lg transition-all">下一页</button>
      </div>
    );
  };

  const handleAssetPressStart = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      openSnapshot(latestSnapshot?.month || new Date().toISOString().slice(0, 7));
      if (typeof navigator !== "undefined" && "vibrate" in navigator) { try { (navigator as any).vibrate(10); } catch {} }
    }, 400);
  };
  const handleAssetPressEnd = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) return;
    const newDetails = [...snapshotDetails];
    const [movedItem] = newDetails.splice(dragIdx, 1);
    newDetails.splice(targetIdx, 0, movedItem);
    setSnapshotDetails(newDetails);
    setDragIdx(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <style>{`
        ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        ::-webkit-scrollbar-track { background: transparent !important; }
        ::-webkit-scrollbar-thumb { background: transparent !important; }
        * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      `}</style>

      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[22px] font-bold tracking-tight text-slate-900">记账本</div>
            <div className="text-[12px] text-slate-400 mt-0.5">流水分析 · 资产透视</div>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={handleExport} className="px-3 py-2 bg-white/60 backdrop-blur-md border border-white/50 text-slate-700 text-[13px] font-medium rounded-2xl shadow-sm hover:bg-white transition-all flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              导出
            </button>
            <button onClick={() => setIsSearchOpen(!isSearchOpen)} className={`w-9 h-9 flex items-center justify-center rounded-2xl border backdrop-blur-md transition-all ${isSearchOpen ? "bg-purple-50/80 border-purple-200 text-purple-600" : "bg-white/60 border-white/50 text-slate-600"}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </button>
          </div>
        </div>
        
        <div className={`overflow-hidden transition-all duration-300 ${isSearchOpen ? "max-h-20 mb-4 opacity-100" : "max-h-0 opacity-0"}`}>
          <input type="text" placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-4 py-2.5 bg-white/60 backdrop-blur-md border border-white/50 rounded-2xl text-[13px] outline-none focus:border-purple-400 transition-all" />
        </div>

        <div className="relative flex bg-slate-200/50 backdrop-blur-md p-1 rounded-2xl mb-4 sticky top-2 z-20 border border-white/40 shadow-sm">
          <div className="absolute top-1 bottom-1 bg-white rounded-xl shadow-sm transition-transform duration-300" style={{ width: "calc(25% - 2px)", transform: `translateX(${activeTabIndex * 100}%)`, left: "4px" }} />
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key as TabType); setSearchTerm(""); setIsSearchOpen(false); }} className={`flex-1 py-2.5 text-[13px] font-medium relative z-10 transition-colors rounded-xl ${activeTab === tab.key ? "text-purple-600" : "text-slate-500"}`}>{tab.label}</button>
          ))}
        </div>

        {activeTab === "deposit" && (
          <div className="animate-fade-in space-y-6">
            
            {/* ★ 大卡片：支持折叠展开 */}
            <div 
              onMouseDown={handleAssetPressStart}
              onMouseUp={handleAssetPressEnd}
              onMouseLeave={handleAssetPressEnd}
              onTouchStart={handleAssetPressStart}
              onTouchEnd={handleAssetPressEnd}
              onTouchMove={handleAssetPressEnd}
              onContextMenu={(e) => e.preventDefault()}
              className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 p-6 shadow-xl shadow-purple-500/20 cursor-pointer select-none active:scale-[0.99] transition-transform"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-fuchsia-400/30 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>
              
              <div className="relative z-10">
                {/* 头部：点击展开/收起 */}
                <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); setIsAssetExpanded(!isAssetExpanded); }}>
                  <div>
                    <div className="text-[13px] text-white/80 font-medium tracking-widest mb-1">当前总资产（元）</div>
                    <div className="text-white tracking-tight flex items-baseline text-[36px] sm:text-[44px]">
                      <span className="text-[24px] mr-1">¥</span>
                      {animatedAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className={`w-8 h-8 rounded-full bg-white/10 flex items-center justify-center backdrop-blur transition-transform duration-300 ${isAssetExpanded ? "rotate-180" : ""}`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
                
                {/* 展开区域：各个子账户详情 */}
                <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isAssetExpanded ? "max-h-[600px] opacity-100 mt-5" : "max-h-0 opacity-0 mt-0"}`}>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(displayDist).length === 0 ? (
                      <div className="col-span-2 text-[11px] text-white/60">暂无明细</div>
                    ) : (
                      Object.entries(displayDist).map(([name, amount]) => (
                        <div key={name} className="bg-white/10 rounded-xl p-3 flex flex-col justify-between border border-white/5 backdrop-blur-sm">
                          <span className="text-[11px] text-white/70 mb-1">{name}</span>
                          <span className="text-[15px] font-mono font-bold text-white">
                            ¥{Number(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ★ 月报汇总：UI 优化，字体不拥挤 */}
            <div 
              ref={listRef}
              className="max-h-[320px] overflow-y-auto no-scrollbar relative bg-white rounded-2xl shadow-sm border border-slate-100"
            >
              {monthReport.map((m, index) => {
                const formatAmt = (val: number | null) => val !== null ? val.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";

                return (
                  <div 
                    key={m.month} 
                    data-month={m.month}
                    onClick={() => openSnapshot(m.month)} 
                    className="flex flex-col px-5 py-4 hover:bg-slate-50/80 cursor-pointer transition-colors border-b border-slate-100 last:border-b-0"
                  >
                    {/* 主信息：月份 和 月底余额 */}
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[15px] font-bold text-slate-800">{m.month.slice(5)}月</span>
                      
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] text-slate-400 font-medium">月底</span>
                        <span className="text-[18px] font-bold text-slate-900 font-mono tracking-tight">
                          {m.calcEndBalance ? `¥${formatAmt(m.calcEndBalance)}` : "-"}
                        </span>
                      </div>
                    </div>

                    {/* 副信息：进、出、月初、差 */}
                    <div className="flex justify-between items-center text-[11px] font-mono text-slate-400">
                      <div className="flex gap-5">
                        <span>
                          进 <span className={m.income > 0 ? "text-rose-400" : "text-slate-300"}>
                            {m.income > 0 ? `+${formatAmt(m.income)}` : "-"}
                          </span>
                        </span>
                        <span>
                          出 <span className={m.expense > 0 ? "text-emerald-500" : "text-slate-300"}>
                            {m.expense > 0 ? `-${formatAmt(m.expense)}` : "-"}
                          </span>
                        </span>
                      </div>
                      
                      <div className="flex gap-5">
                        <span>
                          月初 <span className="text-slate-500">{m.startBalance ? formatAmt(m.startBalance) : "-"}</span>
                        </span>
                        <span>
                          差 <span className={`font-bold ${
                            m.diff !== null && m.diff !== 0
                              ? (m.diff > 0 ? "text-rose-500" : "text-emerald-500") 
                              : "text-slate-300"
                          }`}>
                            {m.diff !== null ? (m.diff > 0 ? `+${formatAmt(m.diff)}` : formatAmt(m.diff)) : "-"}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 流水明细 */}
            <div>
              <div className="text-[15px] font-bold text-slate-800 mb-3 px-1">流水明细</div>
              {groupedPageTransactions.map(([month, txs]) => (
                <div key={month} className="mb-5">
                  <div className="text-[12px] font-bold text-slate-500 mb-2 px-1">{month.replace("-", " 年 ")} 月</div>
                  <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 overflow-hidden">
                    {txs.map((t, idx) => {
                      const isSnapshot = t.isSnapshot;
                      const isIncome = t.type === "转入";
                      return (
                        <div key={t.id} onClick={() => { if (isSnapshot) { openSnapshot(t.original.month); } else { openDetail(t, "deposit"); } }} className="group px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 border-b border-slate-100 last:border-b-0 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSnapshot ? "bg-purple-50 text-purple-600" : isIncome ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-600"}`}>
                              {isSnapshot ? "✎" : isIncome ? "↑" : "↓"}
                            </div>
                            <div>
                              <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
                                {isSnapshot ? `${t.note}（总资产）` : (t.note || t.category)} 
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-100 text-slate-500">{isSnapshot ? "登记" : t.account}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{t.trade_date} · {isSnapshot ? "包含更新资产分布" : t.category}</div>
                            </div>
                          </div>
                          <div className={`font-mono font-bold text-[15px] ${isSnapshot ? "text-slate-800" : isIncome ? "text-rose-500" : "text-emerald-600"}`}>
                            {isSnapshot ? `¥${t.amount.toLocaleString()}` : `${isIncome ? "+" : "-"}${Number(t.amount).toFixed(2)}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <Pagination page={depositPage} setPage={setDepositPage} total={filteredTransactions.length} />
            </div>
          </div>
        )}

        {/* ================== 人情 Tab ================== */}
        {activeTab === "social" && (
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
                    <select value={listSort} onChange={e => setListSort(e.target.value as ListSort)} className="text-[11px] text-slate-500 bg-transparent outline-none cursor-pointer py-0.5">
                      <option value="date">按时间排</option>
                      <option value="amount">按金额排</option>
                      <option value="name">按姓名排</option>
                    </select>
                    <div className="w-px h-3 bg-slate-200 mx-1"></div>
                    <button onClick={() => setListSortDesc(!listSortDesc)} className="p-0.5 hover:bg-slate-50 rounded text-slate-500 transition-colors">
                      {listSortDesc ? (
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                      ) : (
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {socialView === "summary" && (
                <div className="flex justify-between items-center mt-2 flex-wrap gap-2">
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {[
                      { key: "all", label: "全部" },
                      { key: "unsettled", label: "未清" },
                      { key: "to_receive", label: "待收" },
                      { key: "to_return", label: "待回" },
                      { key: "settled", label: "平衡" }
                    ].map(s => (
                      <button key={s.key} onClick={() => setSocialStatus(s.key as SocialStatusFilter)} className={`px-3 py-1 rounded-xl text-[11px] border transition-all shrink-0 ${socialStatus === s.key ? "bg-purple-50 text-purple-600 border-purple-200 font-medium shadow-sm" : "bg-white/80 backdrop-blur border-white/50 text-slate-500"}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 bg-white/80 backdrop-blur-md border border-white/50 rounded-xl px-2 py-1 shadow-sm">
                    <select value={socialSort} onChange={e => setSocialSort(e.target.value as SocialSort)} className="text-[11px] text-slate-500 bg-transparent outline-none cursor-pointer py-0.5">
                      <option value="default">按差额排</option>
                      <option value="amount">按总额排</option>
                      <option value="name">按姓名排</option>
                    </select>
                    <div className="w-px h-3 bg-slate-200 mx-1"></div>
                    <button onClick={() => setSocialSortDesc(!socialSortDesc)} className="p-0.5 hover:bg-slate-50 rounded text-slate-500 transition-colors">
                      {socialSortDesc ? (
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                      ) : (
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gradient-to-br from-indigo-50/80 to-white backdrop-blur-md rounded-3xl p-4 shadow-sm border border-indigo-100/50 flex flex-col justify-between">
                <div className="text-[11px] text-slate-500 mb-1">待回礼 (净人情)</div>
                <div className="text-[24px] font-bold text-slate-900 font-mono tracking-tight mb-2">
                  ¥{socialSummary.pendingAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                  <span className="bg-emerald-50/80 text-emerald-600 px-1.5 py-0.5 rounded font-medium">{socialSummary.pendingCount} 人待回</span>
                  <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{socialSummary.settledCount} 人已平</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50/80 to-white backdrop-blur-md rounded-3xl p-4 shadow-sm border border-blue-100/50 flex flex-col justify-between">
                <div className="text-[11px] text-slate-500 mb-1 flex justify-between">
                  <span>礼金往来总览</span>
                  <span className="text-[9px] bg-slate-100/80 text-slate-500 px-1 rounded">{socialSummary.totalCount} 笔</span>
                </div>
                <div className="flex flex-col gap-1 mb-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-slate-400">送出</span>
                    <span className="text-[14px] font-bold font-mono text-emerald-600">¥{socialSummary.sendTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-slate-400">收到</span>
                    <span className="text-[14px] font-bold font-mono text-rose-500">¥{socialSummary.recvTotal.toLocaleString()}</span>
                  </div>
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
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 mb-0.5">送出</div>
                            <div className="text-[13px] text-slate-600 font-mono font-medium">{s.send > 0 ? s.send : "-"}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 mb-0.5">收到</div>
                            <div className="text-[13px] text-rose-500 font-mono font-medium">{s.recv > 0 ? s.recv : "-"}</div>
                          </div>
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
        )}

        {/* ================== 心意 Tab ================== */}
        {activeTab === "gift" && (
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
                <div className="text-[24px] font-bold text-slate-900 font-mono tracking-tight mb-2">
                  ¥{giftSummary.totalGift.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                  <span className="bg-slate-100/80 text-slate-600 px-1.5 py-0.5 rounded font-medium">今年 ¥{giftSummary.thisYearGift.toLocaleString()}</span>
                  <span className="bg-slate-100/80 text-slate-600 px-1.5 py-0.5 rounded font-medium">{giftSummary.thisYearCount} 次</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50/80 to-white backdrop-blur-md rounded-3xl p-4 shadow-sm border border-blue-100/50 flex flex-col justify-between">
                <div className="text-[11px] text-slate-500 mb-1">按人看份量最重</div>
                <div className="text-[24px] font-bold text-slate-900 font-mono tracking-tight mb-2">
                  ¥{giftSummary.maxAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </div>
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
              <>
                <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 overflow-hidden">
                  {giftAnalytics.byPerson.map(p => (
                    <div key={p.name} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
                      <div className="text-[14px] font-medium text-slate-800">{p.name}</div>
                      <div className="font-mono font-bold text-[15px] text-emerald-600">-{p.amount.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </>
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
        )}

        {/* ================== 随手记 Tab ================== */}
        {activeTab === "notes" && (
          <div className="animate-fade-in space-y-3">
             {notes.map(n => {
                const isArchived = n.status === "已归档";
                return (
                  <div key={n.id} onClick={() => openDetail(n, "notes")} className={`bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 p-4 group cursor-pointer hover:bg-slate-50/50 transition-all ${isArchived ? "opacity-50 grayscale" : ""}`}>
                    <div className="text-[13px] text-slate-800 leading-relaxed mb-3">{n.content}</div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                      <span>{n.note_date} · 归入：<span className="text-purple-600 font-medium">{n.target}</span></span>
                      <div className="flex items-center gap-3">
                        {n.amount && <span className="font-mono text-amber-600 font-bold">¥{Number(n.amount).toFixed(2)}</span>}
                        {!isArchived && (
                          <button onClick={(e) => { e.stopPropagation(); handleArchive(n.id); }} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] hover:bg-slate-200 transition-colors">标记已归档</button>
                        )}
                        {isArchived && <span className="text-[10px]">已归档</span>}
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(n.id, "notes"); }} className="text-slate-300 hover:text-rose-500 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* 悬浮按钮 */}
      <button onClick={openAdd} className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full bg-white/30 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.15)] text-purple-700 hover:text-purple-800 active:scale-90 transition-all duration-300" style={{ bottom: "calc(100px + env(safe-area-inset-bottom))", right: "20px" }}>
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      </button>

      {/* ================== 弹窗体系 ================== */}
      
      {/* 日常新增/详情编辑弹窗 */}
      {modalType && modalType !== "snapshot" && !viewingSocialPerson && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setModalType(null)} />
          <div className="relative bg-white/90 backdrop-blur-xl w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 animate-slide-up sm:animate-scale-in max-h-[85vh] overflow-y-auto no-scrollbar border border-white/50 shadow-2xl">
            
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[17px] font-bold text-slate-900">
                {!viewingItem ? `新增${modalType === "deposit" ? "流水" : modalType === "social" ? "人情" : modalType === "gift" ? "心意" : "随手记"}` : isEditing ? "编辑记录" : "详细信息"}
              </h3>
              {viewingItem && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="px-3 py-1.5 bg-purple-50/80 text-purple-600 font-medium rounded-xl text-[12px] transition-colors">编辑</button>
              )}
            </div>

            <div className="space-y-4">
              {modalType === "deposit" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">日期</label>{isEditing ? <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" /> : <div className="text-[14px] font-medium text-slate-800">{formDate}</div>}</div>
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（元）</label>{isEditing ? <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-rose-500 rounded-xl" /> : <div className={`text-[18px] font-bold font-mono ${depositType === "转入" ? "text-rose-500" : "text-emerald-600"}`}>{depositType === "转入" ? "+" : "-"}{depositAmount}</div>}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">收支类型</label>{isEditing ? <div className="segment-group flex bg-slate-100/80 p-1 rounded-xl"><button onClick={() => setDepositType("转入")} className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${depositType === "转入" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>转入</button><button onClick={() => setDepositType("转出")} className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${depositType === "转出" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>转出</button></div> : <div className="text-[14px] text-slate-800">{depositType}</div>}</div>
                    
                    <div className="relative">
                      <label className="block text-[11px] text-slate-500 mb-1.5">所属账户</label>
                      {isEditing ? (
                        <>
                          <input 
                            type="text" 
                            value={depositAccount} 
                            onChange={e => setDepositAccount(e.target.value)} 
                            onFocus={() => setShowAccountSuggest(true)} 
                            onBlur={() => setTimeout(() => setShowAccountSuggest(false), 200)} 
                            className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" 
                            placeholder="输入或选择账户..."
                          />
                          {showAccountSuggest && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-32 overflow-y-auto no-scrollbar">
                              {allAccountNames.filter(a => a.includes(depositAccount)).map(a => (
                                <button key={a} onMouseDown={() => setDepositAccount(a)} className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-purple-50 border-b border-slate-50 last:border-0 transition-colors">{a}</button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : <div className="text-[14px] text-slate-800">{depositAccount}</div>}
                    </div>
                  </div>
                  <div className="relative">
                    <label className="block text-[11px] text-slate-500 mb-1.5">分类</label>
                    {isEditing ? (
                      <>
                        <input type="text" value={depositCategory} onChange={e => setDepositCategory(e.target.value)} onFocus={() => setShowCategorySuggest(true)} onBlur={() => setTimeout(() => setShowCategorySuggest(false), 200)} placeholder="输入或选择分类..." className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" />
                        {showCategorySuggest && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-32 overflow-y-auto no-scrollbar">
                            {PRESET_CATEGORIES.filter(c => c.includes(depositCategory)).map(c => (
                              <button key={c} onMouseDown={() => setDepositCategory(c)} className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-purple-50 border-b border-slate-50 last:border-0 transition-colors">{c}</button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : <div className="text-[14px] text-slate-800">{depositCategory}</div>}
                  </div>
                  <div><label className="block text-[11px] text-slate-500 mb-1.5">摘要 / 备注</label>{isEditing ? <input type="text" value={depositNote} onChange={e => setDepositNote(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" /> : <div className="text-[13px] text-slate-600 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">{depositNote || "无"}</div>}</div>
                </>
              )}

              {(modalType === "social" || modalType === "gift") && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">日期</label>{isEditing ? <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" /> : <div className="text-[14px] font-medium text-slate-800">{formDate}</div>}</div>
                    
                    <div className="relative">
                      <label className="block text-[11px] text-slate-500 mb-1.5">姓名</label>
                      {isEditing ? (
                        <>
                          <input 
                            type="text" 
                            value={modalType === "social" ? socialName : giftName} 
                            onChange={e => modalType === "social" ? setSocialName(e.target.value) : setGiftName(e.target.value)} 
                            onFocus={() => setShowNameSuggest(true)} 
                            onBlur={() => setTimeout(() => setShowNameSuggest(false), 200)} 
                            className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" 
                          />
                          {showNameSuggest && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-32 overflow-y-auto no-scrollbar">
                              {existingNames.filter(n => n.includes(modalType === "social" ? socialName : giftName)).map(n => (
                                <button key={n} onMouseDown={() => modalType === "social" ? setSocialName(n) : setGiftName(n)} className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-purple-50 border-b border-slate-50 last:border-0 transition-colors">{n}</button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : <div className="text-[14px] text-slate-800">{modalType === "social" ? socialName : giftName}</div>}
                    </div>
                  </div>
                  
                  {modalType === "social" ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-[11px] text-slate-500 mb-1.5">方向</label>{isEditing ? <div className="segment-group flex bg-slate-100/80 p-1 rounded-xl"><button onClick={() => setSocialType("送")} className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${socialType === "送" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>我送出</button><button onClick={() => setSocialType("收")} className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${socialType === "收" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>我收到</button></div> : <div className="text-[14px] text-slate-800">{socialType}</div>}</div>
                        <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（元）</label>{isEditing ? <input type="number" value={socialAmount} onChange={e => setSocialAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-rose-500 rounded-xl" /> : <div className={`text-[18px] font-bold font-mono ${socialType === "送" ? "text-emerald-600" : "text-rose-500"}`}>{socialType === "送" ? "-" : "+"}{socialAmount}</div>}</div>
                      </div>
                      
                      <div className="relative">
                        <label className="block text-[11px] text-slate-500 mb-1.5">事由 / 备注</label>
                        {isEditing ? (
                          <>
                            <input 
                              type="text" 
                              value={socialReason} 
                              onChange={e => setSocialReason(e.target.value)} 
                              onFocus={() => setShowReasonSuggest(true)} 
                              onBlur={() => setTimeout(() => setShowReasonSuggest(false), 200)} 
                              className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" 
                            />
                            {showReasonSuggest && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-32 overflow-y-auto no-scrollbar">
                                {existingReasons.filter(r => r.includes(socialReason)).map(r => (
                                  <button key={r} onMouseDown={() => setSocialReason(r)} className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-purple-50 border-b border-slate-50 last:border-0 transition-colors">{r}</button>
                                ))}
                              </div>
                            )}
                          </>
                        ) : <div className="text-[13px] text-slate-600 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">{socialReason || "无"}</div>}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-[11px] text-slate-500 mb-1.5">场合</label>{isEditing ? <input type="text" value={giftOccasion} onChange={e => setGiftOccasion(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" /> : <div className="text-[14px] text-slate-800">{giftOccasion}</div>}</div>
                        <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（元）</label>{isEditing ? <input type="number" value={giftAmount} onChange={e => setGiftAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-emerald-600 rounded-xl" /> : <div className="text-[18px] font-bold font-mono text-emerald-600">-{giftAmount}</div>}</div>
                      </div>
                      <div><label className="block text-[11px] text-slate-500 mb-1.5">礼品明细</label>{isEditing ? <input type="text" value={giftDetails} onChange={e => setGiftDetails(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" /> : <div className="text-[13px] text-slate-600 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">{giftDetails || "无"}</div>}</div>
                    </>
                  )}
                </>
              )}

              {modalType === "notes" && (
                <>
                  <div><label className="block text-[11px] text-slate-500 mb-1.5">日期</label>{isEditing ? <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" /> : <div className="text-[14px] font-medium text-slate-800">{formDate}</div>}</div>
                  <div><label className="block text-[11px] text-slate-500 mb-1.5">记点什么...</label>{isEditing ? <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={3} className="input-field w-full px-3 py-2.5 text-[13px] resize-none rounded-xl" placeholder="想到什么先写一句..." /> : <div className="text-[13px] text-slate-800 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 leading-relaxed">{noteContent}</div>}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（可选）</label>{isEditing ? <input type="number" value={noteAmount} onChange={e => setNoteAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] text-amber-600 font-bold rounded-xl" placeholder="不填就是纯备忘" /> : <div className="text-[14px] font-bold font-mono text-amber-600">{noteAmount ? `¥${Number(noteAmount).toFixed(2)}` : "无"}</div>}</div>
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">归入</label>{isEditing ? <select value={noteTarget} onChange={e => setNoteTarget(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] bg-white rounded-xl">{NOTE_TARGETS.map(t => <option key={t} value={t}>{t}</option>)}</select> : <div className="text-[14px] text-purple-600 font-medium">{noteTarget}</div>}</div>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 mt-8">
              <button onClick={() => setModalType(null)} className="flex-1 py-3.5 bg-slate-100/80 text-slate-600 font-medium rounded-2xl transition-colors">关闭</button>
              {viewingItem && (
                 <button onClick={() => { if(confirm("确认删除吗？")) { handleDelete(viewingItem.id, modalType); setModalType(null); } }} className="w-24 py-3.5 bg-rose-50/80 text-rose-600 font-medium rounded-2xl transition-colors">删除</button>
              )}
              {isEditing && <button onClick={handleSave} className="flex-[2] py-3.5 bg-purple-600 text-white font-bold rounded-2xl active:scale-95 transition-all shadow-md shadow-purple-500/20">保存</button>}
            </div>
          </div>
        </div>
      )}

      {viewingSocialPerson && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setViewingSocialPerson(null)} />
          <div className="relative bg-white/90 backdrop-blur-xl w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 animate-slide-up max-h-[85vh] overflow-y-auto no-scrollbar border border-white/50 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[17px] font-bold text-slate-900">{viewingSocialPerson} 的账单明细</h3>
              <button onClick={() => setViewingSocialPerson(null)} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
            </div>
            
            <div className="space-y-2 mb-6">
              {socials.filter(s => s.person === viewingSocialPerson && s.owner === (subTab === "bin" ? "斌" : "贝")).map(s => (
                <div key={s.id} onClick={() => { setViewingSocialPerson(null); openDetail(s, "social"); }} className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors">
                  <div>
                    <div className="text-[13px] font-medium text-slate-800">{s.reason || "无备注"}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{s.trade_date} · {s.type}</div>
                  </div>
                  <div className={`font-mono font-bold ${s.type === "送" ? "text-emerald-600" : "text-rose-500"}`}>
                    {s.type === "送" ? "-" : "+"}{Number(s.amount).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => setViewingSocialPerson(null)} className="w-full py-3 bg-slate-100/80 text-slate-600 font-medium rounded-2xl transition-colors">返回</button>
          </div>
        </div>
      )}

      {modalType === "snapshot" && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative bg-white/90 backdrop-blur-xl w-full max-w-md rounded-t-[32px] p-6 max-h-[85vh] overflow-y-auto no-scrollbar border border-white/50 shadow-2xl">
            <h3 className="text-[17px] font-bold mb-4 select-none">登记月末资产</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5 select-none">对账日期</label>
                  <input 
                    type="date" 
                    value={snapshotDate} 
                    onChange={e => handleDateChange(e.target.value)} 
                    className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" 
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5 select-none">本月月初（选填）</label>
                  <input type="number" placeholder="默认等于上月末" value={snapshotStart} onChange={e => setSnapshotStart(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl" />
                </div>
              </div>
              
              <div>
                <label className="block text-[11px] text-slate-500 mb-1.5 select-none">总资产（元）<span className="text-emerald-500 ml-1">(自动求和)</span></label>
                <input type="number" placeholder="总资产" value={snapshotTotal} readOnly className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-slate-800 bg-slate-50 cursor-not-allowed rounded-xl" />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[11px] text-slate-500 select-none">子账户明细（月终结余）</label>
                  <span className="text-[10px] text-purple-500 bg-purple-50 px-2 py-0.5 rounded select-none">理财已自动实时同步</span>
                </div>
                {snapshotDetails.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="flex gap-2 mb-2 items-center"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, idx)}
                  >
                    <div 
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      className="w-5 flex justify-center text-slate-300 cursor-grab active:cursor-grabbing hover:text-slate-500 select-none"
                    >
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                       </svg>
                    </div>
                    
                    <input type="text" placeholder="名字" value={item.name} onChange={e => { const n = [...snapshotDetails]; n[idx].name = e.target.value; setSnapshotDetails(n); }} className="input-field w-[28%] px-2 py-2 text-[12px] rounded-lg" />
                    
                    <input 
                      type="number" 
                      placeholder="金额" 
                      value={item.amount} 
                      onChange={e => { if (!item.isLocked) { const n = [...snapshotDetails]; n[idx].amount = e.target.value; setSnapshotDetails(n); } }} 
                      readOnly={item.isLocked}
                      className={`input-field flex-1 px-2 py-2 text-[12px] rounded-lg ${item.isLocked ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`} 
                    />
                    
                    <button 
                      onClick={() => {
                        const n = [...snapshotDetails];
                        n[idx].isLocked = !n[idx].isLocked;
                        setSnapshotDetails(n);
                      }} 
                      className={`w-6 flex justify-center transition-colors select-none ${item.isLocked ? "text-purple-600" : "text-slate-300 hover:text-slate-500"}`}
                      title={item.isLocked ? "点击解锁（允许编辑）" : "点击锁定（禁止编辑）"}
                    >
                      {item.isLocked ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                      )}
                    </button>

                    <button onClick={() => { const n = [...snapshotDetails]; n.splice(idx, 1); setSnapshotDetails(n); }} className="px-1 text-rose-400 hover:text-rose-600 text-[12px] w-6 select-none transition-colors">删除</button>
                  </div>
                ))}
                <button onClick={() => setSnapshotDetails([...snapshotDetails, { name: "", amount: "", isLocked: false }])} className="text-[11px] text-purple-600 mt-1 select-none">+ 添加账户</button>
              </div>
            </div>
            <div className="flex gap-2 mt-8">
              {snapshots.find(s => s.month === snapshotDate.slice(0, 7)) && (
                <button onClick={() => handleDeleteSnapshot(snapshotDate.slice(0, 7))} className="w-24 py-3.5 bg-rose-50/80 text-rose-600 font-medium rounded-2xl transition-colors">删除对账</button>
              )}
              <button onClick={() => setModalType(null)} className="flex-1 py-3.5 bg-slate-100/80 text-slate-600 font-medium rounded-2xl transition-colors">取消</button>
              <button onClick={handleSaveSnapshot} className="flex-1 py-3.5 bg-purple-600 text-white rounded-2xl font-bold transition-all shadow-md shadow-purple-500/20">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}