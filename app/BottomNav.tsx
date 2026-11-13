"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const TABS = [
  {
    key: "home",
    href: "/",
    label: "理财",
    icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10",
  },
  {
    key: "funds", // ★ 修改 key
    href: "/funds", // ★ 修改路径为基金页
    label: "基金",
    // ★ 换成了一个类似折线图/趋势的图标
    icon: "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z", 
  },
  {
    key: "holdings",
    href: "/ledger",
    label: "账本",
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  },
  {
    key: "profile",
    href: "/profile",
    label: "我的",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);

  const activeIndex = TABS.findIndex((tab) =>
    tab.href === "/" ? pathname === "/" : pathname?.startsWith(tab.href)
  );

  useEffect(() => {
    lastYRef.current = window.scrollY;

    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastYRef.current;

      if (y < 60) {
        setHidden(false);
      } else if (delta > 15) {
        setHidden(true);
      } else if (delta < -15) {
        setHidden(false);
      }

      lastYRef.current = y;
    }

    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          onScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", throttledScroll, { passive: true });
    return () => window.removeEventListener("scroll", throttledScroll);
  }, []);

  // ★ 加上 /funds/ 的判断，以后做基金详情页时自动隐藏导航栏
  if (
    pathname?.startsWith("/product/") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/add") ||
    (pathname?.startsWith("/holdings/") && pathname.length > "/holdings/".length) ||
    (pathname?.startsWith("/funds/") && pathname.length > "/funds/".length)
  ) return null;

  return (
    <>
      <style>{`
        ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        ::-webkit-scrollbar-track { background: transparent !important; }
        ::-webkit-scrollbar-thumb { background: transparent !important; }
        * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      `}</style>

      <div
        className="fixed left-0 right-0 z-50 pointer-events-none"
        style={{
          bottom: 0,
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          transform: hidden ? "translateY(150%)" : "translateY(0)",
          willChange: "transform",
          transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="max-w-md mx-auto px-6">
          <div
            className="pointer-events-auto rounded-full border border-white/20 flex items-center justify-around h-[60px] relative overflow-hidden"
            style={{
              background: "rgba(255, 255, 255, 0.01)",
              backdropFilter: "blur(10px) saturate(200%)",
              WebkitBackdropFilter: "blur(32px) saturate(200%)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.3)",
            }}
          >
            {activeIndex !== -1 && (
              <div
                className="absolute top-0 bottom-0 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none"
                style={{
                  width: "25%",
                  left: 0,
                  transform: `translateX(${activeIndex * 100}%)`,
                }}
              >
                <div className="absolute inset-y-1.5 inset-x-3 bg-purple-500/10 rounded-full" />
              </div>
            )}

            {TABS.map((tab, idx) => {
              const isActive = idx === activeIndex;

              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 transition-all duration-300 active:scale-90 relative z-10"
                >
                  <svg
                    className={`w-[21px] h-[21px] transition-all duration-300 ${
                      isActive ? "text-purple-600 scale-105" : "text-slate-500"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={isActive ? 2.5 : 2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  <span
                    className={`text-[10px] transition-colors duration-300 ${
                      isActive ? "text-purple-600 font-bold" : "text-slate-500 font-medium"
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}