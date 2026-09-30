import https from 'https';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============ 环境变量（用脚本自身路径定位，不依赖 cwd）============
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnv() {
  // 优先读脚本所在目录的上一级（项目根）
  const candidates = [
    resolve(__dirname, '..', '.env.local'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '..', '.env.local'),
  ];
  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const m = line.match(/^([^=]+)=(.*)$/);
        if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
      });
      console.log(`📂 已加载 ${envPath}`);
      return;
    }
  }
  console.log('⚠️ 未找到 .env.local');
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://xbwzrnmacznaxtumkrwy.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; 
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL / SUPABASE_KEY 未读取到，请检查 .env.local');
  console.error('   URL =', SUPABASE_URL);
  console.error('   KEY =', SUPABASE_KEY ? SUPABASE_KEY.slice(0, 20) + '...' : undefined);
  process.exit(1);
}

// ============ ★ 要抓的产品清单（按产品名搜中邮 API）★ ============
// 直接写产品名（或用你数据库里的 name），脚本会自动搜 wp_code 再拉净值
const PRODUCT_KEYWORDS = [
  '优盛·鸿锦最短持有7天6号B ESG优选',
  // 后续加产品名
];

// ============ 中邮 API 配置 ============
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

// 搜索产品 → 拿 wp_code + 登记编码
async function searchProduct(keywords) {
  const url = new URL(PSBC_BASE + PSBC_API + '/product/search');
  url.searchParams.set('keywords', keywords);
  url.searchParams.set('pageSize', '20');
  url.searchParams.set('pageNum', '1');
  const json = await httpsGetJson(url.toString());
  return json.data?.list || [];
}

// 翻页抓所有净值历史
async function fetchNavHistoryAll(wpCode, maxPages = 50) {
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
      if (newCount === 0) break;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.log(`   ⚠️ 第 ${page} 页失败: ${e.message}`);
      break;
    }
  }
  return all;
}

function formatDate(d) {
  if (!d) return null;
  const s = String(d).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function similarity(a, b) {
  if (!a || !b) return 0;
  a = a.replace(/[\s·\-—_（）()【】]/g, '');
  b = b.replace(/[\s·\-—_（）()【】]/g, '');
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n] / Math.max(m, n);
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

async function saveNavHistory(productId, navDate, nav, accumNav) {
  if (!navDate || !nav) return false;
  const url = `${SUPABASE_URL}/rest/v1/nav_history?on_conflict=product_id,nav_date`;
  const body = [{ product_id: productId, nav_date: navDate, unit_nav: nav }];
  if (accumNav != null) body[0].accum_nav = accumNav;
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  });
  return resp.ok;
}

async function getAllProducts() {
  const url = `${SUPABASE_URL}/rest/v1/products?select=id,name,code`;
  const resp = await fetchWithRetry(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return await resp.json();
}

// ============ 主流程 ============
console.log('═══════════════════════════════════');
console.log(`抓取 ${PRODUCT_KEYWORDS.length} 个产品（中邮 API）`);
console.log('═══════════════════════════════════\n');

const allProducts = await getAllProducts();
const productsByCode = new Map();
allProducts.forEach(p => { if (p.code) productsByCode.set(p.code, p); });

let ok = 0, newMatched = 0, fail = 0;

for (const keyword of PRODUCT_KEYWORDS) {
  console.log(`\n🔍 搜索: ${keyword}`);
  try {
    // 1. 搜产品
    const list = await searchProduct(keyword);
    if (list.length === 0) {
      console.log('   ⚠️ 搜不到产品');
      fail++;
      continue;
    }
    const hit = list[0];
    const wpCode = hit.wp_code;
    const regCode = hit.wp_registration_code;
    const wpName = hit.wp_name;
    console.log(`   命中: ${wpName}`);
    console.log(`   wp_code: ${wpCode}`);
    console.log(`   登记编码: ${regCode}`);

    // 2. 抓净值历史
    const navs = await fetchNavHistoryAll(wpCode);
    console.log(`   净值条数: ${navs.length}`);
    if (navs.length === 0) { fail++; continue; }

    // 3. 找数据库中的产品
    let target = regCode ? productsByCode.get(regCode) : null;

    if (!target) {
      // 按名字相似度匹配
      let best = null, bestScore = 0;
      for (const p of allProducts) {
        const s = similarity(p.name, wpName);
        if (s > bestScore) { bestScore = s; best = p; }
      }
      if (best && bestScore >= 0.7) {
        console.log(`   🆕 名字匹配："${best.name}" (${bestScore.toFixed(2)})`);
        await updateProduct(best.id, {
          code: regCode,
          bank_code: wpCode,
        });
        target = best;
        newMatched++;
      }
    }

    if (!target) {
      console.log('   ⚠️ 数据库中找不到匹配产品，跳过');
      fail++;
      continue;
    }

    // 4. 批量写 nav_history
    let wrote = 0;
    for (const n of navs) {
      const navDate = formatDate(n.update_date);
      const nav = parseFloat(n.nav);
      const accum = n.accumulative_nav ? parseFloat(n.accumulative_nav) : null;
      const success = await saveNavHistory(target.id, navDate, nav, accum);
      if (success) wrote++;
    }
    console.log(`   ✅ 写入 nav_history: ${wrote} 条`);

    // 5. 更新 products 最新净值
    const latest = navs[0];
    await updateProduct(target.id, {
      unit_nav: parseFloat(latest.nav),
      nav_date: formatDate(latest.update_date),
    });
    console.log(`   ✅ 更新 products.unit_nav = ${latest.nav} @ ${formatDate(latest.update_date)}`);
    ok++;
  } catch (e) {
    console.log(`   ❌ 出错: ${e.message}`);
    fail++;
  }
}

console.log(`\n═══════════════════════════════════`);
console.log(`🎉 完成！`);
console.log(`  成功: ${ok}`);
console.log(`  新匹配: ${newMatched}`);
console.log(`  失败: ${fail}`);
console.log(`═══════════════════════════════════`);