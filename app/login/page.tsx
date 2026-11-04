"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  
  const [account, setAccount] = useState(""); // ★ 智能输入框：手机号或老用户名
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); 

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"info" | "err" | "ok">("info");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    if (loading) return;

    // ================= 1. 注册 =================
    if (mode === "register") {
      if (!/^\d{11}$/.test(account)) return (setMsg("注册必须使用 11 位手机号"), setMsgType("err"));
      if (!password || password.length < 6) return (setMsg("密码至少需要 6 位"), setMsgType("err"));
      if (password !== confirmPassword) return (setMsg("两次输入的密码不一致"), setMsgType("err"));

      setLoading(true);
      setMsg("注册中..."); setMsgType("info");

      const { data: existingUser } = await supabase.from("users").select("id").eq("phone", account).maybeSingle();
      if (existingUser) {
        setMsg("该手机号已被注册，请直接登录"); setMsgType("err");
        setLoading(false);
        return;
      }

      const isSuperAdmin = account === "18739478938";
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({ 
          username: account, phone: account, password: password,
          role: isSuperAdmin ? "admin" : "user"
        })
        .select("id, role")
        .single();

      if (error || !newUser) {
        setMsg("注册失败：" + (error?.message || "未知错误")); setMsgType("err");
        setLoading(false);
      } else {
        localStorage.setItem("username", account);
        localStorage.setItem("user_id", String(newUser.id));
        localStorage.setItem("role", newUser.role || "user");
        setMsg("注册成功，正在跳转..."); setMsgType("ok");
        setTimeout(() => { router.push("/"); router.refresh(); }, 800);
      }
      return;
    }

    // ================= 2. 登录 (智能识别手机号/老用户名) =================
    if (mode === "login") {
      if (!account) return (setMsg("请输入手机号或老用户名"), setMsgType("err"));
      if (!password) return (setMsg("请输入密码"), setMsgType("err"));

      setLoading(true);
      setMsg("登录中..."); setMsgType("info");

      let query = supabase.from("users").select("id, role").eq("password", password);
      
      // ★ 核心逻辑：如果是纯 11 位数字，就查手机号；否则查老用户名
      if (/^\d{11}$/.test(account)) {
        query = query.eq("phone", account);
      } else {
        query = query.eq("username", account);
      }

      const { data, error } = await query.maybeSingle();

      if (error || !data) {
        setMsg("账号或密码错误"); setMsgType("err");
        setLoading(false);
      } else {
        localStorage.setItem("username", account);
        localStorage.setItem("user_id", String(data.id));
        localStorage.setItem("role", data.role || "user");
        setMsg("登录成功，正在跳转..."); setMsgType("ok");
        setTimeout(() => { router.push("/"); router.refresh(); }, 800);
      }
      return;
    }
  }

  function switchMode(newMode: "login" | "register") {
    setMode(newMode);
    setMsg("");
    setPassword("");
    setConfirmPassword("");
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
          <div className="segment-group flex mb-5">
            <button onClick={() => switchMode("login")} className={`flex-1 py-2.5 text-[13px] segment-item ${mode === "login" ? "segment-item-active" : "hover:text-slate-700"}`}>登录</button>
            <button onClick={() => switchMode("register")} className={`flex-1 py-2.5 text-[13px] segment-item ${mode === "register" ? "segment-item-active" : "hover:text-slate-700"}`}>注册新号</button>
          </div>

          <div className="space-y-4">
            {/* 账号输入框 */}
            <div>
              <label className="block text-[11px] text-slate-500 mb-2">
                {mode === "register" ? "手机号" : "手机号 / 老用户名"}
              </label>
              <input 
                type="text" 
                maxLength={mode === "register" ? 11 : 30} 
                placeholder={mode === "register" ? "请输入 11 位手机号" : "支持手机号或以前注册的用户名"} 
                value={account} 
                onChange={(e) => setAccount(e.target.value)} 
                onKeyDown={handleKeyDown} 
                className={`input-field w-full px-4 py-3 text-[14px] ${mode === "register" ? "font-mono" : ""}`} 
              />
            </div>

            {/* 密码输入框 */}
            <div>
              <label className="block text-[11px] text-slate-500 mb-2">密码</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder={mode === "register" ? "设置至少 6 位密码" : "请输入密码"} 
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

            {/* 确认密码（仅注册） */}
            {mode === "register" && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-2">确认密码</label>
                <div className="relative">
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    placeholder="请再次输入密码" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    onKeyDown={handleKeyDown} 
                    className="input-field w-full pl-4 pr-10 py-3 text-[14px]" 
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showConfirmPassword ? (
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
            )}
          </div>

          <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full mt-6 py-3 text-[14px] font-semibold disabled:opacity-50">
            {loading ? "处理中..." : mode === "login" ? "登 录" : "注 册"}
          </button>

          {msg && (
            <div className={`mt-4 px-3.5 py-2.5 rounded-xl text-[12px] flex items-center gap-2 ${msgType === "err" ? "bg-rose-50 text-rose-600" : msgType === "ok" ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-500"}`}>
              {msgType === "ok" && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              {msgType === "err" && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0L3.16 16.25A2 2 0 005 19z" /></svg>}
              <span>{msg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}