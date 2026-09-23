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
  minVersion: 'TLSv1', maxVersion: 'TLSv1.3',
  ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4,
});

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
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

const WP_CODE = '2501AO022B';

// 测试 1：pageSize=10
console.log('═══════════════════════════════');
console.log('测试 1: pageSize=10, pageNum=1');
console.log('═══════════════════════════════');
let url = new URL(PSBC_BASE + PSBC_API + '/product/nvlist');
url.searchParams.set('wp_code', WP_CODE);
url.searchParams.set('pageSize', '10');
url.searchParams.set('pageNum', '1');
let json = await httpsGetJson(url.toString());
console.log(`返回条数: ${(json.data?.list || []).length}`);
console.log(`总数: ${json.data?.total || '?'}`);
console.log(`字段: ${Object.keys(json.data || {}).join(', ')}`);
console.log(`data 完整：${JSON.stringify(json.data, null, 2).slice(0, 800)}`);

// 测试 2：pageSize=500
console.log('\n═══════════════════════════════');
console.log('测试 2: pageSize=500, pageNum=1');
console.log('═══════════════════════════════');
url = new URL(PSBC_BASE + PSBC_API + '/product/nvlist');
url.searchParams.set('wp_code', WP_CODE);
url.searchParams.set('pageSize', '500');
url.searchParams.set('pageNum', '1');
json = await httpsGetJson(url.toString());
console.log(`返回条数: ${(json.data?.list || []).length}`);

// 测试 3：pageNum=2
console.log('\n═══════════════════════════════');
console.log('测试 3: pageSize=10, pageNum=2');
console.log('═══════════════════════════════');
url = new URL(PSBC_BASE + PSBC_API + '/product/nvlist');
url.searchParams.set('wp_code', WP_CODE);
url.searchParams.set('pageSize', '10');
url.searchParams.set('pageNum', '2');
json = await httpsGetJson(url.toString());
console.log(`返回条数: ${(json.data?.list || []).length}`);
if (json.data?.list?.[0]) {
  console.log(`第一条: ${json.data.list[0].update_date} 净值 ${json.data.list[0].nav}`);
}

// 测试 4：不同参数名
console.log('\n═══════════════════════════════');
console.log('测试 4: 试 page_size / size / limit');
console.log('═══════════════════════════════');
for (const param of ['page_size', 'size', 'limit', 'per_page', 'rows']) {
  url = new URL(PSBC_BASE + PSBC_API + '/product/nvlist');
  url.searchParams.set('wp_code', WP_CODE);
  url.searchParams.set(param, '100');
  url.searchParams.set('pageNum', '1');
  try {
    const j = await httpsGetJson(url.toString());
    const cnt = (j.data?.list || []).length;
    console.log(`  [${param}=100] 返回 ${cnt} 条`);
  } catch (e) {
    console.log(`  [${param}=100] 出错 ${e.message.slice(0, 50)}`);
  }
}

console.log('\n🏁 测试结束');