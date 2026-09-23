import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const base = '../node_modules/psbcwm-mcp';
const out = [];

if (!existsSync(base)) {
  console.log('❌ 找不到 psbcwm-mcp');
  process.exit(1);
}

function walk(dir, depth = 0) {
  if (depth > 5) return;
  try {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      try {
        const st = statSync(full);
        if (st.isDirectory() && f !== 'node_modules') walk(full, depth + 1);
        else if (f.endsWith('.js') || f.endsWith('.mjs')) {
          const content = readFileSync(full, 'utf-8');
          out.push({ file: full.replace(base, ''), content });
        }
      } catch (e) {}
    }
  } catch (e) {}
}
walk(base);

console.log(`📁 共 ${out.length} 个 JS 文件\n`);

// 目标文件：client、decorate、http
const targets = out.filter(o =>
  o.file.includes('client') ||
  o.file.includes('decorate') ||
  o.file.includes('http') ||
  o.file.includes('api')
);

console.log('════════════════════════════════════');
console.log('🎯 关键文件（client / decorate / http / api）');
console.log('════════════════════════════════════\n');

if (targets.length === 0) {
  console.log('未找到关键文件，打印全部文件名：');
  out.forEach(o => console.log(`  ${o.file}`));
} else {
  targets.forEach(t => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📄 ${t.file}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(t.content);
    console.log('\n');
  });
}

// 保存完整 dump
const dump = targets.map(t => `\n===== ${t.file} =====\n${t.content}`).join('\n\n');
writeFileSync('mcp_dump.txt', dump);
console.log('\n💾 完整内容已保存到 crawler/mcp_dump.txt');
console.log('🏁 完成');