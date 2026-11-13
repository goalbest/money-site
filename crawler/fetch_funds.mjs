// crawler/fetch_funds.mjs
// 基金/股票 每日净值更新脚本 (使用天天基金公开接口)

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
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
      
      // 天天基金实时估值接口
      const res = await fetch(`http://fundgz.1234567.com.cn/js/${p.code}.js?rt=${Date.now()}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'http://fund.eastmoney.com/'
        }
      });
      const text = await res.text();
      
      // 解析 JSONP: jsonpgz({...});
      const match = text.match(/jsonpgz\((.*)\);/);
      if (!match) {
        console.log(`   ⚠️ 未获取到数据，可能代码错误或停牌\n`);
        continue;
      }
      
      const data = JSON.parse(match[1]);
      const navDate = data.jzrq; // 净值日期 (e.g., "2023-11-13")
      const dwjz = parseFloat(data.dwjz); // 单位净值
      
      if (!navDate || isNaN(dwjz)) {
        console.log(`   ⚠️ 数据解析异常\n`);
        continue;
      }

      // 判断是否需要更新
      if (p.nav_date === navDate) {
        console.log(`   今日 (${navDate}) 已是最新，跳过\n`);
        continue;
      }

      // 拿昨天的净值 (用于前端算今日收益)
      const prevPrice = p.current_price || dwjz;

      // 更新主表
      await supabase.from('fund_stocks').update({
        prev_price: prevPrice,
        current_price: dwjz,
        nav_date: navDate
      }).eq('id', p.id);

      // 写入历史表
      await supabase.from('fund_stock_history').upsert({
        product_id: p.id,
        nav_date: navDate,
        price: dwjz
      }, { onConflict: 'product_id, nav_date' });

      console.log(`   ✅ 更新成功: 净值 ${dwjz} @ ${navDate}\n`);
      updatedCount++;

    } else if (p.type === 'stock') {
      // ── 股票抓取逻辑（预留，后续可接新浪/腾讯行情） ──
      console.log(`→ [股票] ${p.code} ${p.name} (暂未接入股票行情源)\n`);
      continue;
    }
    
    await sleep(500); // 稍微延迟，防封 IP
  } catch (err) {
    console.log(`   ❌ 失败: ${err.message}\n`);
  }
}

console.log(`🎉 完成！共更新 ${updatedCount} 个产品。`);