"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const TABS = [
  {
    key: "home",
    href: "/",
    label: "首页",
    icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10",
  },
  {
    key: "calendar",
    href: "/calendar",
    label: "日历",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  { key: "add", href: "/add", label: "", icon: "" },
  {
    key: "holdings",
    href: "/holdings",
    label: "持仓",
    icon: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
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
  /* ★ 切页瞬间禁用动画，让导航条"瞬移"回原位 */
  const [noAnim, setNoAnim] = useState(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    /* 切页：先无动画复位 */
    setNoAnim(true);
    setHidden(false);
    lastYRef.current = typeof window !== "undefined" ? window.scrollY : 0;

    /* 50ms 后恢复动画，让后续滚动隐藏/显示正常过渡 */
    const resumeTimer = setTimeout(() => {
      setNoAnim(false);
      lastYRef.current = window.scrollY;
    }, 50);

    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastYRef.current;

      if (y < 80) {
        setHidden(false);
      } else if (delta > 6) {
        setHidden(true);
      } else if (delta < -6) {
        setHidden(false);
      }

      lastYRef.current = y;
    }

    /* 延迟绑定 scroll 监听，避免浏览器 scroll restoration 误触发 */
    let attached = false;
    const attachTimer = setTimeout(() => {
      lastYRef.current = window.scrollY;
      window.addEventListener("scroll", onScroll, { passive: true });
      attached = true;
    }, 500);

    return () => {
      clearTimeout(resumeTimer);
      clearTimeout(attachTimer);
      if (attached) window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  if (
    pathname?.startsWith("/product/") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/add") ||
    (pathname?.startsWith("/holdings/") && pathname.length > "/holdings/".length)
  ) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 pointer-events-none"
      style={{
        bottom: "12px",
        paddingBottom: "env(safe-area-inset-bottom)",
        transform: hidden ? "translateY(200%)" : "translateY(0)",
        opacity: hidden ? 0 : 1,
        /* ★ 只过渡 transform 和 opacity，不碰 bottom */
        transition: noAnim
          ? "none"
          : "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease-out",
      }}
    >
      <div className="max-w-3xl mx-auto px-4">
        <div
          className="pointer-events-auto
                     rounded-[26px]
                     border border-white/40
                     flex items-center justify-around
                     h-[58px] px-2
                     relative"
          style={{
            background: "rgba(255, 255, 255, 0.72)",
            boxShadow:
              "0 8px 32px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          {TABS.map((tab) => {
            if (tab.key === "add") {
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className="relative -mt-5 flex-shrink-0 active:scale-95 transition-transform"
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center
                               transition-all duration-300 ease-out"
                    style={{
                      background: "linear-gradient(135deg, #6366f1 0%, #a855f7 55%, #ec4899 100%)",
                      boxShadow:
                        "0 8px 20px -6px rgba(139, 92, 246, 0.5), 0 3px 8px -2px rgba(236, 72, 153, 0.3)",
                    }}
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14m7-7H5" />
                    </svg>
                  </div>
                </Link>
              );
            }

            const isActive = tab.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(tab.href);

            return (
              <Link
                key={tab.key}
                href={tab.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1
                           transition-all duration-300 active:scale-95"
              >
                <svg
                  className={`w-[22px] h-[22px] transition-all duration-300 ${
                    isActive ? "text-purple-600" : "text-slate-500"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={isActive ? 2.3 : 1.9}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
                <span
                  className={`text-[10px] transition-colors duration-300 ${
                    isActive ? "text-purple-600 font-semibold" : "text-slate-500"
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
  );
}