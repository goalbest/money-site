import { chromium } from 'playwright';

const SUPABASE_URL = 'https://xbwzrnmacznaxtumkrwy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ENL6t2RGt7GKhT7Z4i5rbg_H20oeZ1i';

const LIMIT = 10;
const DELAY_MS = 3000;

async function fetchPendingProducts() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/products?select=id,name,code&order=id.desc&limit=${LIMIT}`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  return await resp.json();
}

async function updateProduct(id, updates) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  });
  return resp.ok;
}

const products = await fetchPendingProducts();
console.log(`📋 待更新产品：${products.length} 个\n`);

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  locale: 'zh-CN',
});

let idx = 0;
let ok = 0;
let fail = 0;

for (const p of products) {
  idx++;
  console.log(`[${idx}/${products.length}] ${p.name}`);

  const page = await context.newPage();
  let detailJson = null;
  page.on('response', async (response) => {
    if (response.url().includes('getProductDetail')) {
      try {
        detailJson = await response.json();
      } catch (e) {}
    }
  });

  try {
    await page.goto(
      `https://xinxipilu.chinawealth.com.cn/queryMenu/prodType/prodTypeDetail?prodRegCode=${p.code}`,
      { waitUntil: 'networkidle', timeout: 45000 }
    );
    await new Promise(r => setTimeout(r, 2000));

    if (detailJson?.data) {
      const basic = detailJson.data.prodBasicInfoVo || {};
      const nv = detailJson.data.productTypeNetValueVo?.netValueVoList?.list?.[0];

      const updates = {
        bank_code: basic.prodCode || null,
      };

      if (nv) {
        updates.unit_nav = nv.shareNetVal ? parseFloat(nv.shareNetVal) : null;
        updates.annualized_1m = nv.yieldSevenDay ? parseFloat(nv.yieldSevenDay) : null;
        updates.daily_return = nv.yieldPerMyriad ? parseFloat(nv.yieldPerMyriad) : null;
        updates.nav_date = nv.netValueDate || null;
      }

      console.log(`  ✅ 银行代码=${updates.bank_code} | 净值=${updates.unit_nav} | 七日年化=${updates.annualized_1m}% | 万收=${updates.daily_return} | 日期=${updates.nav_date}`);

      const okUpdate = await updateProduct(p.id, updates);
      if (okUpdate) ok++;
      else fail++;
    } else {
      console.log('  ⚠️ 未获取到详情数据');
      fail++;
    }
  } catch (e) {
    console.log(`  ❌ 失败: ${e.message}`);
    fail++;
  }

  await page.close();
  await new Promise(r => setTimeout(r, DELAY_MS));
}

await browser.close();
console.log(`\n🎉 完成！成功 ${ok}，失败 ${fail}`);