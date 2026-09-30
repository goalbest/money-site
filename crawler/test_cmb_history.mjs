// 探测招行不同参数能拿多少条
const AGENT_HDR = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Referer': 'https://mobile.cmbchina.com/IEntrustFinance/',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  'X-Requested-With': 'XMLHttpRequest',
};

async function tryFetch(label, body) {
  try {
    const r = await fetch(
      'https://mobile.cmbchina.com/ientrustfinance/product-statistics/get-history-value',
      { method: 'POST', headers: AGENT_HDR, body: JSON.stringify(body) }
    );
    const d = await r.json();
    const list = d.bizResult?.data?.historyValueLists || [];
    console.log(`\n[${label}]`);
    console.log(`  sysCode: ${d.sysCode}`);
    console.log(`  条数: ${list.length}`);
    if (list.length > 0) {
      console.log(`  最新: ${list[0].date} → ${list[0].unitNetValue}`);
      console.log(`  最早: ${list[list.length-1].date} → ${list[list.length-1].unitNetValue}`);
    }
  } catch (e) {
    console.log(`\n[${label}] ❌ ${e.message}`);
  }
}

const base = { saaCode: 'D07', ripInn: 'JY040232', ySaaCode: '', yFndInn: '' };

await tryFetch('原始（30条）', { ...base, yDalCod: 'N', yNavDat: '0' });
await tryFetch('yDalCod=Y', { ...base, yDalCod: 'Y', yNavDat: '0' });
await tryFetch('yNavDat=20240101', { ...base, yDalCod: 'N', yNavDat: '20240101' });
await tryFetch('yNavDat=20200101', { ...base, yDalCod: 'N', yNavDat: '20200101' });
await tryFetch('yNavDat=20250101', { ...base, yDalCod: 'N', yNavDat: '20250101' });