import { chromium } from 'playwright';
import fs from 'fs';

const SUPABASE_URL = 'https://xbwzrnmacznaxtumkrwy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ENL6t2RGt7GKhT7Z4i5rbg_H20oeZ1i';

const PROGRESS_FILE = './crawl_progress.json';
const DATA_FILE = './chinawealth_data.json';
const MAX_PAGES = 2500;
const DELAY_MS = 1500;

let allProducts = [];
let currentPage = 1;

if (fs.existsSync(PROGRESS_FILE)) {
  try {
    const p = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    currentPage = p.currentPage || 1;
    console.log(`📂 从第 ${currentPage} 页继续`);
  } catch (e) {}
}
if (fs.existsSync(DATA_FILE)) {
  try {
    allProducts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log(`📂 已有 ${allProducts.length} 条历史数据`);
  } catch (e) {}
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log('🌐 启动浏览器...');
const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});

const page = await context.newPage();
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

let newProducts = [];
page.on('response', async (response) => {
  if (response.url().includes('getProductList')) {
    try {
      const json = await response.json();
      if (json?.data?.list && json.data.list.length > 0) {
        newProducts.push(...json.data.list);
      }
    } catch (e) {}
  }
});

console.log('🌐 打开中国理财网...');
await page.goto('https://xinxipilu.chinawealth.com.cn/queryMenu/prodType', {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await sleep(3000);

if (currentPage > 1) {
  console.log(`⏩ 跳到第 ${currentPage} 页...`);
  try {
    const pageInput = page.locator('.el-pagination input.el-input__inner').first();
    await pageInput.fill(String(currentPage));
    await pageInput.press('Enter');
    await sleep(3000);
  } catch (e) {
    console.log('⚠️ 跳页失败，从第 1 页开始');
    currentPage = 1;
  }
}

for (let p = currentPage; p <= MAX_PAGES; p++) {
  // 检查可见的验证码弹窗
  const captchaVisible = await page.locator('text=请完成安全验证').first().isVisible().catch(() => false);
  if (captchaVisible) {
    console.log(`\n🚨 第 ${p} 页遇到验证码，请手动点完（脚本会自动继续）`);
    while (true) {
      await sleep(2000);
      const stillVisible = await page.locator('text=请完成安全验证').first().isVisible().catch(() => false);
      if (!stillVisible) {
        console.log('✅ 验证码已通过，继续抓取');
        await sleep(2000);
        break;
      }
    }
  }

  // 频率限制
  const tooFastVisible = await page.locator('text=请求过于频繁').first().isVisible().catch(() => false);
  if (tooFastVisible) {
    console.log('⏸️  频率限制，等 30 秒...');
    await sleep(30000);
  }

  // 保存本页数据
  if (newProducts.length > 0) {
    const cnt = newProducts.length;
    allProducts.push(...newProducts);
    newProducts = [];
    fs.writeFileSync(DATA_FILE, JSON.stringify(allProducts));
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ currentPage: p }));
    console.log(`➡️  第 ${p} 页：+${cnt} 条，累计 ${allProducts.length}`);
  } else {
    console.log(`➡️  第 ${p} 页：等待数据...`);
    await sleep(1500);
  }

  if (p >= MAX_PAGES) break;

  // 翻页
  try {
    const nextBtn = page.locator('button.btn-next').first();
    const isDisabled = await nextBtn.isDisabled().catch(() => false);
    if (isDisabled) {
      console.log('🏁 最后一页，抓取结束');
      break;
    }
    await nextBtn.click();
    await sleep(DELAY_MS);
  } catch (e) {
    console.log(`⚠️ 翻页失败，尝试输入框跳页...`);
    try {
      const pageInput = page.locator('.el-pagination input.el-input__inner').first();
      await pageInput.fill(String(p + 1));
      await pageInput.press('Enter');
      await sleep(DELAY_MS);
    } catch (e2) {
      console.log('❌ 翻页彻底失败，停止');
      break;
    }
  }
}

console.log(`\n🎉 抓取结束，共 ${allProducts.length} 条`);

// 去重
const seen = new Set();
const unique = [];
for (const pr of allProducts) {
  if (pr.prodRegCode && !seen.has(pr.prodRegCode)) {
    seen.add(pr.prodRegCode);
    unique.push(pr);
  }
}
console.log(`去重后 ${unique.length} 条`);

// 写入 Supabase
const rows = unique.map(pr => ({
  name: pr.prodName,
  bank: pr.orgName,
  code: pr.prodRegCode,
  unit_nav: pr.prodNetVal ? parseFloat(pr.prodNetVal) : null,
  annualized_1m: pr.performanceCompareBase ? parseFloat(pr.performanceCompareBase) : 0,
  daily_return: 0,
  nav_date: null,
}));

console.log(`\n📤 写入 Supabase...`);
let inserted = 0;
for (let i = 0; i < rows.length; i += 200) {
  const batch = rows.slice(i, i + 200);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(batch),
  });
  if (resp.ok) {
    inserted += batch.length;
    console.log(`✅ ${inserted}/${rows.length}`);
  } else {
    console.log(`❌ 批次失败: ${resp.status}`);
  }
}

console.log(`\n🎉 完成！入库 ${inserted} 条`);
await browser.close();