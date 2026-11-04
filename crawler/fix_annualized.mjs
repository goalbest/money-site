import https from 'https';
import dns from 'dns';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 强制 Node.js 优先使用 IPv4，解决 Windows 下 IPv6 不通导致的秒断
dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ... (保留原来的 loadEnv 代码不变) ...
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
    }
  }
})();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ 缺少环境变量'); process.exit(1); }

// 复用 Agent，保持连接活跃，防止被 Supabase 网关切断
const agent = new https.Agent({ 
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 2,
});

function httpsRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method,
      agent: agent, // 使用保活 Agent
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        'Connection': 'keep-alive'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : null); }
          catch (e) { resolve(data); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ... (保留原来的 calcAnnualized 函数不变) ...
function calcAnnualized(navs, periodMonths) {
  if (!navs || navs.length < 2) return 0;
  const sorted = [...navs].sort((a, b) => new Date(a.nav_date).getTime() - new Date(b.nav_date).getTime());
  const latest = sorted[sorted.length - 1];
  const latestDate = new Date(latest.nav_date);
  let targetDate = new Date(latestDate);
  targetDate.setMonth(targetDate.getMonth() - periodMonths);

  let closestNav = sorted[0];
  let minDiff = Infinity;
  for (const item of sorted) {
    const diff = Math.abs(new Date(item.nav_date).getTime() - targetDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closestNav = item;
    }
  }
  const actualDays = Math.max(1, (latestDate.getTime() - new Date(closestNav.nav_date).getTime()) / 86400000);
  const returnRate = (Number(latest.unit_nav) / Number(closestNav.unit_nav)) - 1;
  return (returnRate / actualDays) * 365 * 100;
}

async function run() {
  console.log('正在读取产品列表...');
  // 加上 select 避免拉取过多无用数据，减少超时概率
  const products = await httpsRequest(`${SUPABASE_URL}/rest/v1/products?select=id,name`);
  console.log(`✅ 读取到 ${products.length} 个产品，开始修复...\n`);

  let updatedCount = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    process.stdout.write(`[${i+1}/${products.length}] ${p.name} ... `);

    try {
      // 限制每次拉取的数量，避免单次请求体过大导致 ECONNRESET
      const navs = await httpsRequest(`${SUPABASE_URL}/rest/v1/nav_history?product_id=eq.${p.id}&select=nav_date,unit_nav&order=nav_date.asc&limit=500`);
      
      if (!navs || navs.length < 2) {
        console.log(`⚠️ 净值数据不足，跳过`);
        continue;
      }

      const annual_1m = calcAnnualized(navs, 1);
      const annual_3m = calcAnnualized(navs, 3);
      const annual_6m = calcAnnualized(navs, 6);
      const annual_1y = calcAnnualized(navs, 12);
      
      let annual_7d = 0;
      const latest = new Date(navs[navs.length - 1].nav_date);
      let target = new Date(latest); target.setDate(target.getDate() - 7);
      let closest = navs[0], minDiff = Infinity;
      for (const n of navs) {
        const diff = Math.abs(new Date(n.nav_date).getTime() - target.getTime());
        if (diff < minDiff) { minDiff = diff; closest = n; }
      }
      const days7 = Math.max(1, (latest.getTime() - new Date(closest.nav_date).getTime()) / 86400000);
      if (days7 >= 5 && days7 <= 10) {
        annual_7d = (((Number(navs[navs.length - 1].unit_nav) / Number(closest.unit_nav)) - 1) / days7) * 365 * 100;
      }

      const updates = {
        annual_7d_yield: Number(annual_7d.toFixed(4)),
        annualized_1m: Number(annual_1m.toFixed(4)),
        annual_3m_yield: Number(annual_3m.toFixed(4)),
        annual_6m_yield: Number(annual_6m.toFixed(4)),
        annual_1y_yield: Number(annual_1y.toFixed(4)),
      };

      await httpsRequest(`${SUPABASE_URL}/rest/v1/products?id=eq.${p.id}`, 'PATCH', updates);
      console.log(`✅ 1月: ${annual_1m.toFixed(2)}% | 3月: ${annual_3m.toFixed(2)}%`);
      updatedCount++;
      
      // 稍微等久一点，让连接池有时间回收
      await sleep(500);

    } catch (err) {
      console.log(`❌ 失败: ${err.message}`);
      // 失败了多等一秒，防止频繁重试被封
      await sleep(1500);
    }
  }

  console.log(`\n🎉 完成！共修复 ${updatedCount} 个产品的年化数据。`);
}

run();