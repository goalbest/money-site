import { chromium } from 'playwright';

const SUPABASE_URL = 'https://xbwzrnmacznaxtumkrwy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ENL6t2RGt7GKhT7Z4i5rbg_H20oeZ1i';
const USER_ID = 1;

async function getHoldingProducts() {
  const url = `${SUPABASE_URL}/rest/v1/user_holdings?select=product_id,products(id,name,code)&user_id=eq.${USER_ID}`;
  const resp = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  const data = await resp.json();
  return data.map(d => d.products).filter(p => p && p.code);
}

async function saveNavHistory(productId, navs) {
  const rows = navs
    .map(n => ({
      product_id: productId,
      nav_date: n.netValueDate,
      unit_nav: parseFloat(n.shareNetVal) || null,
      accum_nav: parseFloat(n.acumltNetVal) || null,
    }))
    .filter(r => r.nav_date && r.unit_nav);

  if (rows.length === 0) {
    console.log(`  ⚠️ 无有效净值数据`);
    return false;
  }

  console.log(`  📝 准备写入 ${rows.length} 条（product_id=${productId}）`);
  console.log(`     第一条：${JSON.stringify(rows[0])}`);

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/nav_history`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.log(`  ❌ 写入失败：${err.slice(0, 200)}`);
  }
  return resp.ok;
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

function calcYields(sortedNavs) {
  if (sortedNavs.length < 2) return { sevenDay: null, perMyriad: null };

  const dailyReturns = [];
  const days = Math.min(7, sortedNavs.length - 1);
  for (let i = 0; i < days; i++) {
    const today = parseFloat(sortedNavs[i].shareNetVal);
    const yesterday = parseFloat(sortedNavs[i + 1].shareNetVal);
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

const products = await getHoldingProducts();
console.log(`📋 需要更新的持仓产品：${products.length} 个`);
products.forEach(p => console.log(`  - id=${p.id} | ${p.name} | ${p.code}`));
console.log();

if (products.length === 0) process.exit(0);

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

let ok = 0, fail = 0;

for (let i = 0; i < products.length; i++) {
  const p = products[i];
  console.log(`\n[${i + 1}/${products.length}] ${p.name} (id=${p.id})`);

  let detailJson = null;
  const handler = async (response) => {
    if (response.url().includes('getProductDetail')) {
      try {
        detailJson = await response.json();
      } catch (e) {}
    }
  };
  page.on('response', handler);

  try {
    await page.goto(
      `https://xinxipilu.chinawealth.com.cn/queryMenu/prodType/prodTypeDetail?prodRegCode=${p.code}`,
      { waitUntil: 'networkidle', timeout: 45000 }
    );

    const hasCaptcha = await page.locator('text=请完成安全验证').first().isVisible().catch(() => false);
    if (hasCaptcha) {
      console.log('  🚨 验证码，请手动点完（60秒）');
      for (let w = 0; w < 60; w++) {
        await new Promise(r => setTimeout(r, 1000));
        const still = await page.locator('text=请完成安全验证').first().isVisible().catch(() => false);
        if (!still) break;
      }
    }

    await new Promise(r => setTimeout(r, 2000));

    if (detailJson?.data) {
      const basic = detailJson.data.prodBasicInfoVo || {};
      const netValueVo = detailJson.data.productTypeNetValueVo || {};
      const netValueLine = netValueVo.netValueLine || netValueVo.netValueVoList?.list || [];

      console.log(`  📊 拿到 ${netValueLine.length} 天净值数据`);

      if (netValueLine.length > 0) {
        await saveNavHistory(p.id, netValueLine);
      }

      const sorted = [...netValueLine].sort((a, b) =>
        (b.netValueDate || '').localeCompare(a.netValueDate || '')
      );

      const latest = sorted[0];
      const yields = calcYields(sorted);

      const updates = { bank_code: basic.prodCode || null };
      if (latest) {
        updates.unit_nav = latest.shareNetVal ? parseFloat(latest.shareNetVal) : null;
        updates.nav_date = latest.netValueDate || null;
      }
      if (yields.sevenDay !== null) {
        updates.annualized_1m = Number(yields.sevenDay.toFixed(4));
        updates.daily_return = Number(yields.perMyriad.toFixed(4));
      }

      console.log(`  ✅ 净值=${updates.unit_nav} | 七日年化=${updates.annualized_1m}% | 万收=${updates.daily_return} | ${updates.nav_date}`);
      await updateProduct(p.id, updates);
      ok++;
    } else {
      console.log('  ⚠️ 未获取到详情数据');
      fail++;
    }
  } catch (e) {
    console.log(`  ❌ 失败：${e.message}`);
    fail++;
  } finally {
    page.off('response', handler);
  }

  await new Promise(r => setTimeout(r, 3000));
}

await browser.close();
console.log(`\n🎉 完成！成功 ${ok}，失败 ${fail}`);