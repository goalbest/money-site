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

// 从 product_sources 读招行产品
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

// 建会话
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

// ── 规则解析工具函数 ──
function parseRules(text) {
  let riskLevel = null, arrivalDays = null, cutoffTime = null;

  // 1. 风险等级
  const riskM = text.match(/(?:P?R)(\d)/i);
  if (riskM) riskLevel = `R${riskM[1]}`;

  // 2. 截止时间
  const cutM = text.match(/T日\s*(\d{1,2}):(\d{2})\s*(?:前|之前)/);
  if (cutM) {
    cutoffTime = `${cutM[1].padStart(2, '0')}:${cutM[2]}`;
  } else {
    const anyCutM = text.match(/(\d{1,2}):(\d{2})\s*(?:前|之前)/);
    if (anyCutM) cutoffTime = `${anyCutM[1].padStart(2, '0')}:${anyCutM[2]}`;
  }

  // 3. 到账时间（多格式）
  const m1 = text.match(/T\+?(\d+)\s*日?\s*到账/);   // T+2日到账
  const m2 = text.match(/最快T\+?(\d+)/);             // 最快T+1
  const m3 = text.match(/(\d+)\s*个工作日[^\n]{0,10}(?:到账|内)/); // 3个工作日内
  const m4 = text.match(/预计\s*T\+?(\d+)/);          // 预计T+1
  const m5 = text.match(/T\+?(\d+)\s*内/);            // ★ T+5内
  const m6 = text.match(/T\+?(\d+)\s*(?:个?交易日?)/); // T+2交易日

  const arrivalMatch = m1 || m2 || m3 || m4 || m5 || m6;
  if (arrivalMatch) arrivalDays = parseInt(arrivalMatch[1], 10);

  return { riskLevel, arrivalDays, cutoffTime };
}

let totalUpserted = 0;

for (const p of CMB_PRODUCTS) {
  console.log(`→ [${p.dbId}] ${p.ripInn} (${p.saaCode})`);

  // ★ 每个产品的变量声明在 try 外面，避免作用域问题
  let realName = null;
  let rules = { riskLevel: null, arrivalDays: null, cutoffTime: null };

  try {
    // ① 访问历史页（绑定 session）
    await page.goto(
      `https://mobile.cmbchina.com/IEntrustFinance/financeproduct/historynetvalue.html?XRIPINN=${p.ripInn}&Code=${p.ripInn}&XSAACOD=${p.saaCode}&offSal=Y`,
      { waitUntil: 'domcontentloaded', timeout: 45000 }
    );
    await page.waitForTimeout(2000);

    // ② 访问详情页，拿名字 + 规则
    try {
      await page.goto(
        `https://mobile.cmbchina.com/IEntrustFinance/subsidiaryproduct/financedetail.html?XRIPINN=${p.ripInn}&XSAACOD=${p.saaCode}`,
        { waitUntil: 'domcontentloaded', timeout: 45000 }
      );
      await page.waitForTimeout(2500);

      const detailText = await page.evaluate(() => document.body.innerText);
      const title = await page.title();

      // 从 title 拿名字
      if (title && title.length > 4 && !title.includes('招商银行')) {
        realName = title.trim();
      } else {
        const head = await page.evaluate(() => {
          const el = document.querySelector('h1, [class*="title"], [class*="name"]');
          return el?.innerText?.trim() || '';
        });
        if (head && head.length > 4) realName = head;
      }

      // 解析规则
      rules = parseRules(detailText);

      console.log(`   title: ${title}`);
      console.log(`   真名: ${realName || '(未拿到)'}`);
      console.log(`   规则: 风险${rules.riskLevel || '?'}, 到账T+${rules.arrivalDays || '?'}, 截止${rules.cutoffTime || '?'}`);
    } catch (e) {
      console.log(`   详情页失败: ${e.message}`);
    }

    // ③ 读数据库最新净值日期
    const { data: latestRow } = await supabase
      .from('nav_history')
      .select('nav_date')
      .eq('product_id', p.dbId)
      .order('nav_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastNavDate = latestRow?.nav_date || '1970-01-01';
    console.log(`   数据库最新: ${lastNavDate}`);

    // ④ 翻页抓历史
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

      const newRows = list
        .filter(x => x.date > lastNavDate)
        .map(x => ({
          product_id: p.dbId,
          nav_date: x.date,
          unit_nav: parseFloat(x.unitNetValue),
          accum_nav: parseFloat(x.totalNetValue),
        }));
      allRows.push(...newRows);

      const hasOld = list.some(x => x.date <= lastNavDate);
      if (hasOld) {
        console.log(`   翻到已知区域，停止翻页`);
        break;
      }

      if (list.length < 30) break;
      const next = reqY1?.yNavDat;
      if (!next || next === yNavDat) break;

      yNavDat = next;
      round++;
      await page.waitForTimeout(800);
    }

    // ⑤ 名字更新（独立跑，即使无新数据也更新）
    if (realName) {
      const { data: cur } = await supabase
        .from('products').select('name').eq('id', p.dbId).single();
      if (cur?.name?.startsWith('招行产品')) {
        await supabase.from('products').update({ name: realName }).eq('id', p.dbId);
        console.log(`   名字已更新: ${realName}`);
      }
    }

    // ⑥ 规则更新（独立跑，即使无新数据也更新）
    const ruleUpdates = {
      redeem_arrival_days: rules.arrivalDays,
      redeem_confirm_days: 1,
      redeem_cutoff_time: rules.cutoffTime,
      risk_level: rules.riskLevel,
    };
    await supabase.from('products').update(ruleUpdates).eq('id', p.dbId);

    // ⑦ 无新数据 → 跳过 nav 写入
    if (allRows.length === 0) {
      console.log(`   ✅ 无新数据（已是最新 ${lastNavDate}）\n`);
      await page.waitForTimeout(500);
      continue;
    }

    console.log(`   拿到 ${allRows.length} 条新净值（${round + 1} 页）`);
    console.log(`   最新: ${latest.unitNetValue} @ ${latest.date}`);

    // ⑧ 批量写入 nav_history
    const { error } = await supabase.from('nav_history').upsert(allRows, {
      onConflict: 'product_id,nav_date',
    });
    if (error) { console.log(`   ❌ upsert 失败: ${error.message}\n`); continue; }
    totalUpserted += allRows.length;

    // ⑨ 更新 products 最新净值
    const updates = {
      unit_nav: parseFloat(latest.unitNetValue),
      nav_date: latest.date,
      bank_code: p.ripInn,
    };
    const chg = parseFloat(latest.netValueChange);
    if (isFinite(chg)) updates.daily_return = chg;

    await supabase.from('products').update(updates).eq('id', p.dbId);

    console.log(`   ✅ 写入 ${allRows.length} 条\n`);

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