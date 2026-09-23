import https from 'https';
import crypto from 'crypto';

const BASE_URL = 'https://www.psbc-wm.com';
const API_PATH = '/pswm-api';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Referer': 'https://www.psbc-wm.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

// ★ 关键：完整 SSL 降级配置
const agent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: false,
  minVersion: 'TLSv1',
  maxVersion: 'TLSv1.3',
  ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions:
    0x4 |                              // SSL_OP_LEGACY_SERVER_CONNECT
    crypto.constants.SSL_OP_NO_SSLv2 | // 关掉 SSLv2
    crypto.constants.SSL_OP_NO_SSLv3,  // 关掉 SSLv3
});

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: HEADERS,
      agent,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function apiGet(path, params = {}) {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  console.log(`\n🌐 GET ${url.toString()}`);

  try {
    const { status, body } = await httpsGet(url.toString());
    console.log(`  📡 HTTP ${status}`);

    if (status < 200 || status >= 300) {
      console.log(`  ❌ ${body.slice(0, 200)}`);
      return null;
    }

    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      console.log(`  ❌ 不是 JSON: ${body.slice(0, 200)}`);
      return null;
    }

    if (json.state !== 'ok') {
      console.log(`  ⚠️ state=${json.state} msg=${json.msg}`);
    }
    return json;
  } catch (e) {
    console.log(`  ❌ 请求失败: ${e.message}`);
    if (e.code) console.log(`     code: ${e.code}`);
    return null;
  }
}

console.log('═══════════════════════════════════');
console.log('测试 1：搜索产品');
console.log('═══════════════════════════════════');

const searchRes = await apiGet(`${API_PATH}/product/search`, {
  keywords: '鸿运日开22号',
  pageSize: 5,
  pageNum: 1,
});

if (searchRes) {
  const list = searchRes.data?.list || [];
  console.log(`  ✅ 找到 ${list.length} 个产品`);
  list.slice(0, 3).forEach((p, i) => {
    console.log(`\n  [${i + 1}] ${p.wp_name || p.product_name || '?'}`);
    console.log(`      wp_code: ${p.wp_code || '?'}`);
    console.log(`      净值: ${p.nav || '?'} | 净值日: ${p.nav_date || '?'}`);
  });
  if (list[0]) {
    console.log(`\n  📄 第一个产品完整字段：`);
    console.log(JSON.stringify(list[0], null, 2).slice(0, 1000));
  }
}

console.log('\n🏁 测试结束');