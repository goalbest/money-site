import https from 'https';
import crypto from 'crypto';
import { writeFileSync } from 'fs';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const AGENT = new https.Agent({
  rejectUnauthorized: false,
  minVersion: 'TLSv1', maxVersion: 'TLSv1.3',
  ciphers: 'DEFAULT@SECLEVEL=1',
  secureOptions: 0x4 | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3,
});

function httpsGetText(fullUrl, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return resolve({ status: 0, body: '' });
    const u = new URL(fullUrl);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET', headers: HEADERS, agent: AGENT,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://${u.hostname}${res.headers.location.startsWith('/') ? '' : '/'}${res.headers.location}`;
        console.log(`  ↪️ 重定向到 ${next}`);
        resolve(httpsGetText(next, depth + 1));
        return;
      }
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.end();
  });
}

// 候选列表页 URL
const CANDIDATES = [
  'https://www.psbc.com/cn/grfw/tzlc/lc/lccpxx/',
  'https://www.psbc.com/cn/grfw/tzlc/lc/lcsx/',
  'https://www.psbc.com/cn/grfw/tzlc/lc/',
];

for (const url of CANDIDATES) {
  console.log('\n═══════════════════════════════════');
  console.log(`🌐 测试: ${url}`);
  console.log('═══════════════════════════════════\n');

  try {
    const { status, body } = await httpsGetText(url);
    console.log(`📡 HTTP ${status}, HTML 长度 ${body.length}`);

    if (body.length < 500) {
      console.log('  ⚠️ 内容太短，可能 404');
      continue;
    }

    // 提取所有 .html 链接
    const htmlLinks = body.match(/href=["']([^"']*t20\d{6}_\d+\.html)["']/gi) || [];
    const cleanLinks = htmlLinks.map(h => {
      const m = h.match(/href=["']([^"']+)["']/i);
      if (!m) return null;
      let href = m[1];
      if (href.startsWith('http')) return href;
      if (href.startsWith('/')) return `https://www.psbc.com${href}`;
      return `https://www.psbc.com/cn/grfw/tzlc/lc/lccpxx/${href}`;
    }).filter(Boolean);

    const uniqueLinks = Array.from(new Set(cleanLinks));
    console.log(`  🔗 找到 ${uniqueLinks.length} 个公告链接`);
    uniqueLinks.slice(0, 10).forEach((l, i) => console.log(`     [${i + 1}] ${l}`));

    // 保存本页 HTML 供分析
    const fileName = `list_${url.split('/').slice(-2).join('_')}.html`;
    writeFileSync(fileName, body);
    console.log(`  💾 已保存: ${fileName}`);

    // 找分页链接
    const paginationLinks = body.match(/href=["']([^"']*(?:page|index_)\d*[^"']*)["']/gi) || [];
    if (paginationLinks.length > 0) {
      console.log(`  📄 找到 ${paginationLinks.length} 个分页相关链接`);
    }
  } catch (e) {
    console.log(`  ❌ 出错: ${e.message}`);
  }

  await new Promise(r => setTimeout(r, 1000));
}

console.log('\n🏁 测试结束');