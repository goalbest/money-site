import { chromium } from 'playwright';

const SUPABASE_URL = 'https://xbwzrnmacznaxtumkrwy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ENL6t2RGt7GKhT7Z4i5rbg_H20oeZ1i';
const allProducts = [];

console.log('🌐 正在启动浏览器...');
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

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

console.log('⏳ 等待数据加载...');
await page.waitForTimeout(3000);

// 循环点击下一页
const MAX_PAGES = 100;
for (let i = 0; i < MAX_PAGES; i++) {
  try {
    // 找到"下一页"按钮
    const nextBtn = page.locator('button.btn-next, .el-pagination .btn-next').first();
    if (await nextBtn.isDisabled()) {
      console.log('🏁 已到最后一页');
      break;
    }
    await nextBtn.click();
    await page.waitForTimeout(2000);
    console.log(`➡️  翻页中...`);
  } catch (e) {
    console.log('⚠️ 翻页失败:', e.message);
    break;
  }
}

console.log(`\n🎉 共抓到 ${allProducts.length} 条产品`);

if (allProducts.length > 0) {
  const rows = allProducts.filter(p => p.prodName).map(p => ({
    name: p.prodName,
    bank: p.orgName,
    code: p.prodRegCode,
    unit_nav: p.prodNetVal ? parseFloat(p.prodNetVal) : null,
    annualized_1m: p.performanceCompareBase ? parseFloat(p.performanceCompareBase) : 0,
    daily_return: 0,
    nav_date: null,
  }));

  // 按编码去重
  const seen = new Set();
  const unique = [];
  for (const r of rows) {
    if (!seen.has(r.code)) {
      seen.add(r.code);
      unique.push(r);
    }
  }
  console.log(`去重后 ${unique.length} 条`);

  // 分批写入，每批 200 条
  console.log(`\n📤 开始写入 Supabase...`);
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const batch = unique.slice(i, i + 200);
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (resp.ok) {
      inserted += batch.length;
      console.log(`✅ 已插入 ${inserted}/${unique.length}`);
    } else {
      const errText = await resp.text();
      console.log(`❌ 批次 ${i} 失败: ${resp.status} - ${errText.slice(0, 200)}`);
    }
  }
  console.log(`\n🎉 完成！共入库 ${inserted} 条`);
}

await browser.close();
console.log('🏁 结束');