"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function FixPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  function calcAnnualized(navs: any[], periodMonths: number) {
    if (!navs || navs.length < 2) return 0;
    const sorted = [...navs].sort((a, b) => new Date(a.nav_date).getTime() - new Date(b.nav_date).getTime());
    const latest = sorted[sorted.length - 1];
    const latestDate = new Date(latest.nav_date);
    
    let targetDate = new Date(latestDate);
    targetDate.setMonth(targetDate.getMonth() - periodMonths);

    let closestNav = sorted[0];
    let minDiff = Infinity;
    for (const item of sorted) {
      const diff = Math.abs(new Date(item.nav_date).getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestNav = item;
      }
    }

    const actualDays = Math.max(1, (latestDate.getTime() - new Date(closestNav.nav_date).getTime()) / 86400000);
    const returnRate = (Number(latest.unit_nav) / Number(closestNav.unit_nav)) - 1;
    return (returnRate / actualDays) * 365 * 100;
  }

  async function startFix() {
    setRunning(true);
    setLogs(["开始读取产品列表..."]);
    
    const { data: products, error } = await supabase.from("products").select("id, name");
    if (error) {
      setLogs(prev => [...prev, `❌ 读取失败: ${error.message}`]);
      setRunning(false);
      return;
    }

    setLogs(prev => [...prev, `✅ 找到 ${products.length} 个产品，开始逐个计算...`]);

    let count = 0;
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      
      const { data: navs } = await supabase
        .from("nav_history")
        .select("nav_date, unit_nav")
        .eq("product_id", p.id)
        .order("nav_date", { ascending: true });

      if (!navs || navs.length < 2) {
        setLogs(prev => [...prev, `[${i+1}/${products.length}] ${p.name} ⚠️ 净值数据不足，跳过`]);
        continue;
      }

      const annual_1m = calcAnnualized(navs, 1);
      const annual_3m = calcAnnualized(navs, 3);
      const annual_6m = calcAnnualized(navs, 6);
      const annual_1y = calcAnnualized(navs, 12);
      
      let annual_7d = 0;
      const latest = new Date(navs[navs.length - 1].nav_date);
      let target = new Date(latest); target.setDate(target.getDate() - 7);
      let closest = navs[0], minDiff = Infinity;
      for (const n of navs) {
        const diff = Math.abs(new Date(n.nav_date).getTime() - target.getTime());
        if (diff < minDiff) { minDiff = diff; closest = n; }
      }
      const days7 = Math.max(1, (latest.getTime() - new Date(closest.nav_date).getTime()) / 86400000);
      if (days7 >= 5 && days7 <= 10) {
        annual_7d = (((Number(navs[navs.length - 1].unit_nav) / Number(closest.unit_nav)) - 1) / days7) * 365 * 100;
      }

      const updates = {
        annual_7d_yield: Number(annual_7d.toFixed(4)),
        annualized_1m: Number(annual_1m.toFixed(4)),
        annual_3m_yield: Number(annual_3m.toFixed(4)),
        annual_6m_yield: Number(annual_6m.toFixed(4)),
        annual_1y_yield: Number(annual_1y.toFixed(4)),
      };

      const { error: upErr } = await supabase.from("products").update(updates).eq("id", p.id);
      
      if (upErr) {
        setLogs(prev => [...prev, `[${i+1}/${products.length}] ${p.name} ❌ 写入失败: ${upErr.message}`]);
      } else {
        setLogs(prev => [...prev, `[${i+1}/${products.length}] ${p.name} ✅ 1月: ${annual_1m.toFixed(2)}%`]);
        count++;
      }
    }

    setLogs(prev => [...prev, `🎉 全部完成！共修复 ${count} 个产品。`]);
    setDone(true);
    setRunning(false);
  }

  return (
    <div className="min-h-screen p-8 bg-slate-50 font-mono text-sm">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm p-6 border border-slate-200">
        <h1 className="text-xl font-bold text-slate-800 mb-4">全库年化数据一键修复工具</h1>
        <p className="text-slate-500 mb-6">点击下方按钮，浏览器将直接连接数据库拉取净值，计算正确的自然日历年化并更新。</p>
        
        {!done && (
          <button 
            onClick={startFix} 
            disabled={running}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-colors mb-6"
          >
            {running ? "正在修复中，请勿关闭页面..." : "开始一键修复"}
          </button>
        )}

        <div className="bg-slate-900 text-emerald-400 p-4 rounded-lg h-[400px] overflow-y-auto space-y-1">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
          {running && <div className="animate-pulse">_</div>}
        </div>
      </div>
    </div>
  );
}