"use client";

const TABS = [
  { key: "all", label: "全部" },
  { key: "fund", label: "基金" },
  { key: "stock", label: "股票" },
];

export default function FundTabs({ activeTab, onTabChange }: { activeTab: string, onTabChange: (key: string) => void }) {
  const activeTabIndex = TABS.findIndex((t) => t.key === activeTab);

  return (
    <div className="relative flex bg-slate-200/60 backdrop-blur-md p-1 rounded-2xl border border-white/60 shadow-sm overflow-hidden h-full">
      <div 
        className="absolute top-1 bottom-1 bg-white rounded-xl shadow-md transition-transform duration-300 ease-out" 
        style={{ width: "calc(33.33% - 2px)", transform: `translateX(${activeTabIndex * 100}%)`, left: "4px" }} 
      />
      {TABS.map((t) => (
        <button 
          key={t.key} 
          onClick={() => onTabChange(t.key)} 
          className={`flex-1 py-2 text-[13px] font-bold relative z-10 transition-colors rounded-xl flex items-center justify-center ${activeTab === t.key ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}