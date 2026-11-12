"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../../lib/supabase";

export default function LedgerModals({
  modalType, setModalType, viewingItem, isEditing, setIsEditing, viewingSocialPerson, setViewingSocialPerson,
  userId, activeTab, subTab, fetchData, handleDelete, snapshots, realWealthAmount, transactions
}: any) {
  // --- 内部表单状态 ---
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  
  const [depositType, setDepositType] = useState<"转入" | "转出">("转入");
  const [depositAccount, setDepositAccount] = useState("余额");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [depositCategory, setDepositCategory] = useState("日常");

  const [socialName, setSocialName] = useState("");
  const [socialType, setSocialType] = useState<"送" | "收">("送");
  const [socialAmount, setSocialAmount] = useState("");
  const [socialReason, setSocialReason] = useState("");

  const [giftName, setGiftName] = useState("");
  const [giftOccasion, setGiftOccasion] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftDetails, setGiftDetails] = useState("");

  const [noteContent, setNoteContent] = useState("");
  const [noteAmount, setNoteAmount] = useState("");
  const [noteTarget, setNoteTarget] = useState("存款");

  // 对账专用
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().split("T")[0]);
  const [snapshotStart, setSnapshotStart] = useState("");
  const [snapshotTotal, setSnapshotTotal] = useState("");
  const [snapshotDetails, setSnapshotDetails] = useState<{name: string, amount: string, isLocked?: boolean}[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // ★ 1. 计算实时预估余额
  const currentDist = useMemo(() => {
    let baseDist: Record<string, number> = {};
    const latestSnap = snapshots[0];
    if (!latestSnap) return baseDist;
    
    // 先拿最近一次的快照打底
    const detailObj = latestSnap.details || {};
    const order = detailObj._order || Object.keys(detailObj).filter((k: string) => k !== "start_balance" && k !== "_order" && k !== "_locked" && k !== "snapshotDate");
    order.forEach((k: string) => {
       if (detailObj[k] !== undefined) baseDist[k] = Number(detailObj[k]);
    });

    // 再把快照日期之后的流水算进去
    const snapDate = detailObj?.snapshotDate || `${latestSnap.month}-01`;
    transactions?.forEach((t: any) => {
      if (t.trade_date > snapDate) {
        const acc = t.account || "余额";
        if (baseDist[acc] === undefined) baseDist[acc] = 0; 
        if (t.type === "转入") baseDist[acc] += Number(t.amount);
        else baseDist[acc] -= Number(t.amount);
      }
    });

    // 强制同步最新的真实理财数据
    baseDist["理财"] = realWealthAmount || 0;

    return baseDist;
  }, [snapshots, transactions, realWealthAmount]);


  // --- 生命周期同步 ---
  useEffect(() => {
    if (modalType && modalType !== "snapshot") {
      if (viewingItem) {
        setFormDate(viewingItem.trade_date || viewingItem.note_date);
        if (modalType === "deposit") {
          setDepositType(viewingItem.type); setDepositAccount(viewingItem.account || "余额"); setDepositAmount(viewingItem.amount.toString()); setDepositNote(viewingItem.note || ""); setDepositCategory(viewingItem.category || "日常");
        } else if (modalType === "social") {
          setSocialName(viewingItem.person); setSocialType(viewingItem.type); setSocialAmount(viewingItem.amount.toString()); setSocialReason(viewingItem.reason || "");
        } else if (modalType === "gift") {
          setGiftName(viewingItem.person); setGiftOccasion(viewingItem.occasion || ""); setGiftAmount(viewingItem.amount.toString()); setGiftDetails(viewingItem.details || "");
        } else if (modalType === "notes") {
          setNoteContent(viewingItem.content); setNoteAmount(viewingItem.amount ? viewingItem.amount.toString() : ""); setNoteTarget(viewingItem.target || "存款");
        }
      } else {
        setFormDate(new Date().toISOString().split("T")[0]);
        setDepositAmount(""); setDepositNote(""); setSocialAmount(""); setSocialName(""); setSocialReason("");
        setGiftAmount(""); setGiftName(""); setGiftDetails(""); setGiftOccasion("");
        setNoteContent(""); setNoteAmount(""); setNoteTarget("存款");
      }
    }
  }, [modalType, viewingItem]);

  // 对账汇总自动计算
  useEffect(() => {
    if (modalType === "snapshot") {
      const sum = snapshotDetails.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      setSnapshotTotal(sum > 0 ? sum.toString() : "");
    }
  }, [snapshotDetails, modalType]);

  // ★ 2. 初始化对账弹窗数据（智能填充）
  useEffect(() => {
    if (modalType === "snapshot") {
      const targetMonth = snapshotDate.slice(0, 7);
      const existing = snapshots.find((s: any) => s.month === targetMonth);
      const latestSnap = snapshots[0];
      const templateDetails = existing?.details || latestSnap?.details || {};
      
      let validKeys = templateDetails._order || Object.keys(templateDetails).filter((k: string) => k !== 'start_balance' && k !== '_order' && k !== '_locked' && k !== 'snapshotDate');
      if (validKeys.length === 0) validKeys = ["余额", "理财", "基金", "股票", "毕", "妈"];

      const currentDetails = validKeys.map((key: string) => {
        let amount = "";
        
        // 如果有当月历史记录，优先用历史的
        if (existing && existing.details[key] !== undefined) {
          amount = existing.details[key].toString();
        } 
        // 如果没有，说明是新增对账，自动计算实时金额填进去！
        else if (currentDist[key] !== undefined) {
          amount = Number(currentDist[key]).toFixed(2);
        }

        return {
          name: key, 
          amount: amount,
          isLocked: templateDetails._locked?.includes(key) || key === "理财"
        };
      });
      
      setSnapshotDetails(currentDetails);
      // 默认月初为上一次的记录
      let prevEndBalance = "";
      const [y, m] = targetMonth.split("-").map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const prevSnap = snapshots.find((s: any) => s.month === prevMonthStr);
      if (prevSnap) prevEndBalance = prevSnap.total_assets.toString();
      
      setSnapshotStart(existing?.details?.start_balance ? existing.details.start_balance.toString() : prevEndBalance);
    }
  }, [modalType, snapshotDate, snapshots, currentDist]);

  // 处理拖拽排序
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

  if (!modalType && !viewingSocialPerson) return null;

  // --- 保存逻辑 ---
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
    setModalType(null); setViewingSocialPerson(null);
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

  return (
    <>
      {/* 日常弹窗 (省略中间代码，保持你原本的样式) */}
      {modalType && modalType !== "snapshot" && !viewingSocialPerson && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setModalType(null)} />
          <div className="relative bg-white/90 backdrop-blur-xl w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 animate-slide-up max-h-[85vh] overflow-y-auto no-scrollbar border border-white/50 shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[17px] font-bold text-slate-900">
                {!viewingItem ? `新增${modalType === "deposit" ? "流水" : modalType === "social" ? "人情" : modalType === "gift" ? "心意" : "随手记"}` : isEditing ? "编辑记录" : "详细信息"}
              </h3>
              {viewingItem && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="px-3 py-1.5 bg-purple-50/80 text-purple-600 font-medium rounded-xl text-[12px] transition-colors">编辑</button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1.5">日期</label>
                {isEditing ? <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl border-none bg-slate-50 focus:bg-white" /> : <div className="text-[14px] font-medium text-slate-800">{formDate}</div>}
              </div>

              {modalType === "deposit" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（元）</label>{isEditing ? <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-rose-500 rounded-xl border-none bg-slate-50 focus:bg-white" /> : <div className={`text-[18px] font-bold font-mono ${depositType === "转入" ? "text-rose-500" : "text-emerald-600"}`}>{depositType === "转入" ? "+" : "-"}{depositAmount}</div>}</div>
                    <div><label className="block text-[11px] text-slate-500 mb-1.5">账户</label>{isEditing ? <input type="text" value={depositAccount} onChange={e => setDepositAccount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl border-none bg-slate-50 focus:bg-white" /> : <div className="text-[14px] text-slate-800">{depositAccount}</div>}</div>
                  </div>
                  <div><label className="block text-[11px] text-slate-500 mb-1.5">备注</label>{isEditing ? <input type="text" value={depositNote} onChange={e => setDepositNote(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl border-none bg-slate-50 focus:bg-white" /> : <div className="text-[13px] text-slate-600 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">{depositNote || "无"}</div>}</div>
                </>
              )}
              
              {(modalType === "social" || modalType === "gift") && (
                <>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">姓名</label>
                    {isEditing ? <input type="text" value={modalType === "social" ? socialName : giftName} onChange={e => modalType === "social" ? setSocialName(e.target.value) : setGiftName(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl border-none bg-slate-50 focus:bg-white" /> : <div className="text-[14px] text-slate-800">{modalType === "social" ? socialName : giftName}</div>}
                  </div>
                  <div><label className="block text-[11px] text-slate-500 mb-1.5">金额（元）</label>{isEditing ? <input type="number" value={modalType === "social" ? socialAmount : giftAmount} onChange={e => modalType === "social" ? setSocialAmount(e.target.value) : setGiftAmount(e.target.value)} className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-rose-500 rounded-xl border-none bg-slate-50 focus:bg-white" /> : <div className={`text-[18px] font-bold font-mono ${modalType === "social" && socialType === "送" ? "text-emerald-600" : "text-rose-500"}`}>{modalType === "social" && socialType === "送" ? "-" : "+"}{modalType === "social" ? socialAmount : giftAmount}</div>}</div>
                </>
              )}

              {modalType === "notes" && (
                <div><label className="block text-[11px] text-slate-500 mb-1.5">内容</label>{isEditing ? <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl border-none bg-slate-50 focus:bg-white resize-none" rows={3} /> : <div className="text-[13px] text-slate-800 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 leading-relaxed">{noteContent}</div>}</div>
              )}
            </div>

            <div className="flex gap-2 mt-8">
              <button onClick={() => setModalType(null)} className="flex-1 py-3.5 bg-slate-100/80 text-slate-600 font-medium rounded-2xl transition-colors">关闭</button>
              {viewingItem && isEditing && <button onClick={() => { if(confirm("确认删除吗？")) handleDelete(viewingItem.id, modalType); }} className="w-24 py-3.5 bg-rose-50/80 text-rose-600 font-medium rounded-2xl transition-colors">删除</button>}
              {isEditing && <button onClick={handleSave} className="flex-[2] py-3.5 bg-purple-600 text-white rounded-2xl font-bold transition-all shadow-md shadow-purple-500/20">保存</button>}
            </div>
          </div>
        </div>
      )}

      {/* 对账弹窗 */}
      {modalType === "snapshot" && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:px-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative bg-white/90 backdrop-blur-xl w-full max-w-md rounded-t-[32px] p-6 max-h-[85vh] overflow-y-auto no-scrollbar border border-white/50 shadow-2xl">
            <h3 className="text-[17px] font-bold mb-4 select-none">登记月末资产</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5 select-none">对账日期</label>
                  <input type="date" value={snapshotDate} onChange={e => setSnapshotDate(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl border-none bg-slate-50 focus:bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5 select-none">本月月初（选填）</label>
                  <input type="number" placeholder="默认等于上月末" value={snapshotStart} onChange={e => setSnapshotStart(e.target.value)} className="input-field w-full px-3 py-2.5 text-[13px] rounded-xl border-none bg-slate-50 focus:bg-white" />
                </div>
              </div>
              
              <div>
                <label className="block text-[11px] text-slate-500 mb-1.5 select-none">总资产（元）<span className="text-emerald-500 ml-1">(自动求和)</span></label>
                <input type="number" placeholder="总资产" value={snapshotTotal} readOnly className="input-field w-full px-3 py-2.5 text-[15px] font-bold text-slate-800 bg-slate-50 cursor-not-allowed rounded-xl border-none" />
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
                    <div draggable onDragStart={(e) => handleDragStart(e, idx)} className="w-5 flex justify-center text-slate-300 cursor-grab active:cursor-grabbing hover:text-slate-500 select-none">
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                    </div>
                    
                    <input type="text" placeholder="名字" value={item.name} onChange={e => { const n = [...snapshotDetails]; n[idx].name = e.target.value; setSnapshotDetails(n); }} className="input-field w-[28%] px-2 py-2 text-[12px] rounded-lg border-none bg-slate-50 focus:bg-white" />
                    
                    <input 
                      type="number" placeholder="金额" value={item.amount} 
                      onChange={e => { if (!item.isLocked) { const n = [...snapshotDetails]; n[idx].amount = e.target.value; setSnapshotDetails(n); } }} 
                      readOnly={item.isLocked}
                      className={`input-field flex-1 px-2 py-2 text-[12px] rounded-lg border-none ${item.isLocked ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-slate-50 focus:bg-white"}`} 
                    />
                    
                    <button 
                      onClick={() => { const n = [...snapshotDetails]; n[idx].isLocked = !n[idx].isLocked; setSnapshotDetails(n); }} 
                      className={`w-6 flex justify-center transition-colors select-none ${item.isLocked ? "text-purple-600" : "text-slate-300 hover:text-slate-500"}`}
                      title={item.isLocked ? "解锁" : "锁定"}
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
              {snapshots.find((s:any) => s.month === snapshotDate.slice(0, 7)) && (
                <button onClick={() => { if(confirm("确认删除此月记录？")) { /* 你的删除逻辑 */ } }} className="w-24 py-3.5 bg-rose-50/80 text-rose-600 font-medium rounded-2xl transition-colors">删除</button>
              )}
              <button onClick={() => setModalType(null)} className="flex-1 py-3.5 bg-slate-100/80 text-slate-600 font-medium rounded-2xl transition-colors">取消</button>
              <button onClick={handleSaveSnapshot} className="flex-1 py-3.5 bg-purple-600 text-white rounded-2xl font-bold transition-all shadow-md shadow-purple-500/20">保存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}