import https from 'https';
import crypto from 'crypto';

const AGENT = new https.Agent({
  rejectUnauthorized: false,
  minVersion: 'TLSv1',
  ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4,
});

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Referer': 'https://www.psbc.com/cn/grfw/tzlc/lc/lccpxx/',
      },
      agent: AGENT,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(new URL(res.headers.location, url).toString()));
      }
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.end();
  });
}

const html = await get('https://www.psbc.com/cn/grfw/tzlc/lc/lccpxx/');
console.log('拿到字节数:', html.length);
console.log('--- 前 300 字符 ---');
console.log(html.slice(0, 300));

const links = [...html.matchAll(/href=["']([^"']*t\d{8}_\d+\.html)["']/g)];
console.log('\n找到详情链接:', links.length);
links.slice(0, 5).forEach(m => console.log('  ', m[1]));
// ============ 追加：抓第一条详情并解析 ============
if (links.length > 0) {
  const url = new URL(links[0][1], 'https://www.psbc.com/cn/grfw/tzlc/lc/lccpxx/').toString();
  console.log('\n=== 测试详情页 ===\n', url);
  const detail = await get(url);

  const t = detail
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  // 打印正文片段，方便看真实格式
  const idx = t.indexOf('非保本');
  console.log('--- 正文片段（非保本附近 500 字）---');
  console.log(idx >= 0 ? t.slice(Math.max(0, idx - 200), idx + 300) : t.slice(0, 800));

  console.log('\n--- 正则匹配 ---');
  const code = t.match(/([A-Z0-9]{9,15})\s*非保本/);
  const nav  = t.match(/([0-9]+\.[0-9]{2,4})\s*当前净值/);
  const date = t.match(/(\d{4}-\d{2}-\d{2})\s*净值日期/);
  console.log('code   :', code?.[1]);
  console.log('nav    :', nav?.[1]);
  console.log('navDate:', date?.[1]);
}