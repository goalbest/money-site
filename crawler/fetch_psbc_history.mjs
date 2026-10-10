// crawler/fetch_psbc_history.mjs
// 一次性补全邮储/中邮产品的全部历史净值

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import crypto from 'crypto';
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

const AGENT = new https.Agent({
  rejectUnauthorized: false, minVersion: 'TLSv1', ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3,
});

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  'Referer': 'https://www.psbc-wm.com/',
  'Accept': 'application/json, text/plain, */*',
};

const BASE = 'https://www.psbc-wm.com';
const API = '/pswm-api';

function getJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'GET', headers: HEADERS, agent: AGENT,
    }, res => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error(`不是 JSON: ${d.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function search(keyword) {
  const u = new URL(BASE + API + '/product/search');
  u.searchParams.set('keywords', keyword);
  u.searchParams.set('pageSize', '10');
  u.searchParams.set('pageNum', '1');
  return await getJson(u.toString());
}

async function nvlist(wpCode, pageNum) {
  const u = new URL(BASE + API + '/product/nvlist');
  u.searchParams.set('wp_code', wpCode);
  u.searchParams.set('pageSize', '10');
  u.searchParams.set('pageNum', String(pageNum));
  return await getJson(u.toString());
}

function fmtDate(d) {
  const s = String(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ══════════════ 主流程 ══════════════
console.log('═══════════════════════════════');
console.log('邮储/中邮历史净值补全');
console.log('═══════════════════════════════\n');

const { data: prods, error } = await supabase
  .from('products')
  .select('id, name, bank, bank_code')
  .eq('bank', '中邮理财')
  .not('bank_code', 'is', null)
  .order('id');

if (error) { console.error('❌ 读 products 失败:', error.message); process.exit(1); }
console.log(`读到 ${prods.length} 个产品\n`);
if (prods.length === 0) { console.log('无产品，退出'); process.exit(0); }

const t0 = Date.now();
let totalUpserted = 0;
let doneCount = 0;

for (const p of prods) {
  console.log(`→ [${p.id}] ${p.name}`);
  console.log(`   bank_code: ${p.bank_code}`);

  try {
    // ① 搜索拿 wp_code（一般等于 bank_code，但不保证）
    const s = await search(p.bank_code);
    const hit = (s.data?.list || []).find(x => x.wp_code === p.bank_code);

    if (!hit) {
      console.log(`   ⚠️ 搜不到，跳过\n`);
      continue;
    }
    const wpCode = hit.wp_code;
    console.log(`   命中: ${hit.wp_name}`);

    // ② 读数据库里该产品的最新日期
    const { data: latestRow } = await supabase
      .from('nav_history')
      .select('nav_date')
      .eq('product_id', p.id)
      .order('nav_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastNavDate = latestRow?.nav_date || '1970-01-01';
    console.log(`   数据库最新: ${lastNavDate}`);

    // ③ 抓第 1 页（探针）
    const first = await nvlist(wpCode, 1);
    const totalPage = first.data?.totalPage || 0;
    const totalRow = first.data?.totalRow || 0;
    console.log(`   共 ${totalRow} 条 / ${totalPage} 页`);

    if (totalPage === 0) { console.log('   ⚠️ 无历史\n'); continue; }

    // ③ 翻页抓（增量：遇到旧数据就停）
    const allRows = [];
    for (let page = 1; page <= totalPage; page++) {
      const res = page === 1 ? first : await nvlist(wpCode, page);
      const list = res.data?.list || [];
      if (list.length === 0) break;

      let hitOld = false;
      for (const x of list) {
        const navDate = fmtDate(x.update_date);
        if (navDate <= lastNavDate) { hitOld = true; break; }  // 遇到旧数据停
        const nav = parseFloat(x.nav);
        const accum = parseFloat(x.accumulative_nav);
        if (!isFinite(nav) || nav <= 0) continue;
        allRows.push({
          product_id: p.id,
          nav_date: navDate,
          unit_nav: nav,
          accum_nav: isFinite(accum) ? accum : null,
        });
      }

      if (hitOld) {
        console.log(`     翻到已知区域（${list[0].update_date}），停止`);
        break;
      }
      if (page % 10 === 0 || page === totalPage) {
        console.log(`     页 ${page}/${totalPage} → 累计 ${allRows.length}`);
      }
      await sleep(300);
    }

    // ④ 批量 upsert（每批 30，避免 stack depth 限制）
    let ok = 0;
    for (let i = 0; i < allRows.length; i += 30) {
      const batch = allRows.slice(i, i + 30);
      const { error: upErr } = await supabase
        .from('nav_history')
        .upsert(batch, { onConflict: 'product_id,nav_date' });
      if (upErr) {
        console.log(`     ⚠️ 批次失败: ${upErr.message}`);
      } else {
        ok += batch.length;
      }
      await sleep(100);
    }
    totalUpserted += ok;

    // ⑤ 更新 products 最新净值
    // allRows[0] 是最新（第 1 页第 1 条）
    if (allRows.length > 0) {
      const latest = allRows[0];
      await supabase.from('products').update({
        unit_nav: latest.unit_nav,
        nav_date: latest.nav_date,
      }).eq('id', p.id);
    }

    console.log(`   ✅ 写入 ${ok} 条\n`);
    doneCount++;

  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}\n`);
  }

  await sleep(500);
}

console.log(`═══════════════════════════════`);
console.log(`🎉 完成: 成功 ${doneCount}/${prods.length}，共写入 ${totalUpserted} 条`);
console.log(`   总耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`);