// crawler/fetch_funds.mjs
// 仅用于抓取基金净值

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
console.log('基金净值更新（全量补全模式）');
console.log('═══════════════════════════════\n');

const { data: prods, error } = await supabase.from('fund_stocks').select('*').eq('type', 'fund');
if (error) { console.error('❌ 读库失败:', error.message); process.exit(1); }
console.log(`读到 ${prods.length} 个基金\n`);

let updatedCount = 0;

for (const p of prods) {
  try {
    console.log(`→ [基金] ${p.code} ${p.name}`);
    
    const { count: recordCount } = await supabase
      .from('fund_stock_history')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', p.id);

    const { data: earliestData } = await supabase
      .from('fund_stock_history')
      .select('nav_date')
      .eq('product_id', p.id)
      .order('nav_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    
    const earliestDate = earliestData?.nav_date || '1970-01-01';
    const isIncomplete = (recordCount || 0) < 100;
    
    if (isIncomplete) console.log(`   现有数据仅 ${recordCount || 0} 条，开启【全量补全模式】`);
    
    let pageIndex = 1;
    let hasMore = true;
    let allRows = [];
    let latestRow = null;

    while (hasMore) {
      const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${p.code}&pageIndex=${pageIndex}&pageSize=20`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Referer': `http://fundf10.eastmoney.com/`,
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
      });
      
      const text = await res.text();
      if (!text || text.includes('Forbidden')) { console.log(`   ⚠️ 接口被拦截`); break; }

      const json = JSON.parse(text);
      const list = json.Data?.LSJZList || [];
      
      if (list.length === 0) { console.log(`   翻到最后一页`); break; }
      if (!latestRow) latestRow = list[0];

      let hitOld = false;
      for (const item of list) {
        const navDate = item.FSRQ;
        const dwjz = parseFloat(item.DWJZ);
        if (!navDate || isNaN(dwjz)) continue;
        
        if (!isIncomplete && navDate <= earliestDate) { hitOld = true; break; }
        
        allRows.push({ product_id: p.id, nav_date: navDate, price: dwjz });
      }

      if (hitOld) { console.log(`   翻到已知区域，停止翻页`); break; }
      pageIndex++;
      await sleep(500);
    }

    if (allRows.length > 0) {
      for (let i = 0; i < allRows.length; i += 100) {
        await supabase.from('fund_stock_history').upsert(allRows.slice(i, i + 100), { onConflict: 'product_id, nav_date' });
      }
      console.log(`   ✅ 写入历史数据 ${allRows.length} 条`);
    } else {
      console.log(`   历史数据已是最全`);
    }

    if (latestRow) {
      const latestNavDate = latestRow.FSRQ;
      const latestDwjz = parseFloat(latestRow.DWJZ);
      
      const { data: prevRows } = await supabase
        .from('fund_stock_history')
        .select('price')
        .eq('product_id', p.id)
        .lt('nav_date', latestNavDate)
        .order('nav_date', { ascending: false })
        .limit(1);
      
      const prevPrice = prevRows?.length > 0 ? prevRows[0].price : latestDwjz;

      await supabase.from('fund_stocks').update({
        prev_price: prevPrice, current_price: latestDwjz, nav_date: latestNavDate
      }).eq('id', p.id);

      console.log(`   📝 最新: ${latestDwjz} @ ${latestNavDate} (昨日: ${prevPrice})\n`);
    }

    updatedCount++;
  } catch (err) {
    console.log(`   ❌ 失败: ${err.message}\n`);
  }
}

console.log(`🎉 完成！共处理 ${updatedCount} 个基金。`);