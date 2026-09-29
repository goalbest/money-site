import https from 'https';
import crypto from 'crypto';

const AGENT = new https.Agent({
  rejectUnauthorized: false, minVersion: 'TLSv1',
  ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3,
});

function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('too many redirects'));
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      }, agent: AGENT,
    }, res => {
      console.log(`[${res.statusCode}] ${url}`);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        return resolve(get(next, depth + 1));
      }
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, url, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

const result = await get('https://u.psbc.com/4bQ4pk');
console.log('\n═══════════════════════════');
console.log('最终 URL:', result.url);
console.log('状态码:', result.status);
console.log('页面字节:', result.body.length);
console.log('\n--- 前 800 字 ---');
console.log(result.body.slice(0, 800));