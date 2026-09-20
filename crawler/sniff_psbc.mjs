import { chromium } from 'playwright';
import fs from 'fs';

const TARGET_URL = 'https://www.psbc-wm.com/products/index.html';
const OUTPUT_FILE = 'psbc_api.json';
const WAIT_MS = 15000;

const captured = [];

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});

const page = await context.newPage();

await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

page.on('request', (req) => {
  const type = req.resourceType();
  if (type !== 'xhr' && type !== 'fetch') return;

  const entry = {
    url: req.url(),
    method: req.method(),
    headers: req.headers(),
    postData: req.postData(),
    response: null,
    status: null,
  };
  captured.push(entry);
  console.log(`📡 [${captured.length}] ${entry.method} ${entry.url.slice(0, 100)}`);

  req.response().then(async (res) => {
    if (!res) return;
    entry.status = res.status();
    try {
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('json')) {
        entry.response = await res.json();
      } else {
        entry.response = (await res.text()).slice(0, 3000);
      }
    } catch (e) {
      entry.response = '(parse failed)';
    }
  }).catch(() => {});
});

console.log(`\n🌐 打开: ${TARGET_URL}`);
try {
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('✅ 页面 DOM 加载完成');
} catch (e) {
  console.log('⚠️ 加载超时:', e.message);
}

console.log(`⏳ 等 ${WAIT_MS / 1000} 秒抓请求...`);
await new Promise(r => setTimeout(r, WAIT_MS));
await new Promise(r => setTimeout(r, 3000));

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(captured, null, 2));
console.log(`\n🎉 共捕获 ${captured.length} 个 XHR 请求`);
console.log(`💾 已保存到 ${OUTPUT_FILE}`);

console.log('\n===== 请求摘要 =====');
captured.forEach((c, i) => {
  console.log(`\n[${i + 1}] ${c.method} ${c.url}`);
  console.log(`    状态: ${c.status}`);
  if (c.postData) console.log(`    Payload: ${String(c.postData).slice(0, 150)}`);
  if (c.response && typeof c.response === 'object') {
    const keys = Object.keys(c.response).slice(0, 10);
    console.log(`    响应字段: ${keys.join(', ')}`);
  }
});

console.log('\n⏸️  浏览器保持打开 30 秒');
await new Promise(r => setTimeout(r, 30000));
await browser.close();