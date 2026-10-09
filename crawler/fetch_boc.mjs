import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(function loadEnv() {
  for (const p of [resolve(__dirname, '..', '.env.local'), resolve(process.cwd(), '.env.local')]) {
    if (existsSync(p)) {
      let c = readFileSync(p, 'utf-8').replace(/^\uFEFF/, '');
      c.split(/\r?\n/).forEach(l => {
        const m = l.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
        if (m) {
          const k = m[1].trim(); let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          if (!process.env[k]) process.env[k] = v;
        }
      });
      return;
    }
  }
})();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ env 缺失'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('═══════════════════════════════');
console.log('中国银行净值更新（Playwright 两步走）');
console.log('═══════════════════════════════\n');

// ── 从 product_sources 读中国银行产品 ──
const { data: sources, error: srcErr } = await supabase
  .from('product_sources')
  .select('id, product_id, params')
  .eq('source_type', 'boc')
  .eq('enabled', true);

if (srcErr) { console.error('❌ 读 product_sources 失败:', srcErr.message); process.exit(1); }

const BOC_PRODUCTS = (sources || []).map(s => ({
  dbId: s.product_id,
  srcId: s.id,
  productCode: s.params.product_id,
}));

console.log(`📌 读到 ${BOC_PRODUCTS.length} 个中国银行产品:`);
BOC_PRODUCTS.forEach(p => console.log(`   - ${p.productCode}`));
console.log('');
if (BOC_PRODUCTS.length === 0) { console.log('无产品，退出'); process.exit(0); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  locale: 'zh-CN',
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

let updated = 0, failed = 0;
const today = new Date().toISOString().slice(0, 10);

for (const p of BOC_PRODUCTS) {
  console.log(`→ [${p.dbId}] ${p.productCode}`);
  try {
    // ① 访问详情页（带 productId）
    const detailUrl = `https://ebsnew.boc.cn/bocphone/VueLocalCli4/bocFinanceDetail/index.html#/productDetail?functionCode=bocFinanceProductDetail&productId=${p.productCode}`;
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    console.log('   详情页已加载');

    // ② 抓产品名 + 最新净值（详情页就有）
    const detailContent = await page.evaluate(() => document.body.innerText);
    const nameMatch = detailContent.match(/（[^）]*）([^\n(（]+?)\(([A-Z0-9]+)\)/);
    const productName = nameMatch?.[1]?.trim() || null;

    const navMatch = detailContent.match(/([0-9]+\.[0-9]{4})\s*$/m) 
                  || detailContent.match(/单位净值[^\d]*([0-9]+\.[0-9]{4})/);
    let latestNav = navMatch ? parseFloat(navMatch[1]) : null;

    // ③ 用 JS 改 hash 到历史净值页
    await page.evaluate(() => {
      window.location.hash = '#/productDetail/profitList';
    });
    await page.waitForTimeout(5000);
    console.log('   历史页已加载');

    // ④ 读历史表格 DOM（第一行 = 最新）
    const rows = await page.evaluate(() => {
      // 找所有含日期的行
      const all = document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean);
      const result = [];
      for (let i = 0; i < all.length; i++) {
        if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(all[i])) {
          // 下一行应该是单位净值，再下一行是累计净值
          const date = all[i];
          const nav = all[i + 1];
          const accum = all[i + 2];
          if (/^[0-9]+\.[0-9]+$/.test(nav)) {
            result.push({
              date: date.replace(/\//g, '-'),
              nav: parseFloat(nav),
              accum: /^[0-9]+\.[0-9]+$/.test(accum) ? parseFloat(accum) : null,
            });
          }
        }
      }
      return result.slice(0, 30); // 最多 30 条
    });

    console.log(`   历史页拿到 ${rows.length} 条`);

    if (rows.length === 0) {
      console.log('   ⚠️ 未解析到历史数据\n');
      failed++;
      continue;
    }

    // ⑤ 批量写 nav_history
    const navRows = rows.map(r => ({
      product_id: p.dbId,
      nav_date: r.date,
      unit_nav: r.nav,
      accum_nav: r.accum,
    }));

    const { error: upErr } = await supabase.from('nav_history').upsert(navRows, {
      onConflict: 'product_id,nav_date',
    });
    if (upErr) {
      console.log(`   ❌ nav_history 写入失败: ${upErr.message}\n`);
      failed++;
      continue;
    }

    // ⑥ 更新 products 最新净值 + 名字
    const latestRow = rows[0];
    const updates = {
      unit_nav: latestRow.nav,
      nav_date: latestRow.date,
      bank_code: p.productCode,
    };
    if (productName && !productName.startsWith('中行产品')) updates.name = productName;

    await supabase.from('products').update(updates).eq('id', p.dbId);

    await supabase.from('product_sources')
      .update({ last_fetch_at: new Date().toISOString(), last_error: null })
      .eq('id', p.srcId);

    console.log(`   ✅ 写入 ${rows.length} 条，最新: ${latestRow.nav} @ ${latestRow.date}\n`);
    updated++;
    await page.waitForTimeout(1000);
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}\n`);
    failed++;
    await supabase.from('product_sources')
      .update({ last_error: e.message })
      .eq('id', p.srcId);
  }
}

await browser.close();
console.log(`🎉 完成: 更新 ${updated}，失败 ${failed}`);