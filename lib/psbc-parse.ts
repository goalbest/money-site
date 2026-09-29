// lib/psbc-parse.ts
// 邮储短链解析 + finquerytwo 接口封装

const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

/**
 * 跟随短链重定向，返回最终 URL（含 hash）
 * 用 redirect: 'manual' 才能拿到带 hash 的 Location
 */
export async function resolveShortLink(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT },
    });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc) return current;
      current = new URL(loc, current).toString();
    } else {
      return current;
    }
  }
  return current;
}

/**
 * 从最终 URL 提取 productId
 * 例如：https://wap.psbc.com/.../#/?pageId=1040&productId=2501MB022B
 */
export function extractProductCode(finalUrl: string): string | null {
  try {
    const u = new URL(finalUrl);
    // hash 部分： #/?pageId=1040&productId=2501MB022B
    const hashQuery = u.hash.split('?')[1] || '';
    const hashParams = new URLSearchParams(hashQuery);
    return (
      hashParams.get('productId') ||
      u.searchParams.get('productId') ||
      null
    );
  } catch {
    return null;
  }
}

export interface PsbcProduct {
  code: string;
  name: string;
  unitNav: number | null;
  navDate: string | null;
  sevenYield: number | null;
  wfEarn: number | null;
  riskLevel: string | null;
  raw: any;
}

/**
 * 调邮储 finquerytwo 接口，按 SECODE 精确匹配产品
 */
export async function fetchPsbcProduct(code: string): Promise<PsbcProduct | null> {
  const ts = Date.now();
  const params = new URLSearchParams({
    callback: 'cb',
    currency: '',
    deadline: '',
    netproduct: '',
    risklevel: '',
    entruststartamt: '',
    buystatus: '',
    product_status: '',
    zhongyouflag: '',
    bankflag: '',
    investor_nature: '',
    order: '',
    finkeyword: code,
    pageNum: '1',
    _: String(ts),
  });

  const url = `https://s.psbc.com/portal/PsbcService/finquerytwo/?${params}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': 'https://www.psbc.com/',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });

  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();

  // JSONP 去包装：cb({...})
  const m = text.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error('JSONP 解析失败');

  const data = JSON.parse(m[1]);
  const list = data.resultList || [];
  const hit = list.find((x: any) => x.SECODE === code);
  if (!hit) return null;

  const nav = parseFloat(hit.LATEST_NET);
  const seven = parseFloat(hit.SEVEN_ANNUAL_YIELD);
  const wf = parseFloat(hit.WF_EARN);

  return {
    code: hit.SECODE,
    name: hit.FPNAME,
    unitNav: isFinite(nav) && nav > 0 ? nav : null,
    navDate: new Date().toISOString().slice(0, 10), // 接口没给净值日期，先用今天
    sevenYield: isFinite(seven) && seven > 0 ? seven : null,
    wfEarn: isFinite(wf) && wf > 0 ? wf : null,
    riskLevel: hit.RISKLEVEL ? `PR${hit.RISKLEVEL}` : null,
    raw: hit,
  };
}

/**
 * 一站式：短链 → 产品数据
 */
export async function parsePsbcLink(shortUrl: string): Promise<PsbcProduct> {
  const finalUrl = await resolveShortLink(shortUrl);
  console.log('最终 URL:', finalUrl);

  const code = extractProductCode(finalUrl);
  if (!code) throw new Error('无法从链接提取 productId');

  console.log('提取 productId:', code);

  const product = await fetchPsbcProduct(code);
  if (!product) throw new Error(`邮储接口未找到产品: ${code}`);

  return product;
}