import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('https://xinxipilu.chinawealth.com.cn/queryMenu/prodType', {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await new Promise(r => setTimeout(r, 5000));

console.log('\n=== 查找所有含"下一页"的元素 ===');
const all = await page.locator(':has-text("下一页")').all();
for (const el of all) {
  const tag = await el.evaluate(n => n.tagName);
  const cls = await el.evaluate(n => n.className);
  const text = await el.evaluate(n => n.textContent?.trim());
  console.log(`标签: ${tag}, class: "${cls}", 文本: "${text?.slice(0, 20)}"`);
}

console.log('\n=== 查找所有 btn-next ===');
const btns = await page.locator('.btn-next, button.btn-next, [class*="next"]').all();
for (const el of btns) {
  const tag = await el.evaluate(n => n.tagName);
  const cls = await el.evaluate(n => n.className);
  const text = await el.evaluate(n => n.textContent?.trim());
  const disabled = await el.evaluate(n => n.disabled);
  console.log(`标签: ${tag}, class: "${cls}", 文本: "${text?.slice(0, 20)}", disabled: ${disabled}`);
}

console.log('\n=== 查找分页容器 ===');
const pg = await page.locator('.el-pagination, [class*="pagination"]').all();
for (const el of pg) {
  const cls = await el.evaluate(n => n.className);
  const html = await el.evaluate(n => n.outerHTML.slice(0, 500));
  console.log(`class: "${cls}"\nHTML: ${html}\n---`);
}

console.log('\n=== 诊断完成，浏览器保持打开 30 秒 ===');
await new Promise(r => setTimeout(r, 30000));
await browser.close();