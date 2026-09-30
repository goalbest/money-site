"use client";

import WatchlistPanel from "../components/WatchlistPanel";

export default function WatchlistPage() {
  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">
              我的自选
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              关注感兴趣的产品
            </div>
          </div>
        </div>
        <WatchlistPanel />
      </div>
    </div>
  );
}