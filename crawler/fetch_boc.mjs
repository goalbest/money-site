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
console.log('中国银行净值更新（Playwright）');
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

// ── 启动浏览器 ──
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
    const detailUrl = `https://ebsnew.boc.cn/bocphone/VueLocalCli4/bocFinanceDetail/index.html#/productDetail?functionCode=bocFinanceProductDetail&productId=${p.productCode}`;

    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // 等 JS 渲染
    await page.waitForTimeout(5000);

    // 抓整页文本
    const content = await page.evaluate(() => document.body.innerText);
    console.log('   页面文本前 500 字:');
    console.log('   ' + content.slice(0, 500).replace(/\n/g, ' | '));

    // 尝试多种正则
    let nav = null;
    const patterns = [
      /单位净值\s*[:：]?\s*([0-9]+\.[0-9]{2,4})/,
      /净值\s*[:：]?\s*([0-9]+\.[0-9]{2,4})/,
      /最新净值\s*[:：]?\s*([0-9]+\.[0-9]{2,4})/,
    ];
    for (const re of patterns) {
      const m = content.match(re);
      if (m) { nav = parseFloat(m[1]); break; }
    }

    // 拿净值日期（页面上如果有"净值日期"，用它；没有就用今天）
    let navDate = today;
    const ndM = content.match(/净值日期[^\d]{0,5}(\d{4})[.\-年/](\d{1,2})[.\-月/](\d{1,2})/);
    if (ndM) {
      navDate = `${ndM[1]}-${ndM[2].padStart(2, '0')}-${ndM[3].padStart(2, '0')}`;
    }

    // 拿产品名：用 productCode 反查，找含 (PYWJCY134) 的片段
    let name = null;
    const codeEsc = p.productCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const codeRe = new RegExp(`([^|\\n]{4,60})\\(${codeEsc}\\)`);
    const nameM = content.match(codeRe);
    if (nameM) {
      name = nameM[1]
        .trim()
        // 去掉前缀括号内容，比如"（稳健固收）"
        .replace(/^[（(][^）)]*[）)]\s*/, '')
        .trim();
    }

    if (nav && isFinite(nav) && nav > 0 && nav < 100) {
      console.log(`   ✅ 净值: ${nav} @ ${navDate}`);

      const updates = { unit_nav: nav, nav_date: navDate };
      if (name) updates.name = name;
      await supabase.from('products').update(updates).eq('id', p.dbId);

      await supabase.from('nav_history').upsert(
        { product_id: p.dbId, nav_date: navDate, unit_nav: nav },
        { onConflict: 'product_id,nav_date' }
      );

      await supabase.from('product_sources')
        .update({ last_fetch_at: new Date().toISOString(), last_error: null })
        .eq('id', p.srcId);

      updated++;
    } else {
      console.log(`   ⚠️ 未提取到净值（页面结构可能变了）`);
      failed++;
      await supabase.from('product_sources')
        .update({ last_error: '未提取到净值' })
        .eq('id', p.srcId);
    }
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}\n`);
    failed++;
    await supabase.from('product_sources')
      .update({ last_error: e.message })
      .eq('id', p.srcId);
  }
  await page.waitForTimeout(1000);
}

await browser.close();
console.log(`\n🎉 完成: 更新 ${updated}，失败 ${failed}`);