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
console.log('中国银行净值更新（点击查看更多）');
console.log('═══════════════════════════════\n');

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

console.log(`📌 读到 ${BOC_PRODUCTS.length} 个中国银行产品:\n`);
BOC_PRODUCTS.forEach(p => console.log(`   - ${p.productCode}`));
if (BOC_PRODUCTS.length === 0) { console.log('无产品，退出'); process.exit(0); }
console.log('');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  locale: 'zh-CN',
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

let updated = 0, failed = 0;

// 从文本解析 (日期, 单位净值, 累计净值)
function parseNavList(text) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const result = [];
  for (let i = 0; i < lines.length - 2; i++) {
    const dateMatch = lines[i].match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (!dateMatch) continue;

    const date = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`;
    const next = lines[i + 1];
    const nextNext = lines[i + 2];

    // 日期后紧跟的两个数字 = 单位净值、累计净值
    let nav = null, accum = null;
    if (/^[0-9]+\.[0-9]+$/.test(next)) nav = parseFloat(next);
    if (/^[0-9]+\.[0-9]+$/.test(nextNext)) accum = parseFloat(nextNext);

    if (nav !== null) {
      result.push({ date, nav, accum });
    }
  }
  const seen = new Set();
  return result.filter(r => {
    if (seen.has(r.date)) return false;
    seen.add(r.date);
    return true;
  });
}

for (const p of BOC_PRODUCTS) {
  console.log(`→ [${p.dbId}] ${p.productCode}`);
  try {
    const detailUrl = `https://ebsnew.boc.cn/bocphone/VueLocalCli4/bocFinanceDetail/index.html#/productDetail?functionCode=bocFinanceProductDetail&productId=${p.productCode}`;
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);

    const detailText = await page.evaluate(() => document.body.innerText);
    console.log('   详情页已加载');

    const nameMatch = detailText.match(/（[^）]*）([^\n(（|]+?)\(([A-Z0-9]+)\)/);
    const productName = nameMatch?.[1]?.trim() || null;

    // 点击"查看更多"
    try {
      const btn = await page.locator('text=查看更多').first();
      if (await btn.count() > 0) {
        await btn.click();
        console.log('   已点击"查看更多"');
        await page.waitForTimeout(5000);
      }
    } catch (e) {
      console.log(`   点"查看更多"失败: ${e.message}`);
    }

    const listText = await page.evaluate(() => document.body.innerText);
        // ── 解析交易规则 ──
    const rules = {
      redeem_arrival_days: null,
      redeem_confirm_days: 1,
      redeem_cutoff_time: null,
      risk_level: null,
    };
    const riskM = detailText.match(/(?:P?R)(\d)/i);
    if (riskM) rules.risk_level = `R${riskM[1]}`;
    const arrM = detailText.match(/T\+?(\d+)\s*到账/);
    if (arrM) rules.redeem_arrival_days = parseInt(arrM[1], 10);
    const cutM = detailText.match(/(\d{1,2}):(\d{2})\s*前/);
    if (cutM) rules.redeem_cutoff_time = `${cutM[1].padStart(2,'0')}:${cutM[2]}`;
    console.log(`   规则: 到账T+${rules.redeem_arrival_days}, 截止${rules.redeem_cutoff_time}, 风险${rules.risk_level}`);

    const list = parseNavList(listText);
    console.log(`   解析到 ${list.length} 条`);

    if (list.length === 0) {
      console.log('   ⚠️ 没有净值数据\n');
      failed++;
      continue;
    }

    // 打印前 3 条调试
    console.log('   前 3 条:');
    list.slice(0, 3).forEach(r => console.log(`     ${r.date} | nav=${r.nav} | accum=${r.accum}`));

    const navRows = list.map(r => ({
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

    const latestRow = list[0];
    const updates = {
      unit_nav: latestRow.nav,
      nav_date: latestRow.date,
      bank_code: p.productCode,
      redeem_arrival_days: rules.redeem_arrival_days,
      redeem_confirm_days: rules.redeem_confirm_days,
      redeem_cutoff_time: rules.redeem_cutoff_time,
      risk_level: rules.risk_level,
    };
    if (productName && !productName.startsWith('中行产品')) updates.name = productName;

    await supabase.from('products').update(updates).eq('id', p.dbId);
    await supabase.from('product_sources')
      .update({ last_fetch_at: new Date().toISOString(), last_error: null })
      .eq('id', p.srcId);

    console.log(`   ✅ 写入 ${list.length} 条，最新: ${latestRow.nav} @ ${latestRow.date}\n`);
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