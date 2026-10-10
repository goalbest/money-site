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
console.log('中国银行净值更新');
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

function parseNavList(text) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const result = [];
  for (let i = 0; i < lines.length - 2; i++) {
    const dateMatch = lines[i].match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (!dateMatch) continue;
    const date = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`;
    const next = lines[i + 1];
    const nextNext = lines[i + 2];
    let nav = null, accum = null;
    if (/^[0-9]+\.[0-9]+$/.test(next)) nav = parseFloat(next);
    if (/^[0-9]+\.[0-9]+$/.test(nextNext)) accum = parseFloat(nextNext);
    if (nav !== null) result.push({ date, nav, accum });
  }
  const seen = new Set();
  return result.filter(r => { if (seen.has(r.date)) return false; seen.add(r.date); return true; });
}

for (const p of BOC_PRODUCTS) {
  console.log(`→ [${p.dbId}] ${p.productCode}`);
  try {
    const detailUrl = `https://ebsnew.boc.cn/bocphone/VueLocalCli4/bocFinanceDetail/index.html#/productDetail?functionCode=bocFinanceProductDetail&productId=${p.productCode}`;
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);

    let detailText = await page.evaluate(() => document.body.innerText);
    console.log('   详情页已加载');

    const nameMatch = detailText.match(/（[^）]*）([^\n(（|]+?)\(([A-Z0-9]+)\)/);
    const productName = nameMatch?.[1]?.trim() || null;

    // ── 解析规则（唯一一份）──
    let riskLevel = null;
    let arrivalDays = null;
    let cutoffTime = null;

    // 风险等级
    const riskM = detailText.match(/(?:P?R)(\d)/i);
    if (riskM) riskLevel = `R${riskM[1]}`;

    // 到账时间（多种模式）
    const arrPatterns = [
      /T\+?(\d+)\s*到账/,
      /预计[^\d]{0,10}T\+?(\d+)/,
      /(\d+)\s*个工作日[^\n]{0,15}到账/,
      /T\+?(\d+)\s*个?工作日/,
    ];
    for (const re of arrPatterns) {
      const m = detailText.match(re);
      if (m) { arrivalDays = parseInt(m[1], 10); break; }
    }

    // 截止时间
    const cutM = detailText.match(/(\d{1,2}):(\d{2})\s*(?:前|之前)/);
    if (cutM) cutoffTime = `${cutM[1].padStart(2, '0')}:${cutM[2]}`;

    console.log(`   规则: 风险${riskLevel || '?'}, 到账T+${arrivalDays || '?'}, 截止${cutoffTime || '?'}`);

    // 调试：打印所有含"到账"的行
    const arrivalLines = detailText.split('\n').map(l => l.trim()).filter(l => l.includes('到账') || l.includes('赎回') && l.length < 100);
    console.log('   相关行:');
    arrivalLines.slice(0, 5).forEach(l => console.log(`     "${l}"`));

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
    const list = parseNavList(listText);
    console.log(`   解析到 ${list.length} 条`);

    if (list.length === 0) {
      console.log('   ⚠️ 没有净值数据\n');
      failed++;
      continue;
    }

    const navRows = list.map(r => ({
      product_id: p.dbId, nav_date: r.date, unit_nav: r.nav, accum_nav: r.accum,
    }));

    const { error: upErr } = await supabase.from('nav_history').upsert(navRows, {
      onConflict: 'product_id,nav_date',
    });
    if (upErr) { console.log(`   ❌ nav_history 失败: ${upErr.message}\n`); failed++; continue; }

    const latestRow = list[0];
    const updates = {
      unit_nav: latestRow.nav,
      nav_date: latestRow.date,
      bank_code: p.productCode,
      risk_level: riskLevel,
      redeem_arrival_days: arrivalDays,
      redeem_confirm_days: 1,
      redeem_cutoff_time: cutoffTime,
    };
    if (productName && !productName.startsWith('中行产品')) updates.name = productName;

    await supabase.from('products').update(updates).eq('id', p.dbId);
    await supabase.from('product_sources')
      .update({ last_fetch_at: new Date().toISOString(), last_error: null })
      .eq('id', p.srcId);

    console.log(`   ✅ 写入 ${list.length} 条\n`);
    updated++;
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}\n`);
    failed++;
  }
}

await browser.close();
console.log(`🎉 完成: 更新 ${updated}，失败 ${failed}`);