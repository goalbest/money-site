const SUPABASE_URL = 'https://xbwzrnmacznaxtumkrwy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ENL6t2RGt7GKhT7Z4i5rbg_H20oeZ1i';
const USER_ID = 1;

// 你的 18 个产品（名称从截图里整理出来的）
// 注意：灵活·鸿运日开22号B 已添加，跳过
const PRODUCTS = [
  { name: '灵活·鸿运最短持有7天22号B', bank: '中邮理财', amount: 57345.55 },
  { name: '优盛·鸿锦最短持有7天6号ESG优选B', bank: '中邮理财', amount: 10034.21 },
  { name: '优盛·鸿锦最短持有14天15号B', bank: '中邮理财', amount: 100299.42 },
  { name: '优盛·鸿锦最短持有7天31号B', bank: '中邮理财', amount: 15035.50 },
  { name: '灵活添利·鸿锦最短持有30天8号A', bank: '中邮理财', amount: 50107.85 },
  // 灵活·鸿运日开22号B 已添加，跳过
  { name: '优盛·鸿锦最短持有14天15号A', bank: '中邮理财', amount: 16025.03 },
  { name: '灵活·鸿运最短持有14天17号B', bank: '中邮理财', amount: 60043.75 },
  { name: '优盛·鸿锦最短持有7天41号A', bank: '中邮理财', amount: 40015.94 },
  { name: '优盛·鸿锦日开5号A', bank: '中邮理财', amount: 11037.40 },
  { name: '灵活添利·鸿锦最短持有60天6号A', bank: '中邮理财', amount: 20023.60 },
  { name: '福瑞·鸿锦最短持有90天11号A', bank: '中邮理财', amount: 20017.85 },
  { name: '灵活·鸿运最短持有14天28号A', bank: '中邮理财', amount: 35007.45 },
  { name: '优盛·鸿锦最短持有90天18号B', bank: '中邮理财', amount: 10001.00 },
  { name: '福瑞·鸿锦最短持有30天5号A', bank: '中邮理财', amount: 5000.00 },
  { name: '交银理财灵动聚利日开6号180天持有期', bank: '交银理财', amount: 50194.96 },
  { name: '交银理财稳享灵动慧利日开93号90天持有期', bank: '交银理财', amount: 50162.78 },
  { name: '招银理财招睿添金（和享）14天持有期', bank: '招银理财', amount: 10009.86 },
];

async function findProduct(name, bank) {
  const url = `${SUPABASE_URL}/rest/v1/products?select=id&name=eq.${encodeURIComponent(name)}&bank=eq.${encodeURIComponent(bank)}&limit=1`;
  const resp = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  const data = await resp.json();
  return data[0] || null;
}

async function createProduct(name, bank) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ name, bank }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.log(`    ❌ 创建失败：${err.slice(0, 200)}`);
    return null;
  }
  const data = await resp.json();
  return data[0];
}

async function addHolding(userId, productId, amount) {
  const url = `${SUPABASE_URL}/rest/v1/user_holdings`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      product_id: productId,
      holding_amount: amount,
      in_transit_amount: 0,
      hold_date: new Date().toISOString().split('T')[0],
    }),
  });
  return resp.ok;
}

console.log(`🚀 开始批量导入 ${PRODUCTS.length} 个产品...\n`);

let ok = 0, fail = 0;

for (let i = 0; i < PRODUCTS.length; i++) {
  const p = PRODUCTS[i];
  console.log(`[${i + 1}/${PRODUCTS.length}] ${p.name}`);

  try {
    // 1. 查产品是否存在
    let product = await findProduct(p.name, p.bank);

    if (product) {
      console.log(`    ✅ 产品已存在（id=${product.id}）`);
    } else {
      // 2. 不存在则创建
      product = await createProduct(p.name, p.bank);
      if (!product) {
        fail++;
        continue;
      }
      console.log(`    🆕 创建成功（id=${product.id}）`);
    }

    // 3. 加入持仓
    const holdOk = await addHolding(USER_ID, product.id, p.amount);
    if (holdOk) {
      console.log(`    💰 持仓已记录：${p.amount}`);
      ok++;
    } else {
      console.log(`    ⚠️ 持仓保存失败`);
      fail++;
    }
  } catch (e) {
    console.log(`    ❌ 出错：${e.message}`);
    fail++;
  }

  await new Promise(r => setTimeout(r, 200));
}

console.log(`\n🎉 完成！成功 ${ok} 个，失败 ${fail} 个`);