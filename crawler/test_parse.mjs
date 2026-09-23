import { readFileSync, existsSync } from 'fs';

if (!existsSync('notice_sample.html')) {
  console.log('❌ 找不到 notice_sample.html，请先跑 test_notice.mjs');
  process.exit(1);
}

const html = readFileSync('notice_sample.html', 'utf-8');

// 转纯文本
const cleanText = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ');

console.log('═══════════════════════════════════');
console.log('从 HTML 提取产品信息');
console.log('═══════════════════════════════════\n');

// 产品代码
const codeMatch = cleanText.match(/([A-Z0-9]{9,15})\s*非保本/);
console.log(`产品代码: ${codeMatch ? codeMatch[1] : '未找到'}`);

// 产品名
const nameMatch = cleanText.match(/([^\s]{5,30})\s+[A-Z0-9]{9,15}\s*非保本/);
console.log(`产品名: ${nameMatch ? nameMatch[1] : '未找到'}`);

// 当前净值
const navMatch = cleanText.match(/([0-9]+\.[0-9]{4})\s*当前净值/);
console.log(`当前净值: ${navMatch ? navMatch[1] : '未找到'}`);

// 净值日期
const dateMatch = cleanText.match(/(\d{4}-\d{2}-\d{2})\s*净值日期/);
console.log(`净值日期: ${dateMatch ? dateMatch[1] : '未找到'}`);

// 风险等级
const riskMatch = cleanText.match(/(PR\d)\s*中?[低中高]风险\s*风险等级/);
console.log(`风险等级: ${riskMatch ? riskMatch[1] : '未找到'}`);

// 起购金额
const amountMatch = cleanText.match(/([0-9,]+\.?[0-9]*)\s*人民币\s+起购金额/);
console.log(`起购金额: ${amountMatch ? amountMatch[1] : '未找到'}`);

console.log('\n═══════════════════════════════════');
console.log('所有匹配到的"当前净值"上下文');
console.log('═══════════════════════════════════\n');

const allNav = cleanText.match(/.{0,80}当前净值.{0,80}/g) || [];
allNav.forEach((s, i) => {
  console.log(`[${i + 1}] ${s.trim()}`);
});

console.log('\n🏁 结束');