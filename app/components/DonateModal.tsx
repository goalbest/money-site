"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

export default function DonateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [payType, setPayType] = useState<"wechat" | "alipay">("wechat");
  const [wechatQr, setWechatQr] = useState<string | null>(null);
  const [alipayQr, setAlipayQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return; // 只有弹窗打开时才去拉数据，省流量

    async function loadQrs() {
      const { data } = await supabase
        .from("app_config")
        .select("key, value")
        .in("key", ["wechat_donate", "alipay_donate"]);
      
      if (data) {
        data.forEach(item => {
          if (item.key === "wechat_donate") setWechatQr(item.value);
          if (item.key === "alipay_donate") setAlipayQr(item.value);
        });
      }
    }
    loadQrs();
  }, [open]);

  if (!open) return null;

  // 决定显示的图片（优先用数据库的，没有就用本地的）
  const currentImg = payType === "wechat" 
    ? (wechatQr || "/wechat-donate.png") 
    : (alipayQr || "/alipay-donate.png");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm animate-scale-in text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-90 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-rose-50 flex items-center justify-center">
          <span className="text-3xl">☕</span>
        </div>
        
        <h3 className="text-[18px] font-bold text-slate-900 mb-2">赞赏支持</h3>
        <p className="text-[12px] text-slate-500 mb-6 px-2">
          您的支持是开发者持续维护和更新服务器的最大动力！<br/>
          （赞赏不提供额外功能权限，全凭心意）
        </p>

        <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
          <button
            onClick={() => setPayType("wechat")}
            className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${
              payType === "wechat" ? "bg-white text-[#07C160] shadow-sm" : "text-slate-500"
            }`}
          >
            微信支付
          </button>
          <button
            onClick={() => setPayType("alipay")}
            className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${
              payType === "alipay" ? "bg-white text-[#1677FF] shadow-sm" : "text-slate-500"
            }`}
          >
            支付宝
          </button>
        </div>

        <div className="w-52 h-52 mx-auto bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden flex items-center justify-center relative">
          <img
            src={currentImg}
            alt="收款码"
            className="w-full h-full object-contain p-2"
            onError={(e) => {
              // 如果图片加载失败（比如本地没放图），显示占位文字
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-slate-400 text-xs">管理员暂未上传收款码</span>';
            }}
          />
        </div>

        <div className="mt-6 text-[11px] text-slate-400">
          长按图片保存，或直接扫码赞赏
        </div>
      </div>
    </div>
  );
}