import { createClient } from '@supabase/supabase-js';
import https from 'https';
import crypto from 'crypto';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DRY_RUN = process.env.DRY_RUN === '1';
const USE_CACHE = process.env.USE_CACHE === '1';

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

async function fetchPage(pageNum, keyword = '') {
  const ts = Date.now();
  const params = new URLSearchParams({
    callback: 'cb',
    currency: '', deadline: '', netproduct: '', risklevel: '',
    entruststartamt: '', buystatus: '', product_status: '',
    zhongyouflag: '', bankflag: '', investor_nature: '', order: '',
    finkeyword: keyword, pageNum: String(pageNum), _: String(ts),
  });
  const text = await get(`${API}?${params}`);
  const m = text.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error('JSONP 解析失败: ' + text.slice(0, 200));
  return JSON.parse(m[1]);
}

function parseYield(item) {
  const nav = parseFloat(item.LATEST_NET);
  if (isFinite(nav) && nav > 0) return { type: 'nav', value: nav };
  const sevenYield = parseFloat(item.SEVEN_ANNUAL_YIELD);
  if (isFinite(sevenYield) && sevenYield > 0) return { type: 'seven_yield', value: sevenYield };
  const wfEarn = parseFloat(item.WF_EARN);
  if (isFinite(wfEarn) && wfEarn > 0) return { type: 'wf_earn', value: wfEarn };
  return { type: 'none', value: null };
}

function riskToLevel(code) {
  const map = { '1': 'PR1', '2': 'PR2', '3': 'PR3', '4': 'PR4', '5': 'PR5' };
  return map[String(code)] || null;
}

// ══════════════ 主流程 ══════════════
console.log('═══════════════════════════════');
console.log('邮储全量产品 JSONP 接口');
console.log('═══════════════════════════════\n');

const CACHE_FILE = resolve(__dirname, 'psbc_cache.json');
let all = [];

if (USE_CACHE) {
  console.log(`📦 从缓存读取: ${CACHE_FILE}`);
  if (!existsSync(CACHE_FILE)) { console.error('❌ 缓存不存在'); process.exit(1); }
  all = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  console.log(`  共 ${all.length} 个产品\n`);
} else {
  const first = await fetchPage(1);
  console.log(`📊 totalCount: ${first.totalCount}, pageCount: ${first.pageCount}`);

  if (DRY_RUN) { console.log('[DRY_RUN] 退出'); process.exit(0); }

  const MAX_PAGES = parseInt(process.env.MAX_PAGES || String(first.pageCount), 10);
  const endPage = Math.min(first.pageCount, MAX_PAGES);
  console.log(`\n抓取 (1 ~ ${endPage} / 共 ${first.pageCount} 页)...`);

  all.push(...(first.resultList || []));
  for (let p = 2; p <= endPage; p++) {
    try {
      const data = await fetchPage(p);
      all.push(...(data.resultList || []));
      if (p % 20 === 0 || p === endPage) console.log(`  页 ${p}/${endPage} → 累计 ${all.length}`);
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      console.log(`  ⚠️ 页 ${p} 失败: ${e.message}`);
    }
  }
  console.log(`\n抓取完成: ${all.length} 个产品`);
  writeFileSync(CACHE_FILE, JSON.stringify(all));
  console.log(`💾 已缓存\n`);
}

// ── 统计收益类型 ──
const typeCount = { nav: 0, seven_yield: 0, wf_earn: 0, none: 0 };
for (const item of all) typeCount[parseYield(item).type]++;
console.log('收益类型分布:', typeCount);

// ── 读已有 products ──
console.log('\n→ 读 products 表...');
const { data: prods, error } = await supabase
  .from('products').select('id, bank_code').not('bank_code', 'is', null);
if (error) {
  console.error('❌ 读取失败:', error.message);
  console.log('\n（本地网络不通，缓存已保存，去 GitHub Actions 跑）');
  process.exit(0);
}
const byBankCode = new Map();
prods.forEach(p => byBankCode.set(p.bank_code, p));
console.log(`← 已有 bank_code 的产品: ${byBankCode.size} 条\n`);

// ── 分流：更新 vs 新建 ──
const today = new Date().toISOString().slice(0, 10);
const toUpdate = [], toCreate = [];
let skipped = 0;

for (const item of all) {
  const code = item.SECODE, name = item.FPNAME;
  if (!code || !name) { skipped++; continue; }
  const p = byBankCode.get(code);
  if (p) toUpdate.push({ p, item });
  else toCreate.push(item);
}
console.log(`待更新 ${toUpdate.length}，待新建 ${toCreate.length}\n`);

// ── 批量新建（每批 30 + 逐行重试）──
let created = 0, retried = 0;
const BATCH = 30;
for (let i = 0; i < toCreate.length; i += BATCH) {
  const batch = toCreate.slice(i, i + BATCH);
  const rows = batch.map(item => {
    const y = parseYield(item);
    const wfEarn = parseFloat(item.WF_EARN);
    return {
      name: item.FPNAME,
      bank: '邮储银行',
      bank_code: item.SECODE,
      unit_nav: y.type === 'nav' ? y.value : null,
      annual_7d_yield: y.type === 'seven_yield' ? y.value : null,
      daily_income: isFinite(wfEarn) && wfEarn > 0 ? wfEarn : null,
      risk_level: riskToLevel(item.RISKLEVEL),
      nav_date: y.type !== 'none' ? today : null,
    };
  });

  const { error: e } = await supabase.from('products').insert(rows);
  if (!e) {
    created += rows.length;
  } else {
    // 批次失败 → 逐行插入（最稳）
    for (const r of rows) {
      const { error: e2 } = await supabase.from('products').insert(r);
      if (!e2) created++;
      else retried++;
    }
  }

  if ((Math.floor(i/BATCH)+1) % 5 === 0 || i + BATCH >= toCreate.length) {
    console.log(`  新建进度: ${created}/${toCreate.length}（失败 ${retried}）`);
  }
  await new Promise(r => setTimeout(r, 100));
}

// ── 更新已有的 ──
let matched = 0, navWrote = 0, yieldWrote = 0;
for (const { p, item } of toUpdate) {
  const y = parseYield(item);
  if (y.type === 'none') { skipped++; continue; }

  if (y.type === 'nav') {
    await supabase.from('products').update({ unit_nav: y.value, nav_date: today }).eq('id', p.id);
    await supabase.from('nav_history').upsert(
      { product_id: p.id, nav_date: today, unit_nav: y.value },
      { onConflict: 'product_id,nav_date' }
    );
    navWrote++;
  } else {
    const updates = { nav_date: today };
    const sevenYield = parseFloat(item.SEVEN_ANNUAL_YIELD);
    const wfEarn = parseFloat(item.WF_EARN);
    if (isFinite(sevenYield) && sevenYield > 0) updates.annual_7d_yield = sevenYield;
    if (isFinite(wfEarn) && wfEarn > 0) updates.daily_income = wfEarn;
    await supabase.from('products').update(updates).eq('id', p.id);
    yieldWrote++;
  }
  matched++;
}

console.log(`\n🎉 更新 ${matched}，新建 ${created}，净值写入 ${navWrote}，收益指标写入 ${yieldWrote}，跳过 ${skipped}`);