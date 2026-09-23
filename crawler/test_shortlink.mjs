import https from 'https';
import crypto from 'crypto';
import { writeFileSync } from 'fs';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

const AGENT = new https.Agent({
  rejectUnauthorized: false,
  minVersion: 'TLSv1', maxVersion: 'TLSv1.3',
  ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3,
});

function httpsGet(fullUrl, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 10) return resolve({ status: 0, body: '', url: fullUrl, redirects: depth });
    const u = new URL(fullUrl);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET', headers: HEADERS, agent: AGENT,
    }, (res) => {
      console.log(`  [${depth}] HTTP ${res.statusCode} ${fullUrl}`);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let next;
        if (res.headers.location.startsWith('http')) next = res.headers.location;
        else if (res.headers.location.startsWith('/')) next = `https://${u.hostname}${res.headers.location}`;
        else next = new URL(res.headers.location, fullUrl).toString();
        console.log(`       ↪️ ${next}`);
        resolve(httpsGet(next, depth + 1));
        return;
      }
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, url: fullUrl, redirects: depth }));
    });
    req.on('error', reject);
    req.end();
  });
}

const SHORT_URL = 'https://u.psbc.com/1sCzDo';

console.log('═══════════════════════════════════');
console.log(`测试短链接: ${SHORT_URL}`);
console.log('═══════════════════════════════════\n');

try {
  const result = await httpsGet(SHORT_URL);
  console.log(`\n📡 最终 HTTP ${result.status}`);
  console.log(`📍 最终 URL: ${result.url}`);
  console.log(`📄 HTML 长度: ${result.body.length}`);
  console.log(`🔄 重定向次数: ${result.redirects}`);

  // 保存 HTML
  writeFileSync('shortlink_result.html', result.body);
  console.log(`\n💾 HTML 已保存到 shortlink_result.html`);

  // 看 HTML 里有什么
  const cleanText = result.body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  console.log('\n═══════════════════════════════════');
  console.log('页面文本前 800 字');
  console.log('═══════════════════════════════════\n');
  console.log(cleanText.slice(0, 800));

  console.log('\n═══════════════════════════════════');
  console.log('关键词搜索');
  console.log('═══════════════════════════════════\n');

  ['当前净值', '净值日期', '非保本', '2401NB006B', '下载', 'App', '微信'].forEach(kw => {
    const idx = cleanText.indexOf(kw);
    if (idx >= 0) {
      console.log(`✅ "${kw}" 找到`);
      console.log(`   上下文: ${cleanText.slice(Math.max(0, idx - 60), idx + 100)}`);
    } else {
      console.log(`❌ "${kw}" 未找到`);
    }
  });

  console.log('\n═══════════════════════════════════');
  console.log('HTML 中所有 <a> 链接');
  console.log('═══════════════════════════════════\n');
  const links = result.body.match(/href=["']([^"']+)["']/gi) || [];
  const unique = Array.from(new Set(links)).slice(0, 20);
  unique.forEach((l, i) => console.log(`  [${i + 1}] ${l}`));
} catch (e) {
  console.log(`\n❌ 出错: ${e.message}`);
}

console.log('\n🏁 测试结束');