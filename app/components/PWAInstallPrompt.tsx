"use client";

import { useEffect, useState } from "react";

const LS_KEY = "pwa_prompt_dismissed_v1";

export default function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [autoHideTimer, setAutoHideTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 已经关闭过 → 不再显示
    if (localStorage.getItem(LS_KEY) === "1") return;

    // 已经在独立窗口（已安装）→ 不显示
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // 只对移动端显示
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /android|iphone|ipad|ipod/.test(ua);
    if (!isMobile) return;

    // 延迟 1.5 秒出现，避免首屏太挤
    const showTimer = setTimeout(() => {
      setShow(true);
      // 5 秒后自动消失
      const hideTimer = setTimeout(() => {
        setShow(false);
        // 记住"已忽略"（下次不再弹）
        try { localStorage.setItem(LS_KEY, "1"); } catch {}
      }, 5000);
      setAutoHideTimer(hideTimer);
    }, 1500);

    return () => {
      clearTimeout(showTimer);
      if (autoHideTimer) clearTimeout(autoHideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    if (autoHideTimer) clearTimeout(autoHideTimer);
    setShow(false);
    try { localStorage.setItem(LS_KEY, "1"); } catch {}
  }

  function install() {
    dismiss();
    // 尝试触发原生安装（Chrome/Android）
    const promptEvent = (window as any).__pwaInstallPrompt;
    if (promptEvent) {
      promptEvent.prompt();
    } else {
      // iOS Safari 不支持程序化安装 → 引导手动
      alert(
        "iOS 添加到主屏幕：\n\n1. 点底部中间「分享」图标\n2. 下滑找到「添加到主屏幕」\n3. 点右上角「添加」"
      );
    }
  }

  if (!show) return null;

  return (
    <div
      className="fixed left-4 right-4 z-[70] animate-fade-in-up"
      style={{
        bottom: "calc(92px + env(safe-area-inset-bottom))",
      }}
    >
      <div
        className="rounded-[22px] p-4 flex items-center gap-3 shadow-2xl"
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #a855f7 55%, #ec4899 100%)",
          boxShadow: "0 12px 40px -8px rgba(139, 92, 246, 0.5)",
        }}
      >
        <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/25
                        flex items-center justify-center flex-shrink-0 text-[20px]">
          📱
        </div>

        <div className="flex-1 min-w-0 text-white">
          <div className="text-[13px] font-semibold mb-0.5">
            添加到桌面
          </div>
          <div className="text-[11px] text-white/80 leading-snug">
            像 App 一样使用，无浏览器栏
          </div>
        </div>

        <button
          onClick={install}
          className="flex-shrink-0 px-3.5 py-2 rounded-full
                     bg-white text-purple-600 text-[12px] font-semibold
                     shadow-md active:scale-95 transition-transform"
        >
          立即安装
        </button>

        <button
          onClick={dismiss}
          aria-label="关闭"
          className="w-6 h-6 rounded-full bg-white/15 hover:bg-white/25
                     flex items-center justify-center flex-shrink-0
                     active:scale-90 transition-transform"
        >
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}