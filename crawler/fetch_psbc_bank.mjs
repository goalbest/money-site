import { createClient } from '@supabase/supabase-js';
import https from 'https';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DRY_RUN = process.env.DRY_RUN === '1';

// ── env ──
(function loadEnv() {
  for (const p of [resolve(__dirname, '..', '.env.local'), resolve(process.cwd(), '.env.local')]) {
    if (existsSync(p)) {
      let content = readFileSync(p, 'utf-8').replace(/^\uFEFF/, '');
      content.split(/\r?\n/).forEach(l => {
        const m = l.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
        if (m) {
          const k = m[1].trim(); let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          if (!process.env[k]) process.env[k] = v;
        }
      });
      console.log(`📂 ${p}`); return;
    }
  }
})();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ env 缺失'); process.exit(1); }
console.log('  URL =', SUPABASE_URL);
console.log('  KEY =', SUPABASE_KEY.slice(0, 20) + '...');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── HTTP（抓邮储公告页）──
const AGENT = new https.Agent({
  rejectUnauthorized: false, minVersion: 'TLSv1', ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3,
});
const LIST_URL = 'https://www.psbc.com/cn/grfw/tzlc/lc/lccpxx/';

function get(url, referer = LIST_URL) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9', 'Referer': referer,
      }, agent: AGENT,
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(get(new URL(res.headers.location, url).toString(), referer));
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function listNoticeUrls(maxPages = 3) {
  const urls = new Set();
  for (let p = 0; p < maxPages; p++) {
    const pageUrl = p === 0 ? LIST_URL : `${LIST_URL}index_${p}.html`;
    let html;
    try { html = await get(pageUrl, p === 0 ? LIST_URL : pageUrl); } catch { break; }
    let n = 0;
    for (const m of html.matchAll(/href=["']([^"']*t\d{8}_\d+\.html)["']/g)) {
      const abs = new URL(m[1], pageUrl).toString();
      if (!urls.has(abs)) { urls.add(abs); n++; }
    }
    console.log(`  页${p}: +${n}`);
    if (n === 0) break;
    await new Promise(r => setTimeout(r, 300));
  }
  return [...urls];
}

function parseNoticeAll(html) {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const out = [];
  const re = /([A-Z0-9]{9,15})\s*非保本/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const code = m[1];
    const seg = t.slice(m.index, m.index + 800);
    const navM  = seg.match(/([0-9]+\.[0-9]{2,4})\s*当前净值/);
    const dateM = seg.match(/(\d{4}-\d{2}-\d{2})\s*净值日期/);
    const before = t.slice(Math.max(0, m.index - 100), m.index).trim();
    const parts = before.split(/\s+/).filter(s => s.length >= 4 && !/^\d+$/.test(s));
    out.push({
      code, name: parts[parts.length - 1] || null,
      unit_nav: navM ? parseFloat(navM[1]) : null,
      nav_date: dateM ? dateM[1] : null,
    });
  }
  return out;
}

// ── Supabase 操作 ──
async function getAllProducts() {
  console.log('→ 读 products 表...');
  const { data, error } = await supabase.from('products').select('id,name,code,bank_code,nav_date');
  if (error) { console.error('❌ 读取失败:', error.message); return []; }
  console.log(`← 成功读取 ${data.length} 条`);
  return data;
}
async function patchProduct(id, u) {
  const { error } = await supabase.from('products').update(u).eq('id', id);
  if (error) console.error(`⚠️ 更新 ${id} 失败:`, error.message);
  return !error;
}
async function upsertNav(productId, navDate, nav) {
  const { error } = await supabase.from('nav_history').upsert(
    { product_id: productId, nav_date: navDate, unit_nav: nav },
    { onConflict: 'product_id,nav_date' }
  );
  if (error) console.error(`⚠️ 写 nav_history 失败:`, error.message);
  return !error;
}
async function createProduct(p) {
  const { data, error } = await supabase.from('products').insert(p).select('id').single();
  if (error) { console.error('❌ 新建失败:', error.message); return null; }
  return data.id;
}

// ── 名字相似度 ──
function similarity(a, b) {
  if (!a || !b) return 0;
  const norm = s => s.replace(/[\s·\-—_（）()【】]/g, '');
  const na = norm(a), nb = norm(b);

  // ★ 数字集合不同 → 直接判不匹配（天数/期数/序号是核心标识）
  const numsA = (a.match(/\d+/g) || []).sort().join(',');
  const numsB = (b.match(/\d+/g) || []).sort().join(',');
  if (numsA !== numsB) return 0;

  const m = na.length, n = nb.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = na[i-1] === nb[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
  return dp[m][n] / Math.max(m, n);
}

// ══════════════ 主流程 ══════════════
console.log('═══════════════════════════════\n');

const urls = await listNoticeUrls(3);
console.log(`\n公告 URL: ${urls.length}\n`);

const notices = [];
for (let i = 0; i < urls.length; i += 3) {
  const batch = urls.slice(i, i + 3);
  const rs = await Promise.all(batch.map(u => get(u, LIST_URL)
    .then(parseNoticeAll).catch(e => { console.log(`⚠️ ${u}: ${e.message}`); return []; })));
  rs.forEach(r => notices.push(...r));
  await new Promise(r => setTimeout(r, 300));
}

const byCodeMap = new Map();
for (const n of notices) {
  if (!n.code || !n.unit_nav || !n.nav_date) continue;
  const prev = byCodeMap.get(n.code);
  if (!prev || n.nav_date > prev.nav_date) byCodeMap.set(n.code, n);
}
console.log(`有效产品(去重后): ${byCodeMap.size}\n`);

if (DRY_RUN) {
  console.log('[DRY_RUN] 抓取结果:');
  for (const n of byCodeMap.values()) console.log(`  ${n.code}  ${n.unit_nav}  ${n.nav_date}  ${n.name}`);
  process.exit(0);
}

const all = await getAllProducts();
const byBankCode = new Map();
all.forEach(p => { if (p.bank_code) byBankCode.set(p.bank_code, p); });

let ok = 0, backfilled = 0, created = 0;
for (const n of byCodeMap.values()) {
  let p = byBankCode.get(n.code);

  // 2. 名字模糊匹配
  if (!p && n.name) {
    let best = null, bs = 0;
    for (const q of all) {
      const s = similarity(q.name, n.name);
      if (s > bs) { bs = s; best = q; }
    }
    if (best && bs >= 0.85) {
      console.log(`🔗 名字匹配 "${best.name}" ←→ "${n.name}" (${bs.toFixed(2)})`);
      await patchProduct(best.id, { bank_code: n.code });
      p = best; backfilled++;
    }
  }

  // 3. 都没有 → 新建
  if (!p) {
    console.log(`🆕 新建: ${n.name} (${n.code})`);
    const newId = await createProduct({
      name: n.name, bank: '中邮理财', bank_code: n.code,
      unit_nav: n.unit_nav, nav_date: n.nav_date,
    });
    if (!newId) continue;
    p = { id: newId, name: n.name, nav_date: null };
    created++;
  }

  // 写净值
  await upsertNav(p.id, n.nav_date, n.unit_nav);
  if (!p.nav_date || n.nav_date > p.nav_date)
    await patchProduct(p.id, { unit_nav: n.unit_nav, nav_date: n.nav_date });
  console.log(`✅ ${n.name || n.code} → ${n.unit_nav} @ ${n.nav_date}`);
  ok++;
}

console.log(`\n🎉 完成: 入库 ${ok}, 回填 bank_code ${backfilled}, 新建 ${created}`);