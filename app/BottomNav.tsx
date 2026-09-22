"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "home", href: "/", label: "首页", icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10" },
  { key: "holdings", href: "/holdings", label: "持仓", icon: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { key: "add", href: "/add", label: "", icon: "" },
  { key: "discover", href: "/discover", label: "发现", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
  { key: "profile", href: "/profile", label: "我的", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname?.startsWith("/product/") || pathname?.startsWith("/login")) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-3xl mx-auto flex items-center justify-around h-14">
        {TABS.map((tab) => {
          if (tab.key === "add") {
            return (
              <Link key={tab.key} href={tab.href} className="relative -mt-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              </Link>
            );
          }
          const isActive = pathname === tab.href;
          return (
            <Link key={tab.key} href={tab.href} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1">
              <svg className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              <span className={`text-[10px] ${isActive ? "text-blue-600 font-medium" : "text-gray-400"}`}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}