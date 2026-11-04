"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import DonateModal from "./DonateModal";

export default function WechatGroupButton() {
  const [wechatOpen, setWechatOpen] = useState(false); // 控制微信群弹窗
  const [donateOpen, setDonateOpen] = useState(false); // 控制捐赠弹窗
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  // 1. 获取微信群二维码
  useEffect(() => {
    async function loadQr() {
      const { data } = await supabase
        .from("app_config")
        .select("value, updated_at")
        .eq("key", "wechat_qr")
        .maybeSingle();
      if (data && data.value) {
        setQrBase64(data.value);
      }
    }
    loadQr();
  }, []);

  // 2. 滚动隐藏/显示逻辑
  useEffect(() => {
    const handleScroll = () => {
      if (wechatOpen || donateOpen) return; // 弹窗打开时不响应滚动
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [wechatOpen, donateOpen]);

  // 动画类
  const baseCls = `fixed right-4 z-[9999] w-12 h-12 rounded-full flex items-center justify-center
                   shadow-lg transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                     isVisible ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0 pointer-events-none"
                   }`;

  return (
    <>
      {/* ================= 图标 1：微信群 ================= */}
      {qrBase64 && (
        <button
          onClick={() => setWechatOpen(true)}
          className={`${baseCls} bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30 hover:scale-110 active:scale-90`}
          style={{ bottom: "180px" }} // 位置较高
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
        </button>
      )}

      {/* ================= 图标 2：赞赏捐赠 ================= */}
      <button
        onClick={() => setDonateOpen(true)}
        className={`${baseCls} bg-gradient-to-br from-rose-400 to-pink-600 shadow-rose-500/30 hover:scale-110 active:scale-90`}
        style={{ bottom: "110px" }} // 位置较低
      >
        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>

      {/* ================= 弹窗 1：微信二维码 ================= */}
      {wechatOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setWechatOpen(false)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm text-center animate-scale-in">
            <button onClick={() => setWechatOpen(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
            <h3 className="text-[18px] font-bold text-slate-900 mb-2 mt-2">加入微信群</h3>
            <p className="text-[12px] text-slate-500 mb-6">扫码进群，获取最新理财提醒</p>
            <img src={qrBase64!} alt="微信群" className="w-48 h-48 mx-auto rounded-2xl border border-slate-200 p-2" />
          </div>
        </div>
      )}

      {/* ================= 弹窗 2：赞赏捐赠 ================= */}
      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
    </>
  );
}