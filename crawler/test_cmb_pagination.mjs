// crawler/test_cmb_pagination.mjs
async function fetchPage(yNavDat) {
  const body = {
    saaCode: 'D07',
    ripInn: '120029A',
    yDalCod: 'N',
    ySaaCod: '',
    yFndInn: '',
    yNavDat: yNavDat,
  };
  const r = await fetch(
    'https://mobile.cmbchina.com/ientrustfinance/product-statistics/get-history-value',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://mobile.cmbchina.com/IEntrustFinance/financeproduct/historynetvalue.html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify(body),
    }
  );
  return await r.json();
}

let yNavDat = '0';
let round = 0;
const all = [];

while (round < 15) {
  console.log(`\n=== 第 ${round + 1} 轮, yNavDat = ${yNavDat} ===`);
  const data = await fetchPage(yNavDat);
  const reqY1 = data.bizResult?.data?.historyValueReqY1;
  const list = data.bizResult?.data?.historyValueLists || [];
  console.log(`  返回 ${list.length} 条`);
  console.log(`  服务器建议下次用: ${reqY1?.yNavDat}`);

  if (list.length === 0) { console.log('  空，结束'); break; }

  console.log(`  最新: ${list[0].date} → ${list[0].unitNetValue}`);
  console.log(`  最早: ${list[list.length - 1].date} → ${list[list.length - 1].unitNetValue}`);
  all.push(...list);

  if (list.length < 30) { console.log('  少于 30 条，到底了'); break; }

  const next = reqY1?.yNavDat;
  if (!next || next === yNavDat) { console.log('  yNavDat 没变化，结束'); break; }

  yNavDat = next;
  round++;
  await new Promise(r => setTimeout(r, 1000));
}

console.log(`\n═══════════════════════════════`);
console.log(`总计: ${all.length} 条`);
console.log(`最早: ${all[all.length - 1]?.date}`);
console.log(`最新: ${all[0]?.date}`);