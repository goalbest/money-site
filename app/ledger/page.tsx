"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import * as XLSX from "xlsx";
import { getHoldingMarketValue } from "../../lib/holdings";

type TabType = "deposit" | "social" | "gift" | "notes";
type SubTabType = "bin" | "bei";
type SocialViewMode = "list" | "summary";
type SocialStatusFilter = "all" | "pending" | "settled";
type GiftViewMode = "list" | "by_person" | "by_year";
type SocialSort = "default" | "amount" | "name";

const TABS = [
  { key: "deposit", label: "资金" },
  { key: "social", label: "往来" },
  { key: "gift", label: "心意" },
  { key: "notes", label: "随手记" },
];

const ACCOUNTS = ["余额", "理财", "基金", "股票", "借款", "日常"];
const PRESET_CATEGORIES = ["理财收益", "大额消费", "教育", "日常", "其他"];
const NOTE_TARGETS = ["存款", "往来·斌", "往来·贝", "心意·斌", "心意·贝", "待定"];
const PAGE_SIZE = 20;

// 数字滚动动画 Hook
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

const AnimatedNumber = ({ value, className }: { value: number, className?: string }) => {
  const animated = useCountUp(value, 800);
  return <span className={className}>{animated.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
};

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
  const [giftView, setGiftView] = useState<GiftViewMode>("list");
  
  // 折叠状态
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);

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
  const [showActionSheet, setShowActionSheet] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // 资金表单状态
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [depositType, setDepositType] = useState<"转入" | "转出">("转入");
  const [depositAccount, setDepositAccount] = useState("余额");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [depositCategory, setDepositCategory] = useState("日常");
  const [showCategorySuggest, setShowCategorySuggest] = useState(false);

  // 往来表单状态
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

  useEffect(() => { setDepositPage(1); setSocialPage(1); setGiftPage(1); }, [searchTerm, activeTab, socialView, giftView]);

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

  // 删除
  async function handleDelete(id: string, type: TabType) {
    if (!confirm("确认删除这条记录吗？")) return;
    const table = type === "deposit" ? "ledger_transactions" : type === "social" ? "ledger_social" : type === "gift" ? "ledger_gifts" : "ledger_notes";
    await supabase.from(table).delete().eq("id", id);
    if (userId) fetchData(userId);
  }

  // 删除对账
  async function handleDeleteSnapshot(month: string) {
    if (!confirm("确认删除此月的对账记录吗？")) return;
    await supabase.from("ledger_snapshots").delete().eq("user_id", userId).eq("month", month);
    setModalType(null);
    if (userId) fetchData(userId);
  }

  // 随手记归档
  async function handleArchive(id: string) {
    await supabase.from("ledger_notes").update({ status: "已归档" }).eq("id", id);
    if (userId) fetchData(userId);
  }

  // 导出 Excel
  function handleExport() {
    if (transactions.length === 0 && socials.length === 0 && gifts.length === 0 && notes.length === 0) {
      alert("当前没有数据可导出！");
      return;
    }
    try {
      const wb = XLSX.utils.book_new();
      if (transactions.length > 0) {
        const txData = transactions.map(t => ({ "日期": t.trade_date, "账户": t.account, "收支": t.type, "金额(元)": Number(t.amount), "摘要/备注": t.note || "", "分类": t.category })).sort((a, b) => b["日期"].localeCompare(a["日期"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txData), "资金流水");
      }
      if (socials.length > 0) {
        const socialData = socials.map(s => ({ "日期": s.trade_date, "姓名": s.person, "方向": s.type, "金额(元)": Number(s.amount), "事由/备注": s.reason || "", "所属(斌/贝)": s.owner })).sort((a, b) => b["日期"].localeCompare(a["日期"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(socialData), "人情往来");
      }
      if (gifts.length > 0) {
        const giftData = gifts.map(g => ({ "日期": g.trade_date, "给谁": g.person, "场合": g.occasion || "", "金额(元)": Number(g.amount), "礼品明细": g.details || "", "所属(斌/贝)": g.owner })).sort((a, b) => b["日期"].localeCompare(a["日期"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(giftData), "心意明细");
      }
      if (notes.length > 0) {
        const noteData = notes.map(n => ({ "日期": n.note_date, "内容": n.content, "金额": n.amount ? Number(n.amount) : "", "归入": n.target, "状态": n.status })).sort((a, b) => b["日期"].localeCompare(a["日期"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(noteData), "随手记");
      }
      if (snapshots.length > 0) {
        const snapData = snapshots.map(s => {
           const row: any = { "月份": s.month, "总资产(元)": Number(s.total_assets) };
           if (s.details) Object.entries(s.details).forEach(([k, v]) => { 
             if (k !== "_order" && k !== "start_balance" && k !== "_locked" && k !== "snapshotDate") row[`子账户-${k}`] = Number(v); 
           });
           return row;
        }).sort((a, b) => b["月份"].localeCompare(a["月份"]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(snapData), "月末资产对账");
      }
      XLSX.writeFile(wb, `记账本导出_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e) {
      console.error(e);
      alert("导出失败，请确认已在终端运行 npm install xlsx");
    }
  }

  // 打开详情
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

  // 打开新增
  function openAdd() {
    setViewingItem(null);
    setFormDate(new Date().toISOString().split("T")[0]);
    setDepositAmount(""); setDepositNote(""); setSocialAmount(""); setSocialName(""); setSocialReason("");
    setGiftAmount(""); setGiftName(""); setGiftDetails(""); setGiftOccasion("");
    setNoteContent(""); setNoteAmount(""); setNoteTarget("存款");
    setIsEditing(true); setModalType(activeTab);
  }

  // 打开对账弹窗，联动日期
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
    
    // 获取上月月末基数
    let prevEndBalance = "";
    const [y, m] = monthStr.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevSnap = snapshots.find(s => s.month === prevMonthStr);
    if (prevSnap) prevEndBalance = prevSnap.total_assets.toString();

    let currentDetails: { name: string, amount: string, isLocked?: boolean }[] = [];
    
    // ★ 核心修复：如果没有当前月份的 existing，用最新一次的快照作为模板，防止账户丢失
    const latestAnySnapshot = snapshots[0];
    const templateDetails = existing?.details || latestAnySnapshot?.details || {};
    
    let validKeys = templateDetails._order || Object.keys(templateDetails).filter(k => k !== 'start_balance' && k !== '_order' && k !== '_locked' && k !== 'snapshotDate');
    if (validKeys.length === 0) {
      validKeys = ["余额", "理财", "基金", "股票", "毕", "妈"]; // 兜底默认列表
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

  // 保存
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

  // 保存对账
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

  // ---------- 核心逻辑：月报与流水合并 ----------
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

  // ★ 修复：计算所有账户的最终金额（基准 + 流水加减）
  const displayDist = useMemo(() => {
    if (!latestSnapshot) return {};
    
    let baseDist: Record<string, number> = {};
    const detailObj = latestSnapshot.details || {};
    
    const order = detailObj._order || Object.keys(detailObj).filter(k => k !== "start_balance" && k !== "_order" && k !== "_locked" && k !== "snapshotDate");
    order.forEach((k: string) => {
       if (detailObj[k] !== undefined) baseDist[k] = Number(detailObj[k]);
    });

    // 以最后登记的日期为基数，只加减该日期之后的所有流水
    const snapDate = latestSnapshot.details?.snapshotDate || `${latestSnapshot.month}-01`;
    transactions.forEach(t => {
      if (t.trade_date > snapDate) {
        const acc = t.account || "余额";
        if (baseDist[acc] === undefined) baseDist[acc] = 0; 
        if (t.type === "转入") baseDist[acc] += Number(t.amount);
        else baseDist[acc] -= Number(t.amount);
      }
    });

    // 理财强制使用实时数据（如果你用上面的方法手记了转账流水，理财也会自动加上去）
    if (baseDist["理财"] !== undefined || realWealthAmount > 0) {
      baseDist["理财"] = realWealthAmount;
    }

    return baseDist;
  }, [latestSnapshot, realWealthAmount, transactions]);

  // 合并流水和对账记录
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

  // 监听滚动联动年份
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const rows = container.querySelectorAll('[data-month]');
    const containerRect = container.getBoundingClientRect();
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as HTMLElement;
      const rowRect = row.getBoundingClientRect();
      if (rowRect.bottom > containerRect.top + 10) {
        const m = row.getAttribute('data-month');
        if (m) {
          const y = m.slice(0, 4);
          if (y !== viewYear) setViewYear(y);
        }
        break;
      }
    }
  }, [viewYear]);

  const scrollToYear = (y: string) => {
    if (!listRef.current) return;
    const currentY = new Date().getFullYear().toString();
    const currentM = new Date().getMonth() + 1;
    const targetMonth = y === currentY ? `${y}-${String(currentM).padStart(2, '0')}` : `${y}-12`;
    const row = listRef.current.querySelector(`[data-month="${targetMonth}"]`);
    if (row) {
      listRef.current.scrollTo({
        top: (row as HTMLElement).offsetTop,
        behavior: 'smooth'
      });
    }
  };

  // 往来
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
    if (socialStatus === "pending") list = list.filter(item => item.send !== item.recv); 
    else if (socialStatus === "settled") list = list.filter(item => item.send === item.recv);
    if (socialSort === "amount") list.sort((a, b) => (b.send + b.recv) - (a.send + a.recv));
    else if (socialSort === "name") list.sort((a, b) => a.person.localeCompare(b.person, 'zh-CN'));
    else list.sort((a, b) => Math.abs(b.send - b.recv) - Math.abs(a.send - a.recv)); 
    return list;
  }, [socials, subTab, socialStatus, socialSort, searchTerm]);
  const paginatedSocials = socialAnalytics.slice((socialPage - 1) * PAGE_SIZE, socialPage * PAGE_SIZE);

  // 心意
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

  const Pagination = ({ page, setPage, total }: any) => {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between mt-4 mb-2 bg-white rounded-xl p-2 border border-slate-100 shadow-sm">
        <button onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:text-purple-600 disabled:opacity-30 bg-slate-50 rounded-lg">上一页</button>
        <span className="text-[12px] text-slate-500 font-mono">第 <span className="text-purple-600 font-bold">{page}</span> / {totalPages} 页</span>
        <button onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:text-purple-600 disabled:opacity-30 bg-slate-50 rounded-lg">下一页</button>
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
            <button onClick={handleExport} className="px-3 py-2 bg-white border border-slate-200 text-slate-700 text-[13px] font-medium rounded-xl shadow-sm hover:bg-slate-50 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              导出
            </button>
            <button onClick={() => setIsSearchOpen(!isSearchOpen)} className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${isSearchOpen ? "bg-purple-50 border-purple-200 text-purple-600" : "bg-white border-slate-200 text-slate-600"}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </button>
          </div>
        </div>
        
        <div className={`overflow-hidden transition-all duration-300 ${isSearchOpen ? "max-h-20 mb-4 opacity-100" : "max-h-0 opacity-0"}`}>
          <input type="text" placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-purple-400" />
        </div>

        <div className="relative flex bg-slate-200/60 p-1 rounded-xl mb-4 sticky top-2 z-20">
          <div className="absolute top-1 bottom-1 bg-white rounded-lg shadow-sm transition-transform duration-300" style={{ width: "calc(25% - 2px)", transform: `translateX(${activeTabIndex * 100}%)`, left: "4px" }} />
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key as TabType); setSearchTerm(""); setIsSearchOpen(false); }} className={`flex-1 py-2.5 text-[13px] font-medium relative z-10 transition-colors ${activeTab === tab.key ? "text-purple-600" : "text-slate-500"}`}>{tab.label}</button>
          ))}
        </div>

        {/* ================== 资金 Tab ================== */}
        {activeTab === "deposit" && (
          <div className="animate-fade-in space-y-6">
            
            <div 
              onMouseDown={handleAssetPressStart}
              onMouseUp={handleAssetPressEnd}
              onMouseLeave={handleAssetPressEnd}
              onTouchStart={handleAssetPressStart}
              onTouchEnd={handleAssetPressEnd}
              onTouchMove={handleAssetPressEnd}
              onContextMenu={(e) => e.preventDefault()}
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 p-6 shadow-xl shadow-purple-500/20 cursor-pointer select-none active:scale-[0.99] transition-transform"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-fuchsia-400/30 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>
              
              <div className="relative z-10">
                <button onClick={(e) => { e.stopPropagation(); setSummaryCollapsed(c => !c); }} className="absolute top-0 right-0 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all duration-300 active:scale-90">
                  <svg className={`w-4 h-4 text-white transition-transform duration-300 ${summaryCollapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>

                <div className="text-[13px] text-white/80 font-medium tracking-widest mb-1">当前总资产（元）</div>
                <div className={`text-white tracking-tight flex items-baseline transition-all duration-300 ${summaryCollapsed ? "text-[32px]" : "text-[44px] mb-6"}`}>
                  <span className="text-[24px] mr-1">¥</span>
                  {animatedAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                
                <div className={`overflow-hidden transition-all duration-500 ${summaryCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"}`}>
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20">
                    <div className="text-[11px] text-white/70 mb-2 font-medium px-1 flex justify-between">
                      <span>最新资产分布 <span className="opacity-70 text-[9px]">(长按直接编辑)</span></span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(displayDist).length === 0 ? (
                        <div className="col-span-3 text-[11px] text-white/60 px-1">暂无明细</div>
                      ) : (
                        Object.entries(displayDist).map(([name, amount]) => (
                          <div key={name} className="bg-white/10 hover:bg-white/20 transition-colors px-2 py-1.5 rounded-xl flex flex-col border border-white/10 truncate">
                            <span className="text-[10px] text-white/80 mb-0.5 truncate">{name}</span>
                            <span className="text-[12px] font-mono font-bold text-white truncate">
                              ¥{Number(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ★ 月报汇总 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center justify-center px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <select 
                  value={viewYear} 
                  onChange={e => {
                    setViewYear(e.target.value);
                    scrollToYear(e.target.value);
                  }} 
                  className="text-[15px] font-bold text-slate-800 bg-transparent outline-none cursor-pointer appearance-none text-center"
                >
                  {[(new Date().getFullYear()+2).toString(), (new Date().getFullYear()+1).toString(), new Date().getFullYear().toString(), (new Date().getFullYear()-1).toString(), (new Date().getFullYear()-2).toString(), (new Date().getFullYear()-3).toString()].map(y => (
                    <option key={y} value={y}>{y} 年月报</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-[1fr_1fr_1fr_1.2fr_1.2fr_1fr] gap-1 px-3 py-2 bg-slate-50 text-[10px] text-slate-400 font-medium border-b border-slate-100 text-center">
                <div>月份</div>
                <div>进</div>
                <div>出</div>
                <div>月初</div>
                <div>月末</div>
                <div>差</div>
              </div>

              <div 
                ref={listRef}
                onScroll={handleScroll}
                className="max-h-[320px] overflow-y-auto no-scrollbar relative"
              >
                {monthReport.map(m => {
                  const isRegistered = m.trueTotal !== null;
                  return (
                    <div 
                      key={m.month} 
                      data-month={m.month}
                      onClick={() => openSnapshot(m.month)} 
                      className="grid grid-cols-[1fr_1fr_1fr_1.2fr_1.2fr_1fr] gap-1 px-3 py-3 items-center border-b border-slate-50 last:border-b-0 hover:bg-slate-50 cursor-pointer text-center"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-[13px] font-bold text-slate-800">{m.month.slice(5)}月</span>
                        <span className={`text-[9px] mt-0.5 px-1 py-0.2 rounded border ${isRegistered ? "bg-emerald-50 text-emerald-500 border-emerald-100" : "bg-amber-50 text-amber-500 border-amber-100"}`}>
                          {isRegistered ? "已登" : "待登"}
                        </span>
                      </div>
                      <div className="text-[11px] text-rose-500 font-mono truncate">
                        {m.income > 0 ? `+${m.income.toLocaleString()}` : "-"}
                      </div>
                      <div className="text-[11px] text-emerald-600 font-mono truncate">
                        {m.expense > 0 ? `-${m.expense.toLocaleString()}` : "-"}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate">
                        {m.startBalance ? m.startBalance.toLocaleString() : "-"}
                      </div>
                      <div className="text-[12px] font-bold text-slate-800 font-mono truncate">
                        {m.calcEndBalance ? m.calcEndBalance.toLocaleString() : "-"}
                      </div>
                      <div className={`text-[11px] font-mono font-bold truncate ${m.diff !== null ? (m.diff > 0 ? "text-rose-500" : m.diff < 0 ? "text-emerald-600" : "text-slate-400") : "text-slate-300"}`}>
                        {m.diff !== null ? (m.diff > 0 ? `+${m.diff.toLocaleString()}` : m.diff.toLocaleString()) : "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 流水明细（已合并对账记录） */}
            <div>
              <div className="text-[15px] font-bold text-slate-800 mb-3 px-1">流水明细</div>
              {groupedPageTransactions.map(([month, txs]) => (
                <div key={month} className="mb-5">
                  <div className="text-[12px] font-bold text-slate-500 mb-2 px-1">{month.replace("-", " 年 ")} 月</div>
                  <div className="card overflow-hidden">
                    {txs.map((t, idx) => {
                      const isSnapshot = t.isSnapshot;
                      const isIncome = t.type === "转入";
                      return (
                        <div key={t.id} onClick={() => { if (isSnapshot) { openSnapshot(t.original.month); } else { openDetail(t, "deposit"); } }} className="group px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 border-b divider last:border-b-0">
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

        {/* ================== 往来 Tab ================== */}
        {activeTab === "social" && (
          <div className="animate-fade-in">
             <div className="flex flex-col gap-3 mb-4">
              <div className="flex justify-between items-center">
                <div className="relative inline-flex bg-slate-200/60 p-1 rounded-full">
                  <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300" style={{ width: "calc(50% - 2px)", transform: `translateX(${subTab === "bin" ? 0 : 100}%)`, left: "4px" }} />
                  <button onClick={() => setSubTab("bin")} className={`px-6 py-1.5 rounded-full text-[12px] font-medium relative z-10 transition-colors ${subTab === "bin" ? "text-purple-600" : "text-slate-500"}`}>斌</button>
                  <button onClick={() => setSubTab("bei")} className={`px-6 py-1.5 rounded-full text-[12px] font-medium relative z-10 transition-colors ${subTab === "bei" ? "text-purple-600" : "text-slate-500"}`}>贝</button>
                </div>
                <div className="relative inline-flex bg-slate-200/60 p-1 rounded-full">
                  <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300" style={{ width: "calc(50% - 2px)", transform: `translateX(${socialView === "list" ? 0 : 100}%)`, left: "4px" }} />
                  <button onClick={() => setSocialView("list")} className={`px-5 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${socialView === "list" ? "text-purple-600" : "text-slate-500"}`}>流水</button>
                  <button onClick={() => setSocialView("summary")} className={`px-5 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${socialView === "summary" ? "text-purple-600" : "text-slate-500"}`}>按人算</button>
                </div>
              </div>
              {socialView === "summary" && (
                <div className="flex justify-between items-center mt-2">
                  <div className="flex gap-2">
                    {["all", "pending", "settled"].map(s => (
                      <button key={s} onClick={() => setSocialStatus(s as SocialStatusFilter)} className={`px-3 py-1 rounded-md text-[11px] border transition-all ${socialStatus === s ? "bg-purple-50 text-purple-600 border-purple-200 font-medium" : "bg-white text-slate-500 border-slate-200"}`}>
                        {s === "all" ? "全部" : s === "pending" ? "仅未结清" : "已平衡"}
                      </button>
                    ))}
                  </div>
                  <select value={socialSort} onChange={e => setSocialSort(e.target.value as SocialSort)} className="text-[11px] text-slate-500 bg-white px-2 py-1.5 rounded-md border border-slate-200 outline-none cursor-pointer">
                    <option value="default">按差额排</option>
                    <option value="amount">按总额排</option>
                    <option value="name">按姓名排</option>
                  </select>
                </div>
              )}
            </div>

            {socialView === "summary" ? (
              <>
                <div className="card overflow-hidden">
                  {paginatedSocials.map(s => {
                    const net = s.send - s.recv;
                    return (
                      <div key={s.person} onClick={() => setViewingSocialPerson(s.person)} className="flex items-center justify-between px-5 py-4 border-b divider last:border-b-0 hover:bg-slate-50 transition-colors cursor-pointer">
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
              <div className="card overflow-hidden">
                {socials.filter(s => s.owner === (subTab === "bin" ? "斌" : "贝")).map(s => (
                  <div key={s.id} onClick={() => openDetail(s, "social")} className="group px-5 py-3.5 border-b divider last:border-b-0 flex items-center justify-between cursor-pointer hover:bg-slate-50">
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
            )}
          </div>
        )}

        {/* ================== 心意 Tab ================== */}
        {activeTab === "gift" && (
          <div className="animate-fade-in">
             <div className="flex justify-between items-center mb-4">
                <div className="relative inline-flex bg-slate-200/60 p-1 rounded-full">
                  <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300" style={{ width: "calc(50% - 2px)", transform: `translateX(${subTab === "bin" ? 0 : 100}%)`, left: "4px" }} />
                  <button onClick={() => setSubTab("bin")} className={`px-6 py-1.5 rounded-full text-[12px] font-medium relative z-10 transition-colors ${subTab === "bin" ? "text-purple-600" : "text-slate-500"}`}>斌</button>
                  <button onClick={() => setSubTab("bei")} className={`px-6 py-1.5 rounded-full text-[12px] font-medium relative z-10 transition-colors ${subTab === "bei" ? "text-purple-600" : "text-slate-500"}`}>贝</button>
                </div>
                <div className="relative inline-flex bg-slate-200/60 p-1 rounded-full">
                  <div className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-transform duration-300" style={{ width: "calc(33.33% - 2px)", transform: `translateX(${giftView === "list" ? 0 : giftView === "by_person" ? 100 : 200}%)`, left: "4px" }} />
                  <button onClick={() => setGiftView("list")} className={`px-3 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${giftView === "list" ? "text-purple-600" : "text-slate-500"}`}>明细</button>
                  <button onClick={() => setGiftView("by_person")} className={`px-3 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${giftView === "by_person" ? "text-purple-600" : "text-slate-500"}`}>按人</button>
                  <button onClick={() => setGiftView("by_year")} className={`px-3 py-1.5 rounded-full text-[11px] font-medium relative z-10 transition-colors ${giftView === "by_year" ? "text-purple-600" : "text-slate-500"}`}>按年</button>
                </div>
              </div>

            {giftView === "list" && (
              <>
                <div className="space-y-3">
                   {paginatedGifts.map(g => (
                      <div key={g.id} onClick={() => openDetail(g, "gift")} className="card p-4 group cursor-pointer hover:bg-slate-50 transition-colors">
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
                        <div className="text-[12px] text-slate-600 bg-white p-2.5 rounded-lg mt-3 border border-slate-100">{g.details || "无详细说明"}</div>
                      </div>
                    ))}
                </div>
                <Pagination page={giftPage} setPage={setGiftPage} total={giftAnalytics.filteredList.length} />
              </>
            )}

            {giftView === "by_person" && (
              <>
                <div className="card overflow-hidden">
                  {giftAnalytics.byPerson.map(p => (
                    <div key={p.name} className="flex items-center justify-between px-5 py-4 border-b divider last:border-b-0 hover:bg-slate-50">
                      <div className="text-[14px] font-medium text-slate-800">{p.name}</div>
                      <div className="font-mono font-bold text-[15px] text-emerald-600">-{p.amount.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {giftView === "by_year" && (
              <div className="card overflow-hidden">
                {giftAnalytics.byYear.map(y => (
                  <div key={y.year} className="flex items-center justify-between px-5 py-4 border-b divider last:border-b-0 hover:bg-slate-50">
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
                  <div key={n.id} onClick={() => openDetail(n, "notes")} className={`card p-4 group cursor-pointer hover:bg-slate-50 transition-all ${isArchived ? "opacity-50 grayscale" : ""}`}>
                    <div className="text-[13px] text-slate-800 leading-relaxed mb-3">{n.content}</div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-2 border-t divider">
                      <span>{n.note_date} · 归入：<span className="text-purple-600 font-medium">{n.target}</span></span>
                      <div className="flex items-center gap-3">
                        {n.amount && <span className="font-mono text-amber-600 font-bold">¥{Number(n.amount).toFixed(2)}</span>}
                        {!isArchived && (
                          <button onClick={(e) => { e.stopPropagation(); handleArchive(n.id); }} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] hover:bg-slate-200">标记已归档</button>
                        )}
                        {isArchived && <span className="text-[10px]">已归档</span>}
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(n.id, "notes"); }} className="text-slate-300 hover:text-rose-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ★ 悬浮按钮 */}
      <button onClick={() => setShowActionSheet(true)} className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full bg-white/20 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.08)] text-purple-700 hover:text-purple-800 active:scale-90 transition-all duration-300" style={{ bottom: "calc(88px + env(safe-area-inset-bottom))", right: "20px" }}>
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      </button>

      {/* ================== 弹窗体系 ================== */}
      
      {/* 加号底部菜单 */}
      {showActionSheet && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowActionSheet(false)} />
          <div className="relative bg-slate-50 w-full max-w-md rounded-t-3xl p-5 animate-slide-up">
            <h3 className="text-[13px] font-medium text-slate-500 text-center mb-4">选择操作</h3>
            <div className="space-y-3">
               <button onClick={() => { setShowActionSheet(false); openAdd(); }} className="w-full py-4 bg-purple-600 text-white font-bold rounded-2xl text-[16px] active:scale-95 transition-transform shadow-md shadow-purple-500/20">
                  新增 {activeTab === "deposit" ? "流水" : activeTab === "social" ? "往来" : activeTab === "gift" ? "心意" : "随手记"}
               </button>
               <button onClick={() => setShowActionSheet(false)} className="w-full py-4 bg-white text-slate-500 font-medium rounded-2xl text-[15px] mt-2 active:scale-95 transition-transform">
                  取消
               </button>
            </div>
          </div>
        </div>
      )}

      {/* 日常新增/详情编辑弹窗 */}
      {modalType && modalType !== "snapshot" && !viewingSocialPerson && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setModalType(null)} />
          <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up sm:animate-scale-in max-h-[85vh] overflow-y-auto no-scrollbar">
            
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[17px] font-bold text-slate-900">
                {!viewingItem ? `新增${modalType === "deposit" ? "流水" : modalType === "social" ? "往来" : modalType === "gift" ? "心意" : "随手记"}` : isEditing ? "编辑记录" : "详细信息"}
              </h3>
              {viewingItem && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="px-3 py-1.5 bg-purple-50 text-purple-600 font-medium rounded-lg text-[12px]">编辑</button>
              )}
            </div>

            <div className="space-y-4">
              {modalType === "deposit" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">日期</label>{isEditing ? <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px]" /> : <div className="text-[14px] font-medium text-slate-800">{formDate}</div>}</div>
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（元）</label>{isEditing ? <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-rose-500" /> : <div className={`text-[18px] font-bold font-mono ${depositType === "转入" ? "text-rose-500" : "text-emerald-600"}`}>{depositType === "转入" ? "+" : "-"}{depositAmount}</div>}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">收支类型</label>{isEditing ? <div className="segment-group flex"><button onClick={() => setDepositType("转入")} className={`flex-1 py-2 text-[13px] segment-item ${depositType === "转入" ? "segment-item-active" : ""}`}>转入</button><button onClick={() => setDepositType("转出")} className={`flex-1 py-2 text-[13px] segment-item ${depositType === "转出" ? "segment-item-active" : ""}`}>转出</button></div> : <div className="text-[14px] text-slate-800">{depositType}</div>}</div>
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">所属账户</label>{isEditing ? <select value={depositAccount} onChange={e => setDepositAccount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] bg-white">{ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}</select> : <div className="text-[14px] text-slate-800">{depositAccount}</div>}</div>
                  </div>
                  <div className="relative">
                    <label className="block text-[11px] text-slate-500 mb-1.5">分类</label>
                    {isEditing ? (
                      <>
                        <input type="text" value={depositCategory} onChange={e => setDepositCategory(e.target.value)} onFocus={() => setShowCategorySuggest(true)} onBlur={() => setTimeout(() => setShowCategorySuggest(false), 200)} placeholder="输入或选择分类..." className="input-field w-full px-3 py-2.5 text-[13px]" />
                        {showCategorySuggest && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-32 overflow-y-auto no-scrollbar">
                            {PRESET_CATEGORIES.filter(c => c.includes(depositCategory)).map(c => (
                              <button key={c} onMouseDown={() => setDepositCategory(c)} className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-purple-50 border-b border-slate-50 last:border-0">{c}</button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : <div className="text-[14px] text-slate-800">{depositCategory}</div>}
                  </div>
                  <div><label className="block text-[11px] text-slate-500 mb-1.5">摘要 / 备注</label>{isEditing ? <input type="text" value={depositNote} onChange={e => setDepositNote(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px]" /> : <div className="text-[13px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{depositNote || "无"}</div>}</div>
                </>
              )}

              {(modalType === "social" || modalType === "gift") && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">日期</label>{isEditing ? <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px]" /> : <div className="text-[14px] font-medium text-slate-800">{formDate}</div>}</div>
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">姓名</label>{isEditing ? <input type="text" value={modalType === "social" ? socialName : giftName} onChange={e => modalType === "social" ? setSocialName(e.target.value) : setGiftName(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px]" /> : <div className="text-[14px] text-slate-800">{modalType === "social" ? socialName : giftName}</div>}</div>
                  </div>
                  {modalType === "social" ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-[11px] text-slate-500 mb-1.5">方向</label>{isEditing ? <div className="segment-group flex"><button onClick={() => setSocialType("送")} className={`flex-1 py-2 text-[13px] segment-item ${socialType === "送" ? "segment-item-active" : ""}`}>我送出</button><button onClick={() => setSocialType("收")} className={`flex-1 py-2 text-[13px] segment-item ${socialType === "收" ? "segment-item-active" : ""}`}>我收到</button></div> : <div className="text-[14px] text-slate-800">{socialType}</div>}</div>
                        <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（元）</label>{isEditing ? <input type="number" value={socialAmount} onChange={e => setSocialAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-rose-500" /> : <div className={`text-[18px] font-bold font-mono ${socialType === "送" ? "text-emerald-600" : "text-rose-500"}`}>{socialType === "送" ? "-" : "+"}{socialAmount}</div>}</div>
                      </div>
                      <div><label className="block text-[11px] text-slate-500 mb-1.5">事由 / 备注</label>{isEditing ? <input type="text" value={socialReason} onChange={e => setSocialReason(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px]" /> : <div className="text-[13px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{socialReason || "无"}</div>}</div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-[11px] text-slate-500 mb-1.5">场合</label>{isEditing ? <input type="text" value={giftOccasion} onChange={e => setGiftOccasion(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px]" /> : <div className="text-[14px] text-slate-800">{giftOccasion}</div>}</div>
                        <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（元）</label>{isEditing ? <input type="number" value={giftAmount} onChange={e => setGiftAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-emerald-600" /> : <div className="text-[18px] font-bold font-mono text-emerald-600">-{giftAmount}</div>}</div>
                      </div>
                      <div><label className="block text-[11px] text-slate-500 mb-1.5">礼品明细</label>{isEditing ? <input type="text" value={giftDetails} onChange={e => setGiftDetails(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px]" /> : <div className="text-[13px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{giftDetails || "无"}</div>}</div>
                    </>
                  )}
                </>
              )}

              {modalType === "notes" && (
                <>
                  <div><label className="block text-[11px] text-slate-500 mb-1.5">日期</label>{isEditing ? <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px]" /> : <div className="text-[14px] font-medium text-slate-800">{formDate}</div>}</div>
                  <div><label className="block text-[11px] text-slate-500 mb-1.5">记点什么...</label>{isEditing ? <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={3} className="input-field w-full px-3 py-2.5 text-[13px] resize-none" placeholder="想到什么先写一句..." /> : <div className="text-[13px] text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">{noteContent}</div>}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（可选）</label>{isEditing ? <input type="number" value={noteAmount} onChange={e => setNoteAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] text-amber-600 font-bold" placeholder="不填就是纯备忘" /> : <div className="text-[14px] font-bold font-mono text-amber-600">{noteAmount ? `¥${Number(noteAmount).toFixed(2)}` : "无"}</div>}</div>
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">归入</label>{isEditing ? <select value={noteTarget} onChange={e => setNoteTarget(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] bg-white">{NOTE_TARGETS.map(t => <option key={t} value={t}>{t}</option>)}</select> : <div className="text-[14px] text-purple-600 font-medium">{noteTarget}</div>}</div>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => setModalType(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-medium rounded-xl">关闭</button>
              {viewingItem && (
                 <button onClick={() => { if(confirm("确认删除吗？")) { handleDelete(viewingItem.id, modalType); setModalType(null); } }} className="w-24 py-3 bg-rose-50 text-rose-600 font-medium rounded-xl">删除</button>
              )}
              {isEditing && <button onClick={handleSave} className="flex-[2] py-3 bg-purple-600 text-white font-bold rounded-xl active:scale-95 transition-all">保存</button>}
            </div>
          </div>
        </div>
      )}

      {viewingSocialPerson && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setViewingSocialPerson(null)} />
          <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[17px] font-bold text-slate-900">{viewingSocialPerson} 的账单明细</h3>
              <button onClick={() => setViewingSocialPerson(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="space-y-2 mb-6">
              {socials.filter(s => s.person === viewingSocialPerson && s.owner === (subTab === "bin" ? "斌" : "贝")).map(s => (
                <div key={s.id} onClick={() => { setViewingSocialPerson(null); openDetail(s, "social"); }} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-100">
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

            <button onClick={() => setViewingSocialPerson(null)} className="w-full py-3 bg-slate-100 text-slate-600 font-medium rounded-xl">返回</button>
          </div>
        </div>
      )}

      {/* 对账弹窗 */}
      {modalType === "snapshot" && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative bg-white w-full max-w-md rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto no-scrollbar">
            <h3 className="text-[17px] font-bold mb-4 select-none">登记月末资产</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5 select-none">对账日期</label>
                  <input 
                    type="date" 
                    value={snapshotDate} 
                    onChange={e => handleDateChange(e.target.value)} 
                    className="input-field w-full px-3 py-2.5 text-[13px]" 
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5 select-none">本月月初（选填）</label>
                  <input type="number" placeholder="默认等于上月末" value={snapshotStart} onChange={e => setSnapshotStart(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px]" />
                </div>
              </div>
              
              <div>
                <label className="block text-[11px] text-slate-500 mb-1.5 select-none">总资产（元）<span className="text-emerald-500 ml-1">(自动求和)</span></label>
                <input type="number" placeholder="总资产" value={snapshotTotal} readOnly className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-slate-800 bg-slate-50 cursor-not-allowed" />
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
                    
                    <input type="text" placeholder="名字" value={item.name} onChange={e => { const n = [...snapshotDetails]; n[idx].name = e.target.value; setSnapshotDetails(n); }} className="input-field w-[28%] px-2 py-2 text-[12px]" />
                    
                    <input 
                      type="number" 
                      placeholder="金额" 
                      value={item.amount} 
                      onChange={e => { if (!item.isLocked) { const n = [...snapshotDetails]; n[idx].amount = e.target.value; setSnapshotDetails(n); } }} 
                      readOnly={item.isLocked}
                      className={`input-field flex-1 px-2 py-2 text-[12px] ${item.isLocked ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`} 
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

                    <button onClick={() => { const n = [...snapshotDetails]; n.splice(idx, 1); setSnapshotDetails(n); }} className="px-1 text-rose-400 hover:text-rose-600 text-[12px] w-6 select-none">删除</button>
                  </div>
                ))}
                <button onClick={() => setSnapshotDetails([...snapshotDetails, { name: "", amount: "", isLocked: false }])} className="text-[11px] text-purple-600 mt-1 select-none">+ 添加账户</button>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              {snapshots.find(s => s.month === snapshotDate.slice(0, 7)) && (
                <button onClick={() => handleDeleteSnapshot(snapshotDate.slice(0, 7))} className="w-24 py-3 bg-rose-50 text-rose-600 font-medium rounded-xl">删除对账</button>
              )}
              <button onClick={() => setModalType(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-medium rounded-xl">取消</button>
              <button onClick={handleSaveSnapshot} className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}