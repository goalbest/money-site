import { chromium } from 'playwright';
import fs from 'fs';

const SUPABASE_URL = 'https://xbwzrnmacznaxtumkrwy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ENL6t2RGt7GKhT7Z4i5rbg_H20oeZ1i';
const USER_ID = 1;
const LIMIT = 2; // ★ 只处理前 2 个

const BANK_KEYWORDS = {
  '中邮理财': ['中邮理财'],
  '邮储银行': ['中邮理财'],
  '农银理财': ['农银理财'],
  '工银理财': ['工银理财'],
  '建信理财': ['建信理财'],
  '中银理财': ['中银理财'],
  '交银理财': ['交银理财'],
  '招银理财': ['招银理财'],
  '兴银理财': ['兴银理财'],
  '浦银理财': ['浦银理财'],
  '信银理财': ['信银理财'],
  '光大理财': ['光大理财'],
  '民生理财': ['民生理财'],
  '平安理财': ['平安理财'],
  '华夏理财': ['华夏理财'],
  '广银理财': ['广银理财'],
  '北京银行': ['北京银行'],
  '上银理财': ['上银理财'],
  '苏银理财': ['苏银理财'],
  '宁银理财': ['宁银理财'],
  '南银理财': ['南银理财'],
  '杭银理财': ['杭银理财'],
  '上海农商行': ['上海农商'],
};

const BANK_PREFIXES = Object.values(BANK_KEYWORDS).flat();

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

function generateKeywords(name) {
  let s = name.replace(/[\s]/g, '');
  for (const prefix of BANK_PREFIXES) {
    if (s.startsWith(prefix)) { s = s.slice(prefix.length); break; }
  }
  s = s.replace(/^[·\-—]+/, '');

  const keywords = new Set();
  keywords.add(s);
  keywords.add(s.replace(/最短持有\d+天/, ''));
  keywords.add(s.replace(/\d+年第\d+期/, '').replace(/最短持有\d+天/, ''));

  const seriesMatch = s.match(/^([^0-9]+)\d+号/);
  if (seriesMatch) {
    const numMatch = s.match(/(\d+号)/);
    keywords.add(seriesMatch[1] + (numMatch ? numMatch[1] : ''));
  }

  if (s.length > 6) keywords.add(s.slice(0, 6));
  if (s.length > 4) keywords.add(s.slice(0, 4));

  return Array.from(keywords).filter(k => k.length >= 3);
}

async function getMissingCodeProducts() {
  const url = `${SUPABASE_URL}/rest/v1/user_holdings?select=product_id,products(id,name,bank,code)&user_id=eq.${USER_ID}&limit=${LIMIT}`;
  const resp = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  const data = await resp.json();
  return data.map(d => d.products).filter(p => p && !p.code);
}

async function updateCode(id, code) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ code }),
  });
  return resp.ok;
}

async function waitForMaskGone(page) {
  try {
    await page.waitForFunction(() => {
      const masks = document.querySelectorAll('.el-loading-mask');
      for (const m of masks) {
        const style = window.getComputedStyle(m);
        if (style.display !== 'none' && style.visibility !== 'hidden') return false;
      }
      return true;
    }, { timeout: 3000 });
  } catch (e) {}
}

async function searchAndExtract(page, keyword) {
  await waitForMaskGone(page);
  const nameInput = page.locator('input[type="text"]:visible').first();
  await nameInput.fill('');
  await new Promise(r => setTimeout(r, 100));
  await nameInput.fill(keyword);
  await new Promise(r => setTimeout(r, 300));

  const searchBtn = page.locator('button:has-text("查询")').first();
  await searchBtn.click({ force: true, timeout: 10000 });
  await new Promise(r => setTimeout(r, 2500));

  return await page.evaluate(() => {
    const tbody = document.querySelector('table tbody');
    if (!tbody) return [];
    const trs = Array.from(tbody.querySelectorAll('tr'));
    return trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())).filter(r => r.length >= 3);
  });
}

const products = await getMissingCodeProducts();
console.log(`📋 待匹配产品：${products.length} 个`);
products.forEach(p => console.log(`  - ${p.name} (${p.bank})`));

if (products.length === 0) {
  console.log('🎉 所有产品都有编码了！');
  process.exit(0);
}

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  locale: 'zh-CN',
});
const page = await context.newPage();
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

await page.goto('https://xinxipilu.chinawealth.com.cn/queryMenu/prodType', {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await new Promise(r => setTimeout(r, 3000));

const results = { matched: [], unmatched: [] };

for (let i = 0; i < products.length; i++) {
  const p = products[i];
  console.log(`\n[${i + 1}/${products.length}] ${p.name}`);

  const keywords = generateKeywords(p.name);
  console.log(`  候选：${keywords.join(' | ')}`);

  let best = null;
  let bestScore = 0;

  for (const kw of keywords) {
    try {
      const rows = await searchAndExtract(page, kw);
      if (rows.length === 0) { console.log(`    [${kw}] 无结果`); continue; }

      for (const row of rows) {
        let nameCol = '', codeCol = '', orgCol = '';
        for (const cell of row) {
          if (/^[ZC]\d{10,}$/.test(cell)) codeCol = cell;
          else if (cell.includes('理财') || cell.includes('银行')) {
            if (!orgCol && cell.length < 30) orgCol = cell;
          } else if (cell.length > 5 && !nameCol) nameCol = cell;
        }
        if (!codeCol) continue;

        const bankKeywords = BANK_KEYWORDS[p.bank] || [p.bank];
        const orgOk = bankKeywords.some(k => orgCol.includes(k));
        const score = similarity(p.name, nameCol) + (orgOk ? 0.3 : 0);

        if (score > bestScore) {
          bestScore = score;
          best = { name: nameCol, code: codeCol, org: orgCol };
        }
      }

      if (bestScore >= 0.65) { console.log(`    [${kw}] ✅ 高分匹配`); break; }
    } catch (e) {
      console.log(`    [${kw}] 出错: ${e.message.slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  if (best && bestScore >= 0.55) {
    console.log(`  ✅ ${best.name}`);
    console.log(`     ${best.code} | 分数 ${bestScore.toFixed(2)}`);
    const ok = await updateCode(p.id, best.code);
    if (ok) results.matched.push({ name: p.name, code: best.code });
  } else {
    console.log(`  ⚠️ 未匹配（最佳 ${bestScore.toFixed(2)}）`);
    results.unmatched.push({ name: p.name, best });
  }
}

fs.writeFileSync('match_report.json', JSON.stringify(results, null, 2));
console.log(`\n✅ 成功：${results.matched.length} | ⚠️ 未匹配：${results.unmatched.length}`);

await new Promise(r => setTimeout(r, 5000));
await browser.close();