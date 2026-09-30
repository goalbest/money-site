// lib/cmb-parse.ts
// 招商银行链接解析 + 净值接口封装

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export interface CmbProduct {
  code: string;
  name: string;
  unitNav: number | null;
  navDate: string | null;
  saaCode: string;
  ripInn: string;
}

/**
 * 从招行链接提取参数
 * 例如：https://mobile.cmbchina.com/...?XRIPINN=135005A&XSAACOD=D07
 */
export function extractCmbParams(url: string): { saaCode: string; ripInn: string } | null {
  try {
    const u = new URL(url);
    const ripInn = u.searchParams.get('XRIPINN');
    const saaCode = u.searchParams.get('XSAACOD');

    if (!ripInn || !saaCode) return null;
    return { saaCode, ripInn };
  } catch {
    return null;
  }
}

/**
 * 调招行 get-history-value 接口，获取产品最新净值和名称
 * 注意：接口需要真实浏览器会话，因此用 Playwright 方案会更稳
 * 这里先用 fetch 尝试，如果遇到 sysCode=1014，则改用 Playwright
 */
export async function fetchCmbProduct(
  saaCode: string,
  ripInn: string
): Promise<CmbProduct | null> {
  const body = {
    saaCode,
    ripInn,
    yDalCod: 'N',
    ySaaCode: '',
    yFndInn: '',
    yNavDat: '0',
  };

  const r = await fetch(
    'https://mobile.cmbchina.com/ientrustfinance/product-statistics/get-history-value',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': '*/*',
        'Referer': `https://mobile.cmbchina.com/IEntrustFinance/financeproduct/historynetvalue.html?Code=${ripInn}&XSAACOD=${saaCode}`,
        'User-Agent': USER_AGENT,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(body),
    }
  );

  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();

  if (data.sysCode !== 200) {
    // 常见错误：1014 表示需要真实浏览器会话
    throw new Error(`招行接口错误: sysCode=${data.sysCode} ${data.sysMsg || ''}`);
  }

  const list = data.bizResult?.data?.historyValueLists || [];
  if (list.length === 0) return null;

  const latest = list[0];

  return {
    code: ripInn,
    name: '', // 接口不返回名称，需另行获取或从链接推断
    unitNav: parseFloat(latest.unitNetValue),
    navDate: latest.date,
    saaCode,
    ripInn,
  };
}

/**
 * 一站式：招行链接 → 产品数据
 */
export async function parseCmbLink(shortUrl: string): Promise<CmbProduct> {
  const params = extractCmbParams(shortUrl);
  if (!params) throw new Error('无法从链接提取 XRIPINN 或 XSAACOD 参数');

  const product = await fetchCmbProduct(params.saaCode, params.ripInn);
  if (!product) throw new Error(`招行接口未找到产品: ${params.ripInn}`);

  return product;
}