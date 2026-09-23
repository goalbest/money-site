import https from 'https';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ============ 环境变量 ============
function loadEnv() {
  const envPath = resolve(process.cwd(), '..', '.env.local');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    });
    console.log('📂 已加载 .env.local');
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 缺少 Supabase 环境变量');
  process.exit(1);
}

// ============ 中邮理财 API ============
const PSBC_BASE = 'https://www.psbc-wm.com';
const PSBC_API = '/pswm-api';

const PSBC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Referer': 'https://www.psbc-wm.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const PSBC_AGENT = new https.Agent({
  rejectUnauthorized: false,
  minVersion: 'TLSv1',
  maxVersion: 'TLSv1.3',
  ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3,
});

function httpsGetJson(fullUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET', headers: PSBC_HEADERS, agent: PSBC_AGENT,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`不是 JSON: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function psbcSearch(keywords, pageSize = 20) {
  const url = new URL(PSBC_BASE + PSBC_API + '/product/search');
  url.searchParams.set('keywords', keywords);
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('pageNum', '1');
  const json = await httpsGetJson(url.toString());
  return json.data?.list || [];
}

// ★ 新增：循环翻页抓全部净值
async function psbcNavListAll(wpCode, maxPages = 50) {
  const all = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(PSBC_BASE + PSBC_API + '/product/nvlist');
    url.searchParams.set('wp_code', wpCode);
    url.searchParams.set('pageSize', '10');
    url.searchParams.set('pageNum', String(page));

    try {
      const json = await httpsGetJson(url.toString());
      const list = json.data?.list || [];

      if (list.length === 0) break;

      let newCount = 0;
      for (const item of list) {
        const key = item.update_date;
        if (key && !seen.has(key)) {
          seen.add(key);
          all.push(item);
          newCount++;
        }
      }

      // 全是重复的，说明已经到底
      if (newCount === 0) break;

      // 每页间隔 300ms，礼貌访问
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.log(`    ⚠️ 第 ${page} 页出错: ${e.message.slice(0, 50)}`);
      break;
    }
  }

  return all;
}

function formatDate(d) {
  if (!d) return null;
  const s = String(d).trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

// ============ Supabase ============
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fetch(url, options); }
    catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function getHoldingProducts() {
  const url = `${SUPABASE_URL}/rest/v1/user_holdings?or=(status.eq.active,status.is.null)&select=product_id,products(id,name,code)`;
  const resp = await fetchWithRetry(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const data = await resp.json();
  const map = new Map();
  data.forEach(d => { if (d.products) map.set(d.products.id, d.products); });
  return Array.from(map.values());
}

async function saveNavHistory(productId, navs) {
  const rows = navs
    .map(n => ({
      product_id: productId,
      nav_date: formatDate(n.update_date),
      unit_nav: parseFloat(n.nav) || null,
      accum_nav: parseFloat(n.accumulative_nav) || null,
    }))
    .filter(r => r.nav_date && r.unit_nav);

  if (rows.length === 0) return false;

  // 分批插入（每批 200 条）
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const url = `${SUPABASE_URL}/rest/v1/nav_history?on_conflict=product_id,nav_date`;
    const resp = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (resp.ok) inserted += batch.length;
  }
  return inserted;
}

async function updateProduct(id, updates) {
  const resp = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(updates),
  });
  return resp.ok;
}

function calcYields(sortedNavs) {
  if (sortedNavs.length < 2) return { sevenDay: null, perMyriad: null };
  const dailyReturns = [];
  const days = Math.min(7, sortedNavs.length - 1);
  for (let i = 0; i < days; i++) {
    const today = parseFloat(sortedNavs[i].nav);
    const yesterday = parseFloat(sortedNavs[i + 1].nav);
    if (today && yesterday && yesterday > 0) {
      dailyReturns.push((today - yesterday) / yesterday);
    }
  }
  if (dailyReturns.length === 0) return { sevenDay: null, perMyriad: null };
  const avgDaily = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  return {
    sevenDay: avgDaily * 365 * 100,
    perMyriad: dailyReturns[0] * 10000,
  };
}

// ============ 主流程 ============
const products = await getHoldingProducts();
console.log(`\n📋 持仓产品共 ${products.length} 个\n`);

let ok = 0, fail = 0, skip = 0;

for (let i = 0; i < products.length; i++) {
  const p = products[i];
  console.log(`\n[${i + 1}/${products.length}] ${p.name}`);

  if (!p.code) {
    console.log(`  ⏭️ 缺少 code，跳过`);
    skip++;
    continue;
  }

  try {
    const list = await psbcSearch(p.name, 20);
    let matched = list.find(item => item.wp_registration_code === p.code);
    if (!matched && list.length > 0) matched = list[0];

    if (!matched) {
      console.log(`  ⚠️ 中邮理财未找到（可能是其他银行的产品）`);
      fail++;
      continue;
    }

    const wpCode = matched.wp_code;
    console.log(`  ✅ 匹配到 ${matched.wp_name} (wp_code=${wpCode})`);

    // ★ 翻页抓全部
    const navs = await psbcNavListAll(wpCode, 50);
    console.log(`  📊 翻页抓到 ${navs.length} 天净值`);

    if (navs.length === 0) {
      console.log(`  ⚠️ 净值历史为空`);
      fail++;
      continue;
    }

    const inserted = await saveNavHistory(p.id, navs);
    if (inserted > 0) console.log(`  💾 已存 ${inserted} 条净值`);

    const sorted = [...navs].sort((a, b) =>
      String(b.update_date || '').localeCompare(String(a.update_date || ''))
    );
    const latest = sorted[0];
    const yields = calcYields(sorted);

    const updates = {};
    if (latest) {
      updates.unit_nav = parseFloat(latest.nav);
      updates.nav_date = formatDate(latest.update_date);
    }
    if (yields.sevenDay !== null) {
      updates.annualized_1m = Number(yields.sevenDay.toFixed(4));
      updates.daily_return = Number(yields.perMyriad.toFixed(4));
    }
    updates.bank_code = wpCode;

    console.log(`  ✅ 净值=${updates.unit_nav} | 年化=${updates.annualized_1m}% | 万收=${updates.daily_return} | ${updates.nav_date}`);
    await updateProduct(p.id, updates);
    ok++;

    await new Promise(r => setTimeout(r, 1500));
  } catch (e) {
    console.log(`  ❌ 失败：${e.message}`);
    fail++;
  }
}

console.log(`\n═══════════════════════════════════`);
console.log(`🎉 完成！成功 ${ok}，失败 ${fail}，跳过 ${skip}`);
console.log(`═══════════════════════════════════`);