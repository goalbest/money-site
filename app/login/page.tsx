"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [debugMsg, setDebugMsg] = useState("");
  const router = useRouter();

  function handleLogin() {
    // ★ 1. 不用 alert，直接在屏幕上显示文字，看看有没有反应
    setDebugMsg("✅ 按钮点击生效了！正在登录...");

    if (phone.trim() !== "18739478938") {
      setDebugMsg("❌ 手机号不对，请务必输入 18739478938");
      return;
    }

    try {
      localStorage.setItem("user_id", "1");
      localStorage.setItem("username", "18739478938");
      
      setDebugMsg("✅ 缓存写入成功！准备跳转...");

      // ★ 2. 延迟 1 秒跳转，方便你看到文字
      setTimeout(() => {
        router.push("/"); // 使用 Next.js 原生路由
      }, 1000);

    } catch (err: any) {
      setDebugMsg("❌ 发生错误: " + err.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-5">
      <div className="w-full max-w-sm">
        
        {/* ★ 用来显示点击状态的大字报 */}
        {debugMsg && (
          <div className="mb-4 text-[15px] text-white bg-purple-600 p-4 rounded-xl font-bold text-center animate-pulse">
            {debugMsg}
          </div>
        )}

        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-purple-500/30 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">测试登录</h1>
          <p className="text-sm text-slate-500 mt-2">输入 18739478938</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100">
          <div className="mb-5">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="输入手机号"
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[15px] outline-none focus:border-purple-500 focus:bg-white transition-all tabular"
            />
          </div>

          <button
            type="button"
            onClick={handleLogin}
            className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-[15px] font-bold rounded-xl active:scale-[0.98] transition-all"
          >
            直接登录
          </button>
        </div>
      </div>
    </div>
  );
}