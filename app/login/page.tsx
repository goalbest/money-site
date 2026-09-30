"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"info" | "err" | "ok">("info");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    if (loading) return;
    if (!username || username.length < 3) {
      setMsg("账号至少需要 3 个字符");
      setMsgType("err");
      return;
    }
    if (!password || password.length < 6) {
      setMsg("密码至少需要 6 位");
      setMsgType("err");
      return;
    }

    setLoading(true);
    setMsg(isLoginMode ? "登录中..." : "注册中...");
    setMsgType("info");

    if (isLoginMode) {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .eq("password", password)
        .single();

      if (error || !data) {
        setMsg("账号或密码错误，请重试");
        setMsgType("err");
        setLoading(false);
      } else {
        localStorage.setItem("username", username);
        localStorage.setItem("user_id", String(data.id));
        setMsg("登录成功，正在跳转...");
        setMsgType("ok");
        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 800);
      }
    } else {
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (existingUser) {
        setMsg("该账号已被注册，请直接登录");
        setMsgType("err");
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("users")
        .insert({ username, password });

      if (error) {
        setMsg("注册失败：" + error.message);
        setMsgType("err");
      } else {
        setMsg("注册成功！请使用刚设置的密码登录");
        setMsgType("ok");
        setIsLoginMode(true);
        setPassword("");
      }
      setLoading(false);
    }
  }

  function switchMode(login: boolean) {
    setIsLoginMode(login);
    setMsg("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">

        {/* 顶部：Logo + 标题 */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="w-16 h-16 mx-auto mb-4 rounded-3xl
                          bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500
                          flex items-center justify-center
                          shadow-xl shadow-purple-500/25">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-[22px] font-bold tracking-tight text-slate-900">
            理财净值观察站
          </div>
          <div className="text-[12px] text-slate-400 mt-1">
            记录你的每一份净值变化
          </div>
        </div>

        {/* 主卡片 */}
        <div className="card p-6 animate-fade-in-up delay-1">

          {/* 登录 / 注册 Tab */}
          <div className="segment-group flex mb-5">
            <button
              onClick={() => switchMode(true)}
              className={`flex-1 py-2.5 text-[13px] segment-item ${
                isLoginMode ? "segment-item-active" : "hover:text-slate-700"
              }`}
            >
              登录
            </button>
            <button
              onClick={() => switchMode(false)}
              className={`flex-1 py-2.5 text-[13px] segment-item ${
                !isLoginMode ? "segment-item-active" : "hover:text-slate-700"
              }`}
            >
              注册账号
            </button>
          </div>

          {/* 表单 */}
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] text-slate-500 mb-2">账号</label>
              <input
                type="text"
                placeholder="请输入账号（至少 3 位）"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="username"
                className="input-field w-full px-4 py-3 text-[14px]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-2">密码</label>
              <input
                type="password"
                placeholder="请输入密码（至少 6 位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete={isLoginMode ? "current-password" : "new-password"}
                className="input-field w-full px-4 py-3 text-[14px]"
              />
            </div>
          </div>

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full mt-5 py-3 text-[14px] font-semibold disabled:opacity-50"
          >
            {loading
              ? "处理中..."
              : isLoginMode
              ? "登录"
              : "立即注册"}
          </button>

          {/* 提示信息 */}
          {msg && (
            <div
              className={`mt-4 px-3.5 py-2.5 rounded-xl text-[12px] flex items-center gap-2 ${
                msgType === "err"
                  ? "bg-rose-50 text-rose-600"
                  : msgType === "ok"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-slate-50 text-slate-500"
              }`}
            >
              {msgType === "ok" && (
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {msgType === "err" && (
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0L3.16 16.25A2 2 0 005 19z" />
                </svg>
              )}
              <span>{msg}</span>
            </div>
          )}
        </div>

        {/* 底部声明 */}
        <div className="text-center text-[10px] text-slate-300 mt-6 leading-relaxed">
          登录即表示同意仅用于个人理财记录<br />
          数据保存在您自己的 Supabase 账户
        </div>
      </div>
    </div>
  );
}