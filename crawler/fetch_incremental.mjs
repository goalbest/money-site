import { chromium } from 'playwright';

const SUPABASE_URL = 'https://xbwzrnmacznaxtumkrwy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ENL6t2RGt7GKhT7Z4i5rbg_H20oeZ1i';

const PAGES_TO_CRAWL = 10;
const allProducts = [];

console.log('🌐 正在启动浏览器...');
const browser = await chromium.launch({
  headless: false,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});

const page = await context.newPage();

// 隐藏 webdriver 特征
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

page.on('response', async (response) => {
  if (response.url().includes('getProductList')) {
    try {
      const json = await response.json();
      if (json?.data?.list && json.data.list.length > 0) {
        allProducts.push(...json.data.list);
        console.log(`📦 抓到 ${json.data.list.length} 条，累计 ${allProducts.length}`);
      }
    } catch (e) {}
  }
});

console.log('🌐 打开中国理财网...');
await page.goto('https://xinxipilu.chinawealth.com.cn/queryMenu/prodType', {
  waitUntil: 'networkidle',
  timeout: 60000,
});

console.log('⏳ 等待数据...');
await new Promise(r => setTimeout(r, 5000));

for (let i = 1; i < PAGES_TO_CRAWL; i++) {
  const captcha = await page.locator('text=请完成安全验证').count();
  if (captcha > 0) {
    console.log('🚨 出现验证码，请在浏览器里手动点完（等 60 秒）...');
    for (let w = 0; w < 60; w++) {
      await new Promise(r => setTimeout(r, 1000));
      const still = await page.locator('text=请完成安全验证').count();
      if (still === 0) {
        console.log('✅ 验证码已通过');
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  const tooFast = await page.locator('text=请求过于频繁').count();
  if (tooFast > 0) {
    console.log('⏸️  触发频率限制，等 30 秒...');
    await new Promise(r => setTimeout(r, 30000));
  }

  try {
    const nextBtn = page.locator('button.btn-next, .el-pagination .btn-next').first();
    if (await nextBtn.isDisabled()) {
      console.log('🏁 已到最后一页');
      break;
    }
    await nextBtn.click();
    // 随机延迟 6-12 秒
    const delay = Math.floor(Math.random() * 6000) + 6000;
    await new Promise(r => setTimeout(r, delay));
    console.log(`➡️  已翻到第 ${i + 1} 页（延迟 ${delay / 1000} 秒）`);
  } catch (e) {
    console.log('⚠️ 翻页失败:', e.message);
    break;
  }
}

console.log(`\n🎉 共抓到 ${allProducts.length} 条`);

if (allProducts.length === 0) {
  console.log('❌ 没抓到数据，退出');
  await browser.close();
  process.exit(0);
}

const seen = new Set();
const unique = [];
for (const p of allProducts) {
  if (p.prodRegCode && !seen.has(p.prodRegCode)) {
    seen.add(p.prodRegCode);
    unique.push(p);
  }
}
console.log(`去重后 ${unique.length} 条`);

const rows = unique.map(p => ({
  name: p.prodName,
  bank: p.orgName,
  code: p.prodRegCode,
  unit_nav: p.prodNetVal ? parseFloat(p.prodNetVal) : null,
  annualized_1m: p.performanceCompareBase ? parseFloat(p.performanceCompareBase) : 0,
  daily_return: 0,
  nav_date: null,
}));

console.log(`\n📤 写入 Supabase...`);

let inserted = 0;
for (let i = 0; i < rows.length; i += 100) {
  const batch = rows.slice(i, i + 100);
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
    console.log(`✅ 批次 ${i / 100 + 1} 成功（${batch.length} 条）`);
  } else {
    const errText = await resp.text();
    console.log(`❌ 批次 ${i / 100 + 1} 失败: ${resp.status} - ${errText.slice(0, 200)}`);
  }
}

console.log(`\n🎉 增量更新完成，提交 ${inserted} 条`);
await browser.close();
console.log('🏁 结束');