"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [usersData, setUsersData] = useState<any[]>([]);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role === "admin") {
      setIsAdmin(true);
      fetchUsers();
    }
  }, []);

  async function fetchUsers() {
    const { data } = await supabase.from("users").select("*");
    if (data) setUsersData(data);
  }

  function handleVerify() {
    if (password === "18739478938") {
      setIsAdmin(true);
      fetchUsers();
    } else {
      setMsg("密码错误");
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white p-8 rounded-2xl shadow-sm max-w-sm w-full text-center">
          <h1 className="text-xl font-bold mb-4">主人验证</h1>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="输入密码" className="w-full px-4 py-3 bg-slate-50 border rounded-xl mb-3 text-center outline-none focus:border-purple-500"
          />
          {msg && <div className="text-rose-500 text-xs mb-3">{msg}</div>}
          <button onClick={handleVerify} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl">进入</button>
          <button onClick={() => router.push("/")} className="mt-4 text-slate-400 text-xs">返回首页</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="max-w-md mx-auto bg-white rounded-2xl p-6 shadow-sm mt-10">
        <h1 className="text-xl font-bold mb-4">系统用户</h1>
        <div className="text-slate-500 text-sm mb-4">当前注册人数：{usersData.length} 人</div>
        {usersData.map(u => (
          <div key={u.id} className="p-3 bg-slate-50 rounded-lg mb-2 flex justify-between items-center">
            <span className="font-bold text-slate-800">{u.username}</span>
            <span className="text-xs text-slate-400 font-mono">ID: {u.id}</span>
          </div>
        ))}
        <button onClick={() => router.push("/")} className="mt-6 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors">返回首页</button>
      </div>
    </div>
  );
}