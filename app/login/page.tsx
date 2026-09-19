"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function handleSubmit() {
    if (!username || username.length < 3) return setMsg("账号至少需要 3 个字符");
    if (!password || password.length < 6) return setMsg("密码至少需要 6 位");

    setMsg("处理中...");

    if (isLoginMode) {
      // 登录
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .eq("password", password)
        .single();

      if (error || !data) {
        setMsg("账号或密码错误，请重试");
      } else {
        localStorage.setItem("username", username);
        setMsg("登录成功，正在跳转...");
        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 1000);
      }
    } else {
      // 注册
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (existingUser) {
        setMsg("该账号已被注册，请直接登录");
        return;
      }

      const { error } = await supabase
        .from("users")
        .insert({ username, password });

      if (error) {
        setMsg("注册失败：" + error.message);
      } else {
        setMsg("注册成功！请使用刚设置的密码登录");
        setIsLoginMode(true);
        setPassword("");
      }
    }
  }

  return (
    <main className="container mx-auto p-6 max-w-md mt-20 border rounded-lg shadow-sm bg-white">
      <div className="flex justify-center gap-6 mb-8 border-b pb-2">
        <button onClick={() => { setIsLoginMode(true); setMsg(""); }} className={`text-lg font-medium pb-2 ${isLoginMode ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}>登录</button>
        <button onClick={() => { setIsLoginMode(false); setMsg(""); }} className={`text-lg font-medium pb-2 ${!isLoginMode ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}>注册账号</button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">账号</label>
          <input type="text" placeholder="请输入账号" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border rounded px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">密码</label>
          <input type="password" placeholder="请输入密码（至少6位）" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded px-3 py-2" />
        </div>

        <button onClick={handleSubmit} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">
          {isLoginMode ? "登录" : "立即注册"}
        </button>

        {msg && <p className={`text-sm text-center mt-4 ${msg.includes("成功") ? "text-green-600" : "text-red-500"}`}>{msg}</p>}
      </div>
    </main>
  );
}