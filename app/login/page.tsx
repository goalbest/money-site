"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [account, setAccount] = useState(""); // 智能输入框：手机号或老用户名
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"info" | "err" | "ok">("info");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

    async function handleSubmit() {
    // 1. 最直接的第一步拦截，如果连这个都没弹，说明点击事件都没触发
    alert("进入登录函数，账号：" + account);
    
    if (loading) return;

    if (!account) return (setMsg("请输入手机号或用户名"), setMsgType("err"));
    if (!password) return (setMsg("请输入密码"), setMsgType("err"));

    setLoading(true);
    setMsg("登录中..."); setMsgType("info");

    try {
      // 2. 检查 Supabase 实例是否存在
      alert("准备发起请求，Supabase对象：" + (supabase ? "已加载" : "加载失败"));

      let query = supabase.from("users").select("id, role").eq("password", password);
      
      if (/^\d{11}$/.test(account)) {
        query = query.eq("phone", account);
      } else {
        query = query.eq("username", account);
      }

      // 3. 强制加上超时机制，防止一直卡住
      const fetchPromise = query.maybeSingle();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("网络请求超时（10秒无响应）")), 10000)
      );

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

      // 4. 看看有没有返回错误
      if (error) {
        alert("数据库返回错误: " + error.message);
        setMsg(`数据库错误: ${error.message}`); setMsgType("err");
        setLoading(false);
        return;
      }

      if (!data) {
        alert("查询成功，但没找到这个账号密码");
        setMsg("账号或密码错误"); setMsgType("err");
        setLoading(false);
        return;
      }

      // 5. 成功逻辑
      alert("登录成功，准备跳转！");
      localStorage.setItem("username", account);
      localStorage.setItem("user_id", String(data.id));
      localStorage.setItem("role", data.role || "user");
      setMsg("登录成功，正在跳转..."); setMsgType("ok");
      setTimeout(() => { router.push("/"); router.refresh(); }, 800);
      
    } catch (err: any) {
      // 6. 捕获所有 Promise 抛出的异常
      alert("请求抛出异常: " + err.message);
      console.error("Fetch Error:", err);
      setMsg(`网络请求失败，请检查手机网络。详细错误: ${err.message}`); 
      setMsgType("err");
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8 animate-fade-in-up">
          <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-purple-500/25">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-[22px] font-bold tracking-tight text-slate-900">理财净值观察站</div>
          <div className="text-[12px] text-slate-400 mt-1">记录你的每一份净值变化</div>
        </div>

        <div className="card p-6 animate-fade-in-up delay-1">
          {/* 固定的标题，不再有 Tab 切换 */}
          <div className="text-center mb-6 mt-1">
            <div className="text-[16px] font-bold text-slate-800">主人登录</div>
            <div className="text-[11px] text-slate-400 mt-1">本站为私人记账工具，未开放注册</div>
          </div>

          <div className="space-y-4">
            {/* 账号输入框 */}
            <div>
              <label className="block text-[11px] text-slate-500 mb-2">账号</label>
              <input 
                type="text" 
                maxLength={30} 
                placeholder="请输入手机号或用户名" 
                value={account} 
                onChange={(e) => setAccount(e.target.value)} 
                onKeyDown={handleKeyDown} 
                className="input-field w-full px-4 py-3 text-[14px]" 
              />
            </div>

            {/* 密码输入框 */}
            <div>
              <label className="block text-[11px] text-slate-500 mb-2">密码</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="请输入密码" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  onKeyDown={handleKeyDown} 
                  className="input-field w-full pl-4 pr-10 py-3 text-[14px]" 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full mt-6 py-3 text-[14px] font-semibold disabled:opacity-50">
            {loading ? "验证中..." : "登 录"}
          </button>

          {msg && (
            <div className={`mt-4 px-3.5 py-2.5 rounded-xl text-[12px] flex items-center gap-2 ${msgType === "err" ? "bg-rose-50 text-rose-600" : msgType === "ok" ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-500"}`}>
              {msgType === "ok" && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              {msgType === "err" && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0L3.16 16.25A2 2 0 005 19z" /></svg>}
              <span>{msg}</span>
            </div>
          )}
        </div>
        
        <div className="text-center text-[10px] text-slate-300 mt-6">
          数据保存在您的私人 Supabase 中
        </div>
      </div>
    </div>
  );
}