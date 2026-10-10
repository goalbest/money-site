// crawler/fetch_psbc_rules.mjs
// 用 wap.psbc.com 分享页抓中邮产品规则

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
console.log('中邮产品规则抓取（wap.psbc.com）');
console.log('═══════════════════════════════\n');

// ── 读所有中邮产品 ──
const { data: prods, error } = await supabase
  .from('products')
  .select('id, name, bank_code')
  .eq('bank', '中邮理财')
  .not('bank_code', 'is', null)
  .order('id');

if (error) { console.error('❌ 读取失败:', error.message); process.exit(1); }
console.log(`读到 ${prods.length} 个产品\n`);
if (prods.length === 0) { console.log('无产品，退出'); process.exit(0); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  locale: 'zh-CN',
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

// 从页面文本解析规则
function parseRules(text) {
  let riskLevel = null, arrivalDays = null, cutoffTime = null;

  // 风险等级（PR2 / R2）
  const riskM = text.match(/(?:P?R)(\d)/i);
  if (riskM) riskLevel = `R${riskM[1]}`;

  // 到账："后N个工作日内" / "T+N" / "T+N日内"
  const arrPatterns = [
    /后\s*(\d+)\s*个工作日内/,
    /(\d+)\s*个工作日内到账/,
    /T\+?(\d+)\s*(?:个?交易日?)?到账/,
    /T\+?(\d+)\s*内/,
  ];
  for (const re of arrPatterns) {
    const m = text.match(re);
    if (m) { arrivalDays = parseInt(m[1], 10); break; }
  }

  // 截止时间："0:00-17:00" → 取结束时间
  const rangeM = text.match(/(\d{1,2}):(\d{2})\s*[-~到]\s*(\d{1,2}):(\d{2})/);
  if (rangeM) {
    cutoffTime = `${rangeM[3].padStart(2, '0')}:${rangeM[4]}`;
  } else {
    const cutM = text.match(/(\d{1,2}):(\d{2})\s*(?:前|之前)/);
    if (cutM) cutoffTime = `${cutM[1].padStart(2, '0')}:${cutM[2]}`;
  }

  return { riskLevel, arrivalDays, cutoffTime };
}

let ok = 0, failed = 0;

for (let i = 0; i < prods.length; i++) {
  const p = prods[i];
  console.log(`→ [${i+1}/${prods.length}] ${p.name}`);
  console.log(`   ${p.bank_code}`);

  try {
    const url = `https://wap.psbc.com/wxbank/h5/weChatShare/#/?pageId=1040&productId=${p.bank_code}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);

    const pageText = await page.evaluate(() => document.body.innerText);
    const rules = parseRules(pageText);

    console.log(`   规则: 风险${rules.riskLevel || '?'}, 到账T+${rules.arrivalDays || '?'}, 截止${rules.cutoffTime || '?'}`);

    // 调试：打印含"到账"或"赎回"的行
    const relevant = pageText.split('\n').map(l => l.trim())
      .filter(l => (l.includes('到账') || l.includes('赎回') || l.includes('风险')) && l.length < 150)
      .slice(0, 5);
    relevant.forEach(l => console.log(`     "${l}"`));

    await supabase.from('products').update({
      risk_level: rules.riskLevel,
      redeem_arrival_days: rules.arrivalDays,
      redeem_confirm_days: 1,
      redeem_cutoff_time: rules.cutoffTime,
    }).eq('id', p.id);

    ok++;
    await page.waitForTimeout(800);
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}`);
    failed++;
  }
}

await browser.close();
console.log(`\n🎉 完成: 成功 ${ok}, 失败 ${failed}`);