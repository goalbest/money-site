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

// ============ ★ 你要填的公告 URL 清单 ★ ============
// 把你所有没匹配上的产品的公告 URL 填进这个数组
const NOTICE_URLS = [
  // 优盛·鸿锦最短持有7天6号ESG优选B
  'https://www.psbc.com/cn/grfw/tzlc/lc/lccpxx/202412/t20241227_279705.html',
  // 后续有别的产品，直接在这里加
];

// ============ HTTP ============
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const AGENT = new https.Agent({
  rejectUnauthorized: false,
  minVersion: 'TLSv1', maxVersion: 'TLSv1.3',
  ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3,
});

function httpsGetText(fullUrl, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return resolve({ status: 0, body: '' });
    const u = new URL(fullUrl);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET', headers: HEADERS, agent: AGENT,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let next;
        if (res.headers.location.startsWith('http')) next = res.headers.location;
        else if (res.headers.location.startsWith('/')) next = `https://${u.hostname}${res.headers.location}`;
        else next = new URL(res.headers.location, fullUrl).toString();
        resolve(httpsGetText(next, depth + 1));
        return;
      }
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.end();
  });
}

function parseNotice(html) {
  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  const codeMatch = cleanText.match(/([A-Z0-9]{9,15})\s*非保本/);
  const code = codeMatch ? codeMatch[1] : null;

  const navMatch = cleanText.match(/([0-9]+\.[0-9]{2,4})\s*当前净值/);
  const nav = navMatch ? parseFloat(navMatch[1]) : null;

  const dateMatch = cleanText.match(/(\d{4}-\d{2}-\d{2})\s*净值日期/);
  const navDate = dateMatch ? dateMatch[1] : null;

  const nameMatch = cleanText.match(/([^\s]{5,40})\s+[A-Z0-9]{9,15}\s*非保本/);
  const name = nameMatch ? nameMatch[1].trim() : null;

  return { code, name, nav, navDate };
}

function similarity(a, b) {
  if (!a || !b) return 0;
  a = a.replace(/[\s·\-—_（）()【】]/g, '');
  b = b.replace(/[\s·\-—_（）()【】]/g, '');
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
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

async function saveNavHistory(productId, navDate, nav) {
  if (!navDate || !nav) return false;
  const url = `${SUPABASE_URL}/rest/v1/nav_history?on_conflict=product_id,nav_date`;
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([{ product_id: productId, nav_date: navDate, unit_nav: nav }]),
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
console.log(`抓取 ${NOTICE_URLS.length} 个指定公告`);
console.log('═══════════════════════════════════\n');

const allProducts = await getAllProducts();
const productsByCode = new Map();
const productsMissingCode = [];
allProducts.forEach(p => {
  if (p.code) productsByCode.set(p.code, p);
  else productsMissingCode.push(p);
});

let ok = 0, matched = 0, fail = 0;

for (const url of NOTICE_URLS) {
  console.log(`\n🌐 ${url}`);

  try {
    const { status, body } = await httpsGetText(url);
    console.log(`   📡 HTTP ${status}`);

    if (status !== 200 || body.length < 500) {
      console.log(`   ⚠️ 页面无效`);
      fail++;
      continue;
    }

    const info = parseNotice(body);
    console.log(`   产品名: ${info.name}`);
    console.log(`   代码: ${info.code}`);
    console.log(`   净值: ${info.nav}`);
    console.log(`   净值日期: ${info.navDate}`);

    if (!info.code || !info.nav || !info.navDate) {
      console.log(`   ⚠️ 解析失败`);
      fail++;
      continue;
    }

    // 1. 按 code 精确匹配
    let target = productsByCode.get(info.code);

    // 2. 按名字匹配"缺 code"的产品
    if (!target) {
      let best = null;
      let bestScore = 0;
      for (const p of productsMissingCode) {
        const score = similarity(p.name, info.name);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      if (best && bestScore >= 0.75) {
        console.log(`   🆕 名字匹配到："${best.name}" (${bestScore.toFixed(2)})`);
        await updateProduct(best.id, {
          code: info.code,
          unit_nav: info.nav,
          nav_date: info.navDate,
          bank_code: info.code,
        });
        await saveNavHistory(best.id, info.navDate, info.nav);
        matched++;
        // 从列表中移除
        const idx = productsMissingCode.indexOf(best);
        if (idx >= 0) productsMissingCode.splice(idx, 1);
        continue;
      }
    }

    // 3. 已匹配的，只更新净值
    if (target) {
      console.log(`   ✅ 已存在：${target.name}`);
      await updateProduct(target.id, {
        unit_nav: info.nav,
        nav_date: info.navDate,
      });
      await saveNavHistory(target.id, info.navDate, info.nav);
      ok++;
      continue;
    }

    console.log(`   ⚠️ 数据库中没找到匹配的产品`);
    fail++;
  } catch (e) {
    console.log(`   ❌ 出错: ${e.message}`);
    fail++;
  }
}

console.log(`\n═══════════════════════════════════`);
console.log(`🎉 完成！`);
console.log(`  已存在更新: ${ok}`);
console.log(`  新匹配: ${matched}`);
console.log(`  失败: ${fail}`);
console.log(`═══════════════════════════════════`);