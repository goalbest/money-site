import { createClient } from '@supabase/supabase-js';
import https from 'https';
import crypto from 'crypto';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const USE_CACHE = process.env.USE_CACHE === '1';
const MAX_NEW = parseInt(process.env.MAX_NEW || '999999', 10);

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

// ── HTTP ──
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
function riskToLevel(code) {
  return ({ '1': 'PR1', '2': 'PR2', '3': 'PR3', '4': 'PR4', '5': 'PR5' })[String(code)] || null;
}

// ══════════════ 主流程 ══════════════
console.log('═══════════════════════════════');
console.log('邮储全量入库');
console.log('═══════════════════════════════\n');

const CACHE_FILE = resolve(__dirname, 'psbc_cache.json');
let all = [];

if (USE_CACHE && existsSync(CACHE_FILE)) {
  all = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  console.log(`📦 从缓存读: ${all.length} 条\n`);
} else {
  const first = await fetchPage(1);
  const endPage = first.pageCount;
  console.log(`📊 totalCount: ${first.totalCount}, 共 ${endPage} 页\n`);
  all.push(...(first.resultList || []));
  for (let p = 2; p <= endPage; p++) {
    try {
      const data = await fetchPage(p);
      all.push(...(data.resultList || []));
      if (p % 50 === 0 || p === endPage) console.log(`  页 ${p}/${endPage} → 累计 ${all.length}`);
      await sleep(200);
    } catch { console.log(`  ⚠️ 页 ${p} 失败`); }
  }
  console.log(`\n抓取完成: ${all.length} 条`);
  writeFileSync(CACHE_FILE, JSON.stringify(all));
  console.log(`💾 缓存到 ${CACHE_FILE}\n`);
}

// ── 读已有 ──
console.log('→ 读 products 表...');
const { data: prods, error } = await supabase
  .from('products').select('id, bank_code').not('bank_code', 'is', null);
if (error) { console.error('❌', error.message); process.exit(1); }
const existing = new Map();
prods.forEach(p => existing.set(p.bank_code, p.id));
console.log(`← 已有 bank_code: ${existing.size} 条\n`);

// ── 分流 ──
const toCreate = [];
let skipped = 0;
for (const item of all) {
  if (!item.SECODE || !item.FPNAME) { skipped++; continue; }
  if (existing.has(item.SECODE)) { skipped++; continue; }
  if (parseYield(item).type === 'none') { skipped++; continue; }
  toCreate.push(item);
}
const endN = Math.min(toCreate.length, MAX_NEW);
console.log(`待新建: ${toCreate.length}，本轮跑: ${endN}，跳过: ${skipped}\n`);

// ── 逐条新建 + 详细错误 ──
const today = new Date().toISOString().slice(0, 10);
let created = 0, failed = 0;
const errorSamples = [];

for (let i = 0; i < endN; i++) {
  const item = toCreate[i];
  const y = parseYield(item);
  const wfEarn = parseFloat(item.WF_EARN);

  const row = {
    name: item.FPNAME,
    bank: '邮储银行',
    bank_code: item.SECODE,
    unit_nav: y.type === 'nav' ? y.value : null,
    annual_7d_yield: y.type === 'seven_yield' ? y.value : null,
    daily_income: isFinite(wfEarn) && wfEarn > 0 ? wfEarn : null,
    risk_level: riskToLevel(item.RISKLEVEL),
    nav_date: today,
  };

  const { error: e } = await supabase.from('products').insert(row);
  if (e) {
    failed++;
    if (errorSamples.length < 5) errorSamples.push({ code: item.SECODE, msg: e.message, details: e.details, hint: e.hint });
  } else {
    created++;
  }

  if ((i + 1) % 10 === 0) {
    console.log(`  ${i+1}/${endN} → 成功 ${created}，失败 ${failed}`);
  }
  await sleep(400);
}

console.log(`\n🎉 成功 ${created}，失败 ${failed}`);
if (errorSamples.length > 0) {
  console.log('\n错误样本:');
  errorSamples.forEach(s => {
    console.log(`\n❌ ${s.code}`);
    console.log(`   message: ${s.msg}`);
    if (s.details) console.log(`   details: ${s.details}`);
    if (s.hint) console.log(`   hint: ${s.hint}`);
  });
}