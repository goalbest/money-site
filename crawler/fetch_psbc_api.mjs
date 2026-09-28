import { createClient } from '@supabase/supabase-js';
import https from 'https';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const USE_CACHE = process.env.USE_CACHE === '1';
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '400', 10);

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

const AGENT = new https.Agent({
  rejectUnauthorized: false, minVersion: 'TLSv1', ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3,
});
const API = 'https://s.psbc.com/portal/PsbcService/finquerytwo/';

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
        'Accept': '*/*', 'Referer': 'https://www.psbc.com/',
      }, agent: AGENT,
    }, res => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function fetchPage(pageNum) {
  const ts = Date.now();
  const params = new URLSearchParams({
    callback: 'cb', currency: '', deadline: '', netproduct: '', risklevel: '',
    entruststartamt: '', buystatus: '', product_status: '',
    zhongyouflag: '', bankflag: '', investor_nature: '', order: '',
    finkeyword: '', pageNum: String(pageNum), _: String(ts),
  });
  const text = await get(`${API}?${params}`);
  const m = text.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error('JSONP 解析失败');
  return JSON.parse(m[1]);
}

function parseYield(item) {
  const nav = parseFloat(item.LATEST_NET);
  if (isFinite(nav) && nav > 0) return { type: 'nav', value: nav };
  const sy = parseFloat(item.SEVEN_ANNUAL_YIELD);
  if (isFinite(sy) && sy > 0) return { type: 'seven_yield', value: sy };
  const wf = parseFloat(item.WF_EARN);
  if (isFinite(wf) && wf > 0) return { type: 'wf_earn', value: wf };
  return { type: 'none', value: null };
}

// ══════════════ 主流程 ══════════════
console.log('═══════════════════════════════');
console.log('邮储产品日常更新（只更新已有）');
console.log('═══════════════════════════════\n');

const t0 = Date.now();

// ── 读已有的 bank_code → id 映射（先读，减少抓取量）──
console.log('→ 读 products 表...');
const { data: prods, error } = await supabase
  .from('products').select('id, bank_code')
  .eq('bank', '邮储银行')
  .not('bank_code', 'is', null);
if (error) { console.error('❌', error.message); process.exit(1); }
const idByCode = new Map();
prods.forEach(p => idByCode.set(p.bank_code, p.id));
console.log(`← 已有 bank_code: ${idByCode.size} 条\n`);

// ── 抓取 ──
const first = await fetchPage(1);
const endPage = Math.min(first.pageCount, MAX_PAGES);
console.log(`📊 totalCount: ${first.totalCount}, 共 ${first.pageCount} 页，本轮抓 ${endPage} 页\n`);

const all = [...(first.resultList || [])];
for (let p = 2; p <= endPage; p++) {
  try {
    const data = await fetchPage(p);
    all.push(...(data.resultList || []));
    if (p % 50 === 0 || p === endPage) console.log(`  页 ${p}/${endPage} → 累计 ${all.length}`);
    await sleep(180);
  } catch (e) {
    console.log(`  ⚠️ 页 ${p} 失败`);
  }
}
console.log(`\n抓取完成: ${all.length} 条（${((Date.now()-t0)/1000).toFixed(0)}s）\n`);

// ── 筛选需要更新的 ──
const today = new Date().toISOString().slice(0, 10);
const tasks = [];
for (const item of all) {
  const pid = idByCode.get(item.SECODE);
  if (!pid) continue;
  const y = parseYield(item);
  if (y.type === 'none') continue;
  tasks.push({ pid, y, item });
}
console.log(`需更新: ${tasks.length} 条\n`);

// ── 5 并发更新 ──
let updated = 0, failed = 0;
const CONCURRENCY = 5;

for (let i = 0; i < tasks.length; i += CONCURRENCY) {
  const batch = tasks.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(async ({ pid, y, item }) => {
    try {
      if (y.type === 'nav') {
        await supabase.from('products').update({ unit_nav: y.value, nav_date: today }).eq('id', pid);
        await supabase.from('nav_history').upsert(
          { product_id: pid, nav_date: today, unit_nav: y.value },
          { onConflict: 'product_id,nav_date' }
        );
      } else {
        const updates = { nav_date: today };
        const sy = parseFloat(item.SEVEN_ANNUAL_YIELD);
        const wf = parseFloat(item.WF_EARN);
        if (isFinite(sy) && sy > 0) updates.annual_7d_yield = sy;
        if (isFinite(wf) && wf > 0) updates.daily_income = wf;
        await supabase.from('products').update(updates).eq('id', pid);
      }
      updated++;
    } catch (e) {
      failed++;
    }
  }));
  if ((i + CONCURRENCY) % 200 < CONCURRENCY) {
    console.log(`  进度 ${Math.min(i+CONCURRENCY, tasks.length)}/${tasks.length} → 成功 ${updated}，失败 ${failed}`);
  }
}

console.log(`\n🎉 更新 ${updated}，失败 ${failed}（总耗时 ${((Date.now()-t0)/1000).toFixed(0)}s）`);