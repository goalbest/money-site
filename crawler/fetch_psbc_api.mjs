import { createClient } from '@supabase/supabase-js';
import https from 'https';
import crypto from 'crypto';
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

// ── HTTPS ──
const AGENT = new https.Agent({
  rejectUnauthorized: false, minVersion: 'TLSv1', ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3,
});
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  'Referer': 'https://www.psbc-wm.com/',
  'Accept': 'application/json, text/plain, */*',
};
const BASE = 'https://www.psbc-wm.com';
const API = '/pswm-api';

function getJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'GET', headers: HEADERS, agent: AGENT,
    }, res => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error(`不是 JSON: ${d.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

// 拿最新 3 条净值（用真实日期）
async function fetchLatestNav(wpCode) {
  const u = new URL(BASE + API + '/product/nvlist');
  u.searchParams.set('wp_code', wpCode);
  u.searchParams.set('pageSize', '3');
  u.searchParams.set('pageNum', '1');
  const json = await getJson(u.toString());
  const list = json.data?.list || [];
  return list.map(x => ({
    nav_date: `${String(x.update_date).slice(0,4)}-${String(x.update_date).slice(4,6)}-${String(x.update_date).slice(6,8)}`,
    unit_nav: parseFloat(x.nav),
    accum_nav: parseFloat(x.accumulative_nav),
  }));
}

// ══════════════════════════════════
console.log('═══════════════════════════════');
console.log('邮储/中邮净值更新（真实日期）');
console.log('═══════════════════════════════\n');

// ── 周末跳过 ──
const dayOfWeek = new Date().getDay();
if (dayOfWeek === 0 || dayOfWeek === 6) {
  console.log('📅 周末不抓取，退出');
  process.exit(0);
}

console.log('→ 读 products 表...');
const { data: prods, error } = await supabase
  .from('products')
  .select('id, name, bank, bank_code')
  .in('bank', ['邮储银行', '中邮理财'])
  .not('bank_code', 'is', null);

if (error) { console.error('❌ 读 products 失败:', error.message); process.exit(1); }
console.log(`← 读到 ${prods.length} 个产品\n`);
if (prods.length === 0) { console.log('无产品，退出'); process.exit(0); }

const t0 = Date.now();
let ok = 0, failed = 0, noData = 0;

for (let i = 0; i < prods.length; i++) {
  const p = prods[i];
  try {
    const list = await fetchLatestNav(p.bank_code);
    if (list.length === 0) {
      console.log(`  ⚠️ [${i+1}/${prods.length}] ${p.name} 无数据`);
      noData++;
      await sleep(300);
      continue;
    }

    const latest = list[0];

    // 批量写（一次写 3 条，避免漏掉）
    await supabase.from('nav_history').upsert(
      list.map(x => ({
        product_id: p.id,
        nav_date: x.nav_date,
        unit_nav: x.unit_nav,
        accum_nav: x.accum_nav,
      })),
      { onConflict: 'product_id,nav_date' }
    );

    // 更新 products
    await supabase.from('products').update({
      unit_nav: latest.unit_nav,
      nav_date: latest.nav_date,
    }).eq('id', p.id);

    console.log(`  ✅ [${i+1}/${prods.length}] ${p.name} → ${latest.unit_nav} @ ${latest.nav_date}`);
    ok++;
    await sleep(400);
  } catch (e) {
    console.log(`  ❌ [${i+1}/${prods.length}] ${p.name}: ${e.message}`);
    failed++;
    await sleep(800);
  }
}

console.log(`\n🎉 成功 ${ok}，无数据 ${noData}，失败 ${failed}（${((Date.now()-t0)/1000).toFixed(1)}s）`);