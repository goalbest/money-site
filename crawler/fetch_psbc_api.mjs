import { createClient } from '@supabase/supabase-js';
import https from 'https';
import crypto from 'crypto';
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

// ── HTTPS agent（老协议兼容）──
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

// 按关键词搜索（用产品代码搜）
async function searchByKeyword(keyword) {
  const ts = Date.now();
  const params = new URLSearchParams({
    callback: 'cb', currency: '', deadline: '', netproduct: '', risklevel: '',
    entruststartamt: '', buystatus: '', product_status: '',
    zhongyouflag: '', bankflag: '', investor_nature: '', order: '',
    finkeyword: keyword, pageNum: '1', _: String(ts),
  });
  const text = await get(`${API}?${params}`);
  const m = text.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error('JSONP 解析失败');
  return JSON.parse(m[1]);
}

// ══════════════ 主流程 ══════════════
console.log('═══════════════════════════════');
console.log('邮储/中邮产品日常更新（按需抓）');
console.log('═══════════════════════════════\n');

const t0 = Date.now();

// ── 读数据库里所有邮储/中邮产品 ──
console.log('→ 读 products 表...');
const { data: prods, error } = await supabase
  .from('products')
  .select('id, name, bank, bank_code')
  .in('bank', ['邮储银行', '中邮理财'])
  .not('bank_code', 'is', null);

if (error) { console.error('❌ 读取失败:', error.message); process.exit(1); }

console.log(`← 读到 ${prods.length} 个产品\n`);
if (prods.length === 0) { console.log('无产品，退出'); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
let updated = 0, failed = 0, notFound = 0;

for (let i = 0; i < prods.length; i++) {
  const p = prods[i];
  try {
    const data = await searchByKeyword(p.bank_code);
    const hit = (data.resultList || []).find(x => x.SECODE === p.bank_code);

    if (!hit) {
      console.log(`  ⚠️ [${i+1}/${prods.length}] ${p.name} 未找到`);
      notFound++;
      await sleep(400);
      continue;
    }

    const nav = parseFloat(hit.LATEST_NET);
    const seven = parseFloat(hit.SEVEN_ANNUAL_YIELD);
    const wf = parseFloat(hit.WF_EARN);

    const updates = { nav_date: today };
    if (isFinite(nav) && nav > 0) updates.unit_nav = nav;
    if (isFinite(seven) && seven > 0) updates.annual_7d_yield = seven;
    if (isFinite(wf) && wf > 0) updates.daily_income = wf;

    await supabase.from('products').update(updates).eq('id', p.id);

    if (isFinite(nav) && nav > 0) {
      await supabase.from('nav_history').upsert(
        { product_id: p.id, nav_date: today, unit_nav: nav },
        { onConflict: 'product_id,nav_date' }
      );
      console.log(`  ✅ [${i+1}/${prods.length}] ${p.name} → ${nav}`);
    } else {
      console.log(`  ✅ [${i+1}/${prods.length}] ${p.name} → 7日年化 ${seven}`);
    }
    updated++;
    await sleep(500);
  } catch (e) {
    console.log(`  ❌ [${i+1}/${prods.length}] ${p.name}: ${e.message}`);
    failed++;
    await sleep(1000);
  }
}

console.log(`\n🎉 更新 ${updated}，未找到 ${notFound}，失败 ${failed}（总耗时 ${((Date.now()-t0)/1000).toFixed(1)}s）`);