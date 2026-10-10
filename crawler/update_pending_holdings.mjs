// crawler/update_pending_holdings.mjs
// 每天检查在途持仓，确认日后自动切换状态

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

console.log('═══════════════════════════════');
console.log('在途持仓状态切换');
console.log('═══════════════════════════════\n');

const today = new Date().toISOString().slice(0, 10);
console.log(`今天: ${today}\n`);

// ① pending_buy → active
console.log('→ 检查 pending_buy...');
const { data: pendingBuys, error: err1 } = await supabase
  .from('user_holdings')
  .select('id, product_id, holding_amount')
  .eq('status', 'pending_buy')
  .lte('confirm_date', today);

if (err1) {
  console.error('❌ 查询失败:', err1.message);
} else if (!pendingBuys || pendingBuys.length === 0) {
  console.log('   无待确认买入\n');
} else {
  console.log(`   找到 ${pendingBuys.length} 条待确认`);
  const ids = pendingBuys.map(h => h.id);
  const { error } = await supabase
    .from('user_holdings')
    .update({ status: 'active', confirm_date: null })
    .in('id', ids);
  if (error) {
    console.error('   ❌ 更新失败:', error.message);
  } else {
    console.log(`   ✅ ${ids.length} 条 pending_buy → active\n`);
  }
}

// ② pending_sell → closed
console.log('→ 检查 pending_sell...');
const { data: pendingSells, error: err2 } = await supabase
  .from('user_holdings')
  .select('id, product_id, closed_amount')
  .eq('status', 'pending_sell')
  .lte('confirm_date', today);

if (err2) {
  console.error('❌ 查询失败:', err2.message);
} else if (!pendingSells || pendingSells.length === 0) {
  console.log('   无待确认赎回\n');
} else {
  console.log(`   找到 ${pendingSells.length} 条待确认`);
  for (const h of pendingSells) {
    const { error } = await supabase
      .from('user_holdings')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_amount: h.closed_amount ?? 0,
        confirm_date: null,
      })
      .eq('id', h.id);
    if (error) console.log(`   ⚠️ ${h.id} 失败: ${error.message}`);
  }
  console.log(`   ✅ ${pendingSells.length} 条 pending_sell → closed\n`);
}

console.log('🎉 完成');