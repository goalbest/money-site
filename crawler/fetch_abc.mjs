// crawler/fetch_abc.mjs
// 农银理财净值抓取（官方 API，无签名）

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
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ env 缺失'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const API = 'https://ewealth.abchina.com/app/data/api/DataService/OwnProdNetValueFilterV3';

console.log('═══════════════════════════════');
console.log('农银理财净值更新');
console.log('═══════════════════════════════\n');

// 从 product_sources 读农行产品
const { data: sources, error: srcErr } = await supabase
  .from('product_sources')
  .select('id, product_id, params')
  .eq('source_type', 'abc')
  .eq('enabled', true);

if (srcErr) { console.error('❌ 读 product_sources 失败:', srcErr.message); process.exit(1); }

const ABC_PRODUCTS = (sources || []).map(s => ({
  dbId: s.product_id,
  srcId: s.id,
  productCode: s.params.product_code,
}));

console.log(`📌 读到 ${ABC_PRODUCTS.length} 个农行产品:\n`);
ABC_PRODUCTS.forEach(p => console.log(`   - ${p.productCode}`));
if (ABC_PRODUCTS.length === 0) { console.log('无产品，退出'); process.exit(0); }
console.log('');

async function fetchNav(productCode) {
  const url = `${API}?i=1&s=15000&w=${encodeURIComponent(productCode)}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      'Referer': 'https://wx.abchina.com/',
      'Accept': 'application/json, text/plain, */*',
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

let totalUpserted = 0;

for (const p of ABC_PRODUCTS) {
  console.log(`→ [${p.dbId}] ${p.productCode}`);
  try {
    const data = await fetchNav(p.productCode);

    // 兼容多种返回结构
    const list = data?.Data || data?.data || data?.result || [];
    if (!Array.isArray(list) || list.length === 0) {
      console.log(`   ⚠️ 无数据，返回结构: ${JSON.stringify(data).slice(0, 200)}\n`);
      continue;
    }

    console.log(`   拿到 ${list.length} 条`);
    console.log(`   样本: ${JSON.stringify(list[0]).slice(0, 200)}`);

    // 解析字段（兼容多种字段名）
    const rows = list.map(x => {
      const dateRaw = x.NetValueDate || x.navDate || x.date || x.FDate || '';
      const dateStr = String(dateRaw).replace(/\//g, '-').slice(0, 10);
      const nav = parseFloat(x.NetValue || x.unitNav || x.nav || x.UnitNetValue || 0);
      const accum = parseFloat(x.AccumNetValue || x.accumNav || x.accum_nav || 0);
      return {
        product_id: p.dbId,
        nav_date: dateStr,
        unit_nav: nav,
        accum_nav: isFinite(accum) && accum > 0 ? accum : null,
      };
    }).filter(r => r.nav_date && isFinite(r.unit_nav) && r.unit_nav > 0);

    console.log(`   有效 ${rows.length} 条`);

    if (rows.length === 0) { console.log('   ⚠️ 无有效数据\n'); continue; }

    // 按日期排序（新的在前）
    rows.sort((a, b) => b.nav_date.localeCompare(a.nav_date));

    // 批量 upsert（每批 30）
    let ok = 0;
    for (let i = 0; i < rows.length; i += 30) {
      const batch = rows.slice(i, i + 30);
      const { error } = await supabase.from('nav_history').upsert(batch, {
        onConflict: 'product_id,nav_date',
      });
      if (error) {
        console.log(`   ⚠️ 批次失败: ${error.message}`);
      } else {
        ok += batch.length;
      }
      await sleep(100);
    }
    totalUpserted += ok;

    // 更新 products
    const latest = rows[0];
    await supabase.from('products').update({
      unit_nav: latest.unit_nav,
      nav_date: latest.nav_date,
      bank_code: p.productCode,
      risk_level: 'R2',
      redeem_arrival_days: 2,
      redeem_confirm_days: 1,
      redeem_cutoff_time: '15:00',
    }).eq('id', p.dbId);

    await supabase.from('product_sources')
      .update({ last_fetch_at: new Date().toISOString(), last_error: null })
      .eq('id', p.srcId);

    console.log(`   ✅ 写入 ${ok} 条，最新: ${latest.unit_nav} @ ${latest.nav_date}\n`);
    await sleep(500);
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}\n`);
    await supabase.from('product_sources')
      .update({ last_error: e.message })
      .eq('id', p.srcId);
  }
}

console.log(`🎉 完成，共写入 ${totalUpserted} 条`);