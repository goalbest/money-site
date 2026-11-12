"use client";

export default function NotesTab({ notes, openDetail, handleArchive, handleDelete }: any) {
  return (
    <div className="animate-fade-in space-y-3">
      {notes.map((n: any) => {
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
  );
}