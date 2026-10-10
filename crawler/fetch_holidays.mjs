// crawler/fetch_holidays.mjs
// 每年自动更新节假日数据

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

// 抓取年份（默认今年 + 明年）
const years = [
  new Date().getFullYear(),
  new Date().getFullYear() + 1,
];

console.log('═══════════════════════════════');
console.log('节假日数据更新');
console.log('═══════════════════════════════\n');

let totalUpserted = 0;

for (const year of years) {
  console.log(`→ 抓取 ${year} 年节假日...`);
  try {
    const r = await fetch(`https://timor.tech/api/holiday/year/${year}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!r.ok) {
      console.log(`   ❌ HTTP ${r.status}`);
      continue;
    }
    const data = await r.json();
    if (data.code !== 0 || !data.holiday) {
      console.log(`   ⚠️ API 返回: ${data.code} ${data.msg || ''}`);
      continue;
    }

    const rows = Object.values(data.holiday).map((h) => ({
      date: h.date,
      is_holiday: h.holiday,
      name: h.name || null,
      year,
    }));

    console.log(`   拿到 ${rows.length} 条`);

    // 清理当年旧数据，重新写入
    await supabase.from('holidays').delete().eq('year', year);

    // 批量插入
    const { error } = await supabase.from('holidays').insert(rows);
    if (error) {
      console.log(`   ❌ 写入失败: ${error.message}`);
      continue;
    }
    totalUpserted += rows.length;
    console.log(`   ✅ 写入 ${rows.length} 条\n`);
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}\n`);
  }
}

console.log(`🎉 完成，共写入 ${totalUpserted} 条`);