"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  // ★ 新增：Tab 切换状态
  const [activeTab, setActiveTab] = useState<"config" | "users">("config");

  // 配置项状态
  const [wechatGroup, setWechatGroup] = useState<string | null>(null);
  const [wechatDonate, setWechatDonate] = useState<string | null>(null);
  const [alipayDonate, setAlipayDonate] = useState<string | null>(null);

  // ★ 新增：用户列表状态
  const [usersData, setUsersData] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const groupInputRef = useRef<HTMLInputElement>(null);
  const wDonateInputRef = useRef<HTMLInputElement>(null);
  const aDonateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role === "admin") {
      setIsAdmin(true);
      loadConfigs();
      fetchUsers();
    }
  }, []);

  async function loadConfigs() {
    const { data } = await supabase
      .from("app_config")
      .select("key, value")
      .in("key", ["wechat_qr", "wechat_donate", "alipay_donate"]);
    
    if (data) {
      data.forEach(item => {
        if (item.key === "wechat_qr") setWechatGroup(item.value);
        if (item.key === "wechat_donate") setWechatDonate(item.value);
        if (item.key === "alipay_donate") setAlipayDonate(item.value);
      });
    }
  }

  // ★ 获取用户列表
  async function fetchUsers() {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("id", { ascending: false }); // 最新的用户排在前面
      
    if (data) setUsersData(data);
    setLoadingUsers(false);
  }

  function handleVerify() {
    if (password === "18739478938") {
      setIsAdmin(true);
      setMsg("");
      loadConfigs();
      fetchUsers();
    } else {
      setMsg("密码错误，请重试");
    }
  }

  async function handleUpload(key: string, file: File | undefined) {
    if (!file) return;
    setUploadingType(key);
    setMsg("");

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Str = event.target?.result as string;
      
      const { error } = await supabase.from("app_config").upsert({
        key: key,
        value: base64Str,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        setMsg(`上传失败: ${error.message}`);
      } else {
        setMsg("✅ 图片已更新并生效！");
        if (key === "wechat_qr") setWechatGroup(base64Str);
        if (key === "wechat_donate") setWechatDonate(base64Str);
        if (key === "alipay_donate") setAlipayDonate(base64Str);
      }
      setUploadingType(null);
    };
    reader.readAsDataURL(file);
  }

  // 复制文本功能
  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    setMsg("✅ 已复制到剪贴板");
    setTimeout(() => setMsg(""), 2000);
  }

  // 过滤用户
  const filteredUsers = usersData.filter(u => 
    (u.username && u.username.includes(searchQuery)) || 
    (u.phone && u.phone.includes(searchQuery))
  );

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white p-8 rounded-2xl shadow-sm max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">超级管理员验证</h1>
          <p className="text-xs text-slate-500 mb-6">请输入管理员手机号进行身份验证</p>
          
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="输入管理员手机号"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl mb-3 text-center font-mono outline-none focus:border-purple-500"
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          />
          {msg && <div className="text-rose-500 text-xs mb-3">{msg}</div>}
          
          <button onClick={handleVerify} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-all">
            进入后台
          </button>
          <button onClick={() => router.push("/")} className="mt-4 text-slate-400 text-xs hover:text-slate-600">返回首页</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* 顶部导航 */}
      <div className="bg-white sticky top-0 z-10 border-b border-slate-200">
        <div className="max-w-md mx-auto px-4 flex h-14 items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">管理后台</h1>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab("config")}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                activeTab === "config" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              配置
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                activeTab === "users" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              用户管理
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 mt-6">
        {msg && (
          <div className={`mb-4 p-3 rounded-xl text-sm font-medium text-center ${msg.includes('失败') ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {msg}
          </div>
        )}

        {/* ================== 配置 Tab ================== */}
        {activeTab === "config" && (
          <div className="space-y-4 animate-fade-in">
            {/* 1. 微信群二维码 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-slate-800">1. 微信群二维码</h2>
                <span className="text-[10px] text-slate-400">7天自动过期</span>
              </div>
              <div className="flex gap-4 items-center">
                {wechatGroup ? (
                  <img src={wechatGroup} className="w-20 h-20 rounded-lg border object-contain bg-slate-50" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">未上传</div>
                )}
                <div className="flex-1">
                  <input type="file" accept="image/*" className="hidden" ref={groupInputRef} onChange={(e) => handleUpload("wechat_qr", e.target.files?.[0])} />
                  <button onClick={() => groupInputRef.current?.click()} disabled={uploadingType === "wechat_qr"} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors">
                    {uploadingType === "wechat_qr" ? "上传中..." : "更换群二维码"}
                  </button>
                </div>
              </div>
            </div>

            {/* 2. 微信赞赏码 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-slate-800 text-green-600">2. 微信赞赏码</h2>
                <span className="text-[10px] text-slate-400">用户打赏用</span>
              </div>
              <div className="flex gap-4 items-center">
                {wechatDonate ? (
                  <img src={wechatDonate} className="w-20 h-20 rounded-lg border object-contain bg-slate-50" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">未上传</div>
                )}
                <div className="flex-1">
                  <input type="file" accept="image/*" className="hidden" ref={wDonateInputRef} onChange={(e) => handleUpload("wechat_donate", e.target.files?.[0])} />
                  <button onClick={() => wDonateInputRef.current?.click()} disabled={uploadingType === "wechat_donate"} className="w-full py-2 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg transition-colors">
                    {uploadingType === "wechat_donate" ? "上传中..." : "更换微信赞赏码"}
                  </button>
                </div>
              </div>
            </div>

            {/* 3. 支付宝赞赏码 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-slate-800 text-blue-600">3. 支付宝赞赏码</h2>
                <span className="text-[10px] text-slate-400">用户打赏用</span>
              </div>
              <div className="flex gap-4 items-center">
                {alipayDonate ? (
                  <img src={alipayDonate} className="w-20 h-20 rounded-lg border object-contain bg-slate-50" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">未上传</div>
                )}
                <div className="flex-1">
                  <input type="file" accept="image/*" className="hidden" ref={aDonateInputRef} onChange={(e) => handleUpload("alipay_donate", e.target.files?.[0])} />
                  <button onClick={() => aDonateInputRef.current?.click()} disabled={uploadingType === "alipay_donate"} className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors">
                    {uploadingType === "alipay_donate" ? "上传中..." : "更换支付宝赞赏码"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================== 用户管理 Tab ================== */}
        {activeTab === "users" && (
          <div className="space-y-4 animate-fade-in">
            {/* 顶部统计和搜索 */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="搜索手机号或用户名..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500 shadow-sm transition-all"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="bg-purple-50 text-purple-700 px-3 py-2.5 rounded-xl text-sm font-bold border border-purple-100 whitespace-nowrap">
                共 {usersData.length} 人
              </div>
            </div>

            {/* 用户列表 */}
            {loadingUsers ? (
              <div className="text-center py-10 text-slate-400 text-sm">加载用户数据中...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">没有找到相关用户</div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {filteredUsers.map((u, i) => (
                  <div key={u.id} className="p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                          {u.username ? u.username.slice(-2) : "U"}
                        </div>
                        <div>
                          <div className="text-[14px] font-bold text-slate-900">{u.username || "未设用户名"}</div>
                          <div className="text-[11px] text-slate-400 font-mono">ID: {u.id}</div>
                        </div>
                      </div>
                      {u.role === "admin" && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md border border-amber-200">超级管理员</span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mt-3 bg-slate-50 p-2.5 rounded-lg">
                      <div>
                        <div className="text-[10px] text-slate-400 mb-0.5">手机号</div>
                        <div className="font-mono text-[12px] text-slate-700 flex items-center gap-1.5 cursor-pointer hover:text-purple-600" onClick={() => copyText(u.phone || "")}>
                          {u.phone || "未绑定"}
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 mb-0.5">密码 (明文)</div>
                        <div className="font-mono text-[12px] text-rose-600 flex items-center gap-1.5 cursor-pointer hover:text-rose-700" onClick={() => copyText(u.password || "")}>
                          {u.password || "无"}
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="text-center text-[10px] text-slate-400 py-2">
              * 点击手机号或密码可一键复制
            </div>
          </div>
        )}

      </div>
    </div>
  );
}