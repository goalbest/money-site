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
console.log('招银/交银净值更新（Playwright + 翻页）');
console.log('═══════════════════════════════\n');

// ── 从 product_sources 读招行产品 ──
const { data: sources, error: srcErr } = await supabase
  .from('product_sources')
  .select('id, product_id, params')
  .eq('source_type', 'cmb')
  .eq('enabled', true);

if (srcErr) {
  console.error('❌ 读 product_sources 失败:', srcErr.message);
  process.exit(1);
}

const CMB_PRODUCTS = (sources || []).map(s => ({
  dbId: s.product_id,
  saaCode: s.params.saaCode,
  ripInn: s.params.ripInn,
}));

console.log(`📌 读到 ${CMB_PRODUCTS.length} 个招行产品:`);
CMB_PRODUCTS.forEach(p => console.log(`   - ${p.ripInn} (${p.saaCode})`));
console.log('');

if (CMB_PRODUCTS.length === 0) { console.log('无产品，退出'); process.exit(0); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  locale: 'zh-CN',
});
const page = await context.newPage();

// 建会话：访问轻量首页拿 cookie（不访问慢的详情页）
console.log('→ 建立会话...');
async function ensureSession(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto('https://mobile.cmbchina.com/IEntrustFinance/', {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await page.waitForTimeout(2000);
      return true;
    } catch (e) {
      console.log(`   会话失败（${i + 1}/${retries}）: ${e.message}`);
      if (i === retries - 1) throw e;
      await page.waitForTimeout(3000);
    }
  }
}
await ensureSession();
console.log('   ✅ 会话已建立\n');

let totalUpserted = 0;

for (const p of CMB_PRODUCTS) {
  console.log(`→ [${p.dbId}] ${p.ripInn} (${p.saaCode})`);
  try {
        // 每个产品前先访问它的历史页，让会话绑定该产品
    await page.goto(
      `https://mobile.cmbchina.com/IEntrustFinance/financeproduct/historynetvalue.html?XRIPINN=${p.ripInn}&Code=${p.ripInn}&XSAACOD=${p.saaCode}&offSal=Y`,
      { waitUntil: 'domcontentloaded', timeout: 45000 }
    );
    await page.waitForTimeout(2000);
    
    // ── 先访问历史页，从 DOM 拿产品真名 ──
    let realName = null;
    try {
      await page.goto(
        `https://mobile.cmbchina.com/IEntrustFinance/financeproduct/historynetvalue.html?XRIPINN=${p.ripInn}&Code=${p.ripInn}&XSAACOD=${p.saaCode}&offSal=Y`,
        { waitUntil: 'domcontentloaded', timeout: 45000 }
      );
      await page.waitForTimeout(2000);

      // 从页面文本抓产品名
      const pageText = await page.evaluate(() => document.body.innerText);
      // 招行页面通常第一行是产品名，模式：中文 6-40 字，含"理财/持有/日开/天"等
      const nameMatch = pageText.match(/^([^\n]{6,60}(?:理财|持有|日开|封闭|天|号)[^\n]{0,30})/m);
      if (nameMatch) realName = nameMatch[1].trim();
      console.log(`   真名: ${realName || '(未拿到)'}`);
    } catch (e) {
      console.log(`   拿名字失败: ${e.message}`);
    }

    // 读数据库里该产品的最新净值日期
    const { data: latestRow } = await supabase
      .from('nav_history')
      .select('nav_date')
      .eq('product_id', p.dbId)
      .order('nav_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastNavDate = latestRow?.nav_date || '1970-01-01';
    console.log(`   数据库最新: ${lastNavDate}`);

    // ── 翻页抓全部历史 ──
    let yNavDat = '0';
    let round = 0;
    let allRows = [];
    let latest = null;

    while (round < 20) {
      const result = await page.evaluate(async ({ saaCode, ripInn, yNavDat }) => {
        const r = await fetch('/ientrustfinance/product-statistics/get-history-value', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            saaCode, ripInn, yDalCod: 'N', ySaaCode: '', yFndInn: '', yNavDat,
          }),
        });
        return await r.json();
      }, { saaCode: p.saaCode, ripInn: p.ripInn, yNavDat });

      if (result.sysCode !== 200) {
        console.log(`   ❌ 接口错: sysCode=${result.sysCode} ${result.sysMsg}`);
        break;
      }

      const list = result.bizResult?.data?.historyValueLists || [];
      const reqY1 = result.bizResult?.data?.historyValueReqY1;
      if (list.length === 0) break;

      if (!latest) latest = list[0];

      // ★ 只保留比数据库最新日期更新的数据
      const newRows = list
        .filter(x => x.date > lastNavDate)
        .map(x => ({
          product_id: p.dbId,
          nav_date: x.date,
          unit_nav: parseFloat(x.unitNetValue),
          accum_nav: parseFloat(x.totalNetValue),
        }));

      // 如果本页最旧日期 <= 数据库最新 → 翻到已知区域，停止
      const oldestInPage = list[list.length - 1]?.date;
      if (oldestInPage && oldestInPage <= lastNavDate) {
        allRows.push(...newRows);
        console.log(`   翻到已知区域（${oldestInPage}），停止翻页`);
        break;
      }

      allRows.push(...newRows);

      if (list.length < 30) break;
      const next = reqY1?.yNavDat;
      if (!next || next === yNavDat) break;

      yNavDat = next;
      round++;
      await page.waitForTimeout(800);
    }

    if (allRows.length === 0) { console.log('   ⚠️ 无数据\n'); continue; }
    console.log(`   拿到 ${allRows.length} 条净值（${round + 1} 页）`);

    console.log(`   最新: ${latest.unitNetValue} @ ${latest.date}`);

    // ── 批量写入 nav_history ──
    const { error } = await supabase.from('nav_history').upsert(allRows, {
      onConflict: 'product_id,nav_date',
    });
    if (error) { console.log(`   ❌ upsert 失败: ${error.message}\n`); continue; }
    totalUpserted += allRows.length;

    // 如果有真名且当前是占位符 → 更新名字
    if (realName) {
      const { data: cur } = await supabase
        .from('products').select('name').eq('id', p.dbId).single();
      if (cur?.name?.startsWith('招行产品')) {
        await supabase.from('products').update({ name: realName }).eq('id', p.dbId);
        console.log(`   名字已更新: ${realName}`);
      }
    }

    // ── 更新 products 最新净值 ──
    const updates = {
      unit_nav: parseFloat(latest.unitNetValue),
      nav_date: latest.date,
      bank_code: p.ripInn,
    };
    const chg = parseFloat(latest.netValueChange);
    if (isFinite(chg)) updates.daily_return = chg;

    const { error: updErr } = await supabase.from('products').update(updates).eq('id', p.dbId);
    if (updErr) {
      console.log(`   ⚠️ products 更新失败: ${updErr.message}`);
    } else {
      console.log(`   📝 daily_return = ${chg}`);
    }

    console.log(`   ✅ 写入 ${allRows.length} 条\n`);

    // 记录抓取时间
    await supabase.from('product_sources')
      .update({ last_fetch_at: new Date().toISOString(), last_error: null })
      .eq('product_id', p.dbId)
      .eq('source_type', 'cmb');

    await page.waitForTimeout(500);
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}\n`);
    await supabase.from('product_sources')
      .update({ last_error: e.message })
      .eq('product_id', p.dbId)
      .eq('source_type', 'cmb');
  }
}

await browser.close();
console.log(`🎉 完成，共写入 ${totalUpserted} 条`);