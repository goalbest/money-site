"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !password.trim()) {
      setError("请输入账号和密码");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // ★ 去数据库验证账号和密码
      const { data, error: dbError } = await supabase
        .from("users") // 如果你的表名叫 profiles 或其他，请把 "users" 改掉
        .select("id, username, role")
        .eq("username", phone.trim())
        .eq("password", password.trim()) // 匹配密码
        .maybeSingle();

      if (dbError) throw dbError;

      if (!data) {
        setError("账号或密码错误，请重试");
        setLoading(false);
        return;
      }

      // 登录成功，写入缓存
      localStorage.setItem("user_id", String(data.id));
      localStorage.setItem("username", data.username || phone);
      if (data.role) localStorage.setItem("role", data.role);

      // 强制跳转，确保所有页面重新读取状态
      window.location.replace("/");
    } catch (err: any) {
      console.error(err);
      setError("登录服务异常，请稍后再试");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <img 
              src="/web-app-manifest-512x512.png" 
              alt="App Logo" 
              className="w-full h-full object-contain rounded-[22px] shadow-lg shadow-purple-500/20" 
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">恭喜发财</h1>
          <p className="text-sm text-slate-500 mt-2">个人软件不支持注册</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100">
          <div className="mb-4">
            <label className="block text-[13px] font-medium text-slate-700 mb-2">手机号 / 账号</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入账号"
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[15px] outline-none focus:border-purple-500 focus:bg-white transition-all tabular"
              disabled={loading}
            />
          </div>

          <div className="mb-5">
            <label className="block text-[13px] font-medium text-slate-700 mb-2">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[15px] outline-none focus:border-purple-500 focus:bg-white transition-all"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="mb-4 text-[13px] text-rose-500 bg-rose-50 px-3 py-2.5 rounded-lg border border-rose-100 flex items-center gap-1.5 animate-fade-in">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0L3.16 16.25A2 2 0 005 19z" /></svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-[15px] font-bold rounded-xl active:scale-[0.98] transition-all disabled:opacity-70 flex justify-center items-center shadow-lg shadow-purple-500/20"
          >
            {loading ? "验证中..." : "安全登录"}
          </button>
        </form>
      </div>
    </div>
  );
}