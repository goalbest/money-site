// crawler/fetch_funds.mjs
// 基金/股票 每日净值更新脚本 (使用天天基金官方历史净值接口)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── env ──
(function loadEnv() {
  for (const p of [resolve(__dirname, '..', '.env.local'), resolve(process.cwd(), '.env.local')]) {
    if (existsSync(p)) {
      let c = readFileSync(p, 'utf-8').replace(/^\uFEFF/, '');
      c.split(/\r?\n/).forEach(l => {
        const m = l.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
        if (m) {
          const k = m[1].trim(); let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          if (!process.env[k]) process.env[k] = v;
        }
      });
      return;
    }
  }
})();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_URL;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ env 缺失'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('═══════════════════════════════');
console.log('基金 / 股票 净值更新');
console.log('═══════════════════════════════\n');

// 1. 读取所有产品
const { data: prods, error } = await supabase.from('fund_stocks').select('*');
if (error) { console.error('❌ 读库失败:', error.message); process.exit(1); }
console.log(`读到 ${prods.length} 个产品\n`);

let updatedCount = 0;

for (const p of prods) {
  try {
    if (p.type === 'fund') {
      console.log(`→ [基金] ${p.code} ${p.name}`);
      
      // ★ 换用天天基金官方历史净值接口，极度稳定
      const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${p.code}&pageIndex=1&pageSize=2`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Referer': `http://fundf10.eastmoney.com/`,
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
      });
      
      const text = await res.text();
      
      // 拦截器：如果被拦截，通常返回空或报错
      if (!text || text.includes('Forbidden')) {
        console.log(`   ⚠️ 接口被拦截，无法获取数据\n`);
        continue;
      }

      const json = JSON.parse(text);
      const list = json.Data?.LSJZList || [];
      
      if (list.length === 0) {
        console.log(`   ⚠️ 未获取到数据，可能代码错误或停牌\n`);
        continue;
      }

      const latest = list[0];
      const navDate = latest.FSRQ; // 净值日期
      const dwjz = parseFloat(latest.DWJZ); // 单位净值
      const prevDwjz = list.length > 1 ? parseFloat(list[1].DWJZ) : dwjz; // 昨日净值

      if (!navDate || isNaN(dwjz)) {
        console.log(`   ⚠️ 数据解析异常\n`);
        continue;
      }

      // 判断是否需要更新
      if (p.nav_date === navDate) {
        console.log(`   今日 (${navDate}) 已是最新，跳过\n`);
        continue;
      }

      // 更新主表
      await supabase.from('fund_stocks').update({
        prev_price: prevDwjz,
        current_price: dwjz,
        nav_date: navDate
      }).eq('id', p.id);

      // 写入历史表
      await supabase.from('fund_stock_history').upsert({
        product_id: p.id,
        nav_date: navDate,
        price: dwjz
      }, { onConflict: 'product_id, nav_date' });

      console.log(`   ✅ 更新成功: 净值 ${dwjz} @ ${navDate} (昨日: ${prevDwjz})\n`);
      updatedCount++;

    } else if (p.type === 'stock') {
      console.log(`→ [股票] ${p.code} ${p.name} (暂未接入股票行情源)\n`);
      continue;
    }
    
    await sleep(1000); // 稍微延迟，防封 IP
  } catch (err) {
    console.log(`   ❌ 失败: ${err.message}\n`);
  }
}

console.log(`🎉 完成！共更新 ${updatedCount} 个产品。`);