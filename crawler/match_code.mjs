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

// ============ 中邮理财 API ============
const PSBC_BASE = 'https://www.psbc-wm.com';
const PSBC_API = '/pswm-api';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Referer': 'https://www.psbc-wm.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const AGENT = new https.Agent({
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
      method: 'GET', headers: HEADERS, agent: AGENT,
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

// ★ 强化搜索策略：8 种候选关键词
function buildSearchQueries(name) {
  const queries = [];
  queries.push(name); // 完整名

  // 去前缀
  let s = name;
  const prefixes = ['中邮理财', '邮储银行', '交银理财', '招银理财', '上银理财', '农银理财', '工银理财', '建信理财', '中银理财', '兴银理财', '浦银理财', '信银理财', '光大理财', '民生理财', '平安理财', '华夏理财', '广银理财'];
  for (const prefix of prefixes) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length).replace(/^[·\-—]+/, '');
      break;
    }
  }
  if (s !== name) queries.push(s);

  // 去"最短持有X天"
  const noDays = s.replace(/最短持有\d+天/, '');
  if (noDays !== s && noDays.length >= 5) queries.push(noDays);

  // 去"X天持有期"
  const noHold = s.replace(/\d+天持有期/, '');
  if (noHold !== s && noHold.length >= 5) queries.push(noHold);

  // ★ 提取核心产品名（去掉所有修饰词）
  // 例：灵活·鸿运最短持有7天22号B → 鸿运22号
  const coreMatch = s.match(/·([^\d·]+)\d+号/);
  if (coreMatch) {
    queries.push(coreMatch[1] + s.match(/\d+号[A-Z]?/)?.[0]);
  }

  // ★ 提取前 5 个字
  if (s.length > 5) queries.push(s.slice(0, 5));

  // ★ 提取"数字+号+字母"（如 22号B）
  const numMatch = s.match(/\d+号[A-Z]?/);
  if (numMatch) queries.push(numMatch[0]);

  // 去重、过滤太短的
  return Array.from(new Set(queries.filter(q => q && q.length >= 3)));
}

async function searchPsbc(keywords) {
  const url = new URL(PSBC_BASE + PSBC_API + '/product/search');
  url.searchParams.set('keywords', keywords);
  url.searchParams.set('pageSize', '30');
  url.searchParams.set('pageNum', '1');
  try {
    const json = await httpsGetJson(url.toString());
    return json.data?.list || [];
  } catch (e) {
    return [];
  }
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

async function getMissingCodeProducts() {
  const url = `${SUPABASE_URL}/rest/v1/user_holdings?or=(status.eq.active,status.is.null)&select=product_id,products(id,name,bank,code)`;
  const resp = await fetchWithRetry(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const data = await resp.json();
  const map = new Map();
  data.forEach(d => {
    if (d.products && !d.products.code) map.set(d.products.id, d.products);
  });
  return Array.from(map.values());
}

async function updateCode(id, code) {
  const resp = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ code }),
  });
  return resp.ok;
}

// ============ 主流程 ============
const products = await getMissingCodeProducts();
console.log(`\n📋 缺 code 的产品：${products.length} 个\n`);

if (products.length === 0) {
  console.log('🎉 没有缺 code 的产品');
  process.exit(0);
}

const results = { matched: [], unmatched: [] };

for (let i = 0; i < products.length; i++) {
  const p = products[i];
  console.log(`\n[${i + 1}/${products.length}] ${p.name}`);

  const queries = buildSearchQueries(p.name);
  console.log(`  搜索词 (${queries.length} 个)：${queries.join(' | ')}`);

  let best = null;
  let bestScore = 0;
  let matchedBy = null;

  for (const kw of queries) {
    try {
      const list = await searchPsbc(kw);
      if (list.length === 0) continue;
      console.log(`    [${kw}] ${list.length} 结果`);

      for (const item of list) {
        const score = similarity(p.name, item.wp_name || '');
        if (score > bestScore) {
          bestScore = score;
          best = item;
          matchedBy = kw;
        }
      }

      if (bestScore >= 0.75) break;
      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.log(`    [${kw}] 出错：${e.message}`);
    }
  }

  if (best && bestScore >= 0.5) {
    console.log(`  ✅ 匹配：${best.wp_name}`);
    console.log(`     登记编码：${best.wp_registration_code} | 相似度 ${bestScore.toFixed(2)} | 搜索词 "${matchedBy}"`);
    const ok = await updateCode(p.id, best.wp_registration_code);
    if (ok) {
      results.matched.push({ name: p.name, code: best.wp_registration_code });
      console.log(`     💾 已保存`);
    }
  } else {
    console.log(`  ⚠️ 未匹配（最佳 ${bestScore.toFixed(2)}）`);
    if (best) console.log(`     最佳候选：${best.wp_name}`);
    results.unmatched.push({ name: p.name, best: best?.wp_name });
  }

  await new Promise(r => setTimeout(r, 500));
}

console.log(`\n═══════════════════════════════════`);
console.log(`✅ 成功：${results.matched.length}`);
console.log(`⚠️  未匹配：${results.unmatched.length}`);
console.log(`═══════════════════════════════════`);

if (results.unmatched.length > 0) {
  console.log(`\n未匹配清单：`);
  results.unmatched.forEach(u => console.log(`  - ${u.name}`));
}