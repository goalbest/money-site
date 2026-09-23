import https from 'https';
import crypto from 'crypto';

const PSBC_BASE = 'https://www.psbc-wm.com';
const PSBC_API = '/pswm-api';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Referer': 'https://www.psbc-wm.com/',
  'Accept': 'application/json, text/plain, */*',
};

const AGENT = new https.Agent({
  rejectUnauthorized: false,
  minVersion: 'TLSv1',
  maxVersion: 'TLSv1.3',
  ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4,
});

function httpsGetJson(fullUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET', headers: HEADERS, agent: AGENT,
    }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function search(keywords) {
  const url = new URL(PSBC_BASE + PSBC_API + '/product/search');
  url.searchParams.set('keywords', keywords);
  url.searchParams.set('pageSize', '30');
  url.searchParams.set('pageNum', '1');
  try {
    const json = await httpsGetJson(url.toString());
    const list = json.data?.list || [];
    console.log(`\n🔍 "${keywords}" → ${list.length} 结果`);
    list.slice(0, 8).forEach((p, i) => {
      console.log(`  [${i + 1}] ${p.wp_name} | ${p.wp_registration_code}`);
    });
    return list;
  } catch (e) {
    console.log(`\n🔍 "${keywords}" → 出错 ${e.message.slice(0, 50)}`);
    return [];
  }
}

console.log('═══════════════════════════════════');
console.log('目标产品：优盛·鸿锦最短持有7天6号ESG优选B');
console.log('═══════════════════════════════════');

const keywords = [
  '优盛·鸿锦最短持有7天6号ESG优选B',
  '优盛鸿锦最短持有7天6号ESG优选B',
  '优盛 鸿锦 6号',
  '优盛',
  '鸿锦',
  'ESG优选',
  'ESG',
  '优盛鸿锦',
  '优盛鸿锦6号',
  '鸿锦6号',
];

for (const kw of keywords) {
  await search(kw);
  await new Promise(r => setTimeout(r, 600));
}

console.log('\n🏁 测试结束');