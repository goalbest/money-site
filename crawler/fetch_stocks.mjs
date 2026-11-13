// crawler/fetch_stocks.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import iconv from 'iconv-lite'; // ★ 引入编码转换

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
console.log('股票行情、日K线、分时线更新');
console.log('═══════════════════════════════\n');

const { data: prods, error } = await supabase.from('fund_stocks').select('*').eq('type', 'stock');
if (error) { console.error('❌ 读库失败:', error.message); process.exit(1); }
console.log(`读到 ${prods.length} 只股票\n`);

let updatedCount = 0;

for (const p of prods) {
  try {
    console.log(`→ [股票] ${p.code} ${p.name}`);
    let marketCode = /^6/.test(p.code) ? `sh${p.code}` : `sz${p.code}`;

    // ── 1. 实时行情 (GBK 编码处理) ──
    const res = await fetch(`http://qt.gtimg.cn/q=${marketCode}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://gu.qq.com/' } });
    const arrayBuffer = await res.arrayBuffer();
    const text = iconv.decode(Buffer.from(arrayBuffer), 'gbk'); // ★ 用 GBK 解码
    
    const match = text.match(/="([^"]+)"/);
    if (!match) { console.log(`   ⚠️ 行情失败`); continue; }
    
    const fields = match[1].split('~');
    const currentPrice = parseFloat(fields[3]);
    const prevPrice = parseFloat(fields[4]);
    if (isNaN(currentPrice)) continue;

    // ── 2. 历史日K线 (前复权) ──
    const klineRes = await fetch(`http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketCode},day,,,320,qfq`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const klineJson = await klineRes.json();
    const klineData = klineJson.data[marketCode]?.qfqday || klineJson.data[marketCode]?.day || [];
    
    let allRows = [];
    for (const k of klineData) {
      const closePrice = parseFloat(k[2]);
      if (k[0] && !isNaN(closePrice)) {
        allRows.push({ product_id: p.id, nav_date: k[0], price: closePrice });
      }
    }
    if (allRows.length > 0) {
      await supabase.from('fund_stock_history').upsert(allRows, { onConflict: 'product_id, nav_date' });
    }

    // ── 3. 抓取今日分时数据 ──
    const todayStr = new Date().toISOString().split('T')[0];
    const minuteUrl = `http://data.gtimg.cn/flashdata/hushen/minute/${marketCode}.js?t=${Date.now()}`;
    const minuteRes = await fetch(minuteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const minuteArrayBuffer = await minuteRes.arrayBuffer();
    const minuteText = iconv.decode(Buffer.from(minuteArrayBuffer), 'gbk');
    
    const minMatch = minuteText.match(/="([\s\S]+)"/);
    if (minMatch) {
      const lines = minMatch[1].split('\\n');
      const minuteRows = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(' ');
        if (parts.length >= 2) {
          const t = parts[0];
          const timeStr = `${t.slice(0, 2)}:${t.slice(2, 4)}`;
          const mPrice = parseFloat(parts[1]);
          if (!isNaN(mPrice)) {
            minuteRows.push({ product_id: p.id, trade_date: todayStr, time_str: timeStr, price: mPrice });
          }
        }
      }
      if (minuteRows.length > 0) {
        await supabase.from('stock_minute_data').upsert(minuteRows, { onConflict: 'product_id, trade_date, time_str' });
        console.log(`   📈 分时数据存入 ${minuteRows.length} 条`);
      }
    }

    // ── 4. 更新主表 (★ 不再用乱码名字覆盖原有的名字) ──
    await supabase.from('fund_stocks').update({
      prev_price: prevPrice, current_price: currentPrice, nav_date: todayStr
    }).eq('id', p.id);

    console.log(`   ✅ K线与行情已更新\n`);
    updatedCount++;
    await sleep(2000); 
  } catch (err) {
    console.log(`   ❌ 失败: ${err.message}\n`);
  }
}

console.log(`🎉 完成！共处理 ${updatedCount} 只股票。`);