// crawler/fetch_holidays.mjs
// 节假日数据更新（从 NateScarlet/holiday-cn 抓取）

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// 数据源（优先 GitHub raw，备选 jsDelivr）
const SOURCES = [
  (y) => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${y}.json`,
  (y) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  (y) => `https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
];

const years = [
  new Date().getFullYear(),
  new Date().getFullYear() + 1,
];

console.log('═══════════════════════════════');
console.log('节假日数据更新');
console.log('═══════════════════════════════\n');

async function fetchYearData(year) {
  for (const build of SOURCES) {
    const url = build(year);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; money-site-bot/1.0)' },
      });
      if (r.ok) {
        const data = await r.json();
        return { data, url };
      }
    } catch (e) {
      // 试下一个源
    }
  }
  return null;
}

let totalUpserted = 0;

for (const year of years) {
  console.log(`→ 抓取 ${year} 年节假日...`);
  const result = await fetchYearData(year);

  if (!result) {
    console.log(`   ❌ 所有源都失败\n`);
    continue;
  }

  const { data, url } = result;
  console.log(`   来源: ${url}`);

  const days = data.days || [];
  if (days.length === 0) {
    console.log(`   ⚠️ 数据为空（可能该年份尚未发布）\n`);
    continue;
  }

  const rows = days.map((d) => ({
    date: d.date,
    is_holiday: d.isOffDay === true,
    name: d.name || null,
    year,
  }));

  console.log(`   拿到 ${rows.length} 条`);

  // 删除旧数据
  await supabase.from('holidays').delete().eq('year', year);

  // 批量插入
  const { error } = await supabase.from('holidays').insert(rows);
  if (error) {
    console.log(`   ❌ 写入失败: ${error.message}\n`);
    continue;
  }
  totalUpserted += rows.length;
  console.log(`   ✅ 写入 ${rows.length} 条\n`);
}

console.log(`🎉 完成，共写入 ${totalUpserted} 条`);