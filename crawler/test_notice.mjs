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

function httpsGetText(fullUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET', headers: HEADERS, agent: AGENT,
    }, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://${u.hostname}${res.headers.location}`;
        console.log(`  ↪️ 重定向到 ${next}`);
        resolve(httpsGetText(next));
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

const NOTICE_URL = 'https://www.psbc.com/cn/grfw/tzlc/lc/lccpxx/202412/t20241227_279705.html';

console.log('═══════════════════════════════════');
console.log(`🌐 打开: ${URL}`);
console.log('═══════════════════════════════════\n');

const { status, body } = await httpsGetText(NOTICE_URL);
console.log(`📡 HTTP ${status}`);
console.log(`📄 HTML 长度: ${body.length} 字\n`);

// 保存 HTML 供你查看
writeFileSync('notice_sample.html', body);
console.log(`💾 HTML 已保存到 crawler/notice_sample.html\n`);

// 提取表格
console.log('═══════════════════════════════════');
console.log('提取表格内容');
console.log('═══════════════════════════════════\n');

// 简单的 HTML 表格提取
const tableMatches = body.match(/<table[\s\S]*?<\/table>/gi) || [];
console.log(`找到 ${tableMatches.length} 个 <table>\n`);

tableMatches.slice(0, 3).forEach((table, idx) => {
  console.log(`\n──────── 表格 ${idx + 1} ────────`);
  // 提取单元格
  const cells = table.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
  const clean = cells.map(c =>
    c.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  );
  // 每 6 个一组（猜测列数），打印前 30 个
  clean.slice(0, 30).forEach((c, i) => {
    console.log(`  [${i}] ${c}`);
  });
});

// 找"净值"关键词
console.log('\n═══════════════════════════════════');
console.log('搜索"净值"相关文本');
console.log('═══════════════════════════════════\n');

const cleanBody = body.replace(/<script[\s\S]*?<\/script>/gi, '')
                      .replace(/<style[\s\S]*?<\/style>/gi, '')
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ');

// 找包含"净值"的句子
const navMatches = cleanBody.match(/[^。]{0,50}净值[^。]{0,80}/g) || [];
navMatches.slice(0, 10).forEach((s, i) => {
  console.log(`  [${i + 1}] ${s.trim()}`);
});

// 找产品代码 2401NB006B
console.log('\n═══════════════════════════════════');
console.log('搜索"2401NB006B"');
console.log('═══════════════════════════════════\n');
const codeIdx = cleanBody.indexOf('2401NB006B');
if (codeIdx >= 0) {
  console.log(`  ✅ 找到了！上下文：`);
  console.log(`  ${cleanBody.slice(Math.max(0, codeIdx - 200), codeIdx + 200)}`);
} else {
  console.log(`  ❌ 未找到 2401NB006B`);
}

// 找"1.0588"这个净值
console.log('\n═══════════════════════════════════');
console.log('搜索"1.0588"（从截图看到的净值）');
console.log('═══════════════════════════════════\n');
const navIdx = cleanBody.indexOf('1.0588');
if (navIdx >= 0) {
  console.log(`  ✅ 找到了！上下文：`);
  console.log(`  ${cleanBody.slice(Math.max(0, navIdx - 300), navIdx + 300)}`);
} else {
  console.log(`  ❌ 未找到 1.0588`);
}

console.log('\n🏁 测试结束');