import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CMB_PRODUCTS = [
  { dbId: 959, saaCode: 'D07', ripInn: 'JY040232' },
  { dbId: 954, saaCode: 'D07', ripInn: 'JY040230' },
  { dbId: 960, saaCode: 'D07', ripInn: '120029A' },
];

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

// ══════════════ 主流程 ══════════════
console.log('═══════════════════════════════');
console.log('招银/交银净值更新（Playwright）');
console.log('═══════════════════════════════\n');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  locale: 'zh-CN',
});
const page = await context.newPage();

// 先访问详情页拿 cookie
console.log('→ 建立会话...');
await page.goto(
  'https://mobile.cmbchina.com/IEntrustFinance/subsidiaryproduct/financedetail.html?XRIPINN=JY040232&XSAACOD=D07',
  { waitUntil: 'domcontentloaded', timeout: 30000 }
);
await page.waitForTimeout(3000);
console.log('   ✅ 会话已建立\n');

let totalUpserted = 0;

for (const p of CMB_PRODUCTS) {
  console.log(`→ [${p.dbId}] ${p.ripInn} (${p.saaCode})`);
  try {
    // 在页面上下文里执行 fetch（自动带 cookie + 同源 referer）
    const result = await page.evaluate(async ({ saaCode, ripInn }) => {
      const r = await fetch('/ientrustfinance/product-statistics/get-history-value', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          saaCode, ripInn, yDalCod: 'N', ySaaCode: '', yFndInn: '', yNavDat: '0',
        }),
      });
      return await r.json();
    }, { saaCode: p.saaCode, ripInn: p.ripInn });

    if (result.sysCode !== 200) {
      console.log(`   ❌ 接口错: sysCode=${result.sysCode} ${result.sysMsg}`);
      continue;
    }

    const list = result.bizResult?.data?.historyValueLists || [];
    if (list.length === 0) { console.log('   ⚠️ 无数据\n'); continue; }
    console.log(`   拿到 ${list.length} 条净值`);

    const latest = list[0];
    console.log(`   最新: ${latest.unitNetValue} @ ${latest.date}`);

    const rows = list.map(x => ({
      product_id: p.dbId,
      nav_date: x.date,
      unit_nav: parseFloat(x.unitNetValue),
      accum_nav: parseFloat(x.totalNetValue),
    }));

    const { error } = await supabase.from('nav_history').upsert(rows, {
      onConflict: 'product_id,nav_date',
    });
    if (error) { console.log(`   ❌ upsert 失败: ${error.message}\n`); continue; }
    totalUpserted += rows.length;

    await supabase.from('products').update({
      unit_nav: parseFloat(latest.unitNetValue),
      nav_date: latest.date,
      bank_code: p.ripInn,
    }).eq('id', p.dbId);

    console.log(`   ✅ 写入 ${rows.length} 条\n`);
    await page.waitForTimeout(500);
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}\n`);
  }
}

await browser.close();
console.log(`🎉 完成，共写入 ${totalUpserted} 条`);