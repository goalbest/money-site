// lib/abc-parse.ts
// 农行理财链接解析

export interface AbcLinkInfo {
  productCode: string;
}

/**
 * 从农行分享链接提取产品代码
 * 例：https://wx.abchina.com/webank/main-view/financialDetails?code=db471c3682c545f58939a042_fNYJXLD
 * 提取 "_" 后面的部分，并去掉开头的 "f"（如果存在）
 */
export function parseAbcLink(url: string): AbcLinkInfo | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('abchina.com')) return null;

    const code = u.searchParams.get('code');
    if (!code) return null;

    let productCode = code;
    if (code.includes('_')) {
      const parts = code.split('_');
      productCode = parts[parts.length - 1];
      // 去掉开头的 f（如果存在且长度大于6）
      if (productCode.startsWith('f') && productCode.length > 6) {
        productCode = productCode.slice(1);
      }
    }

    return { productCode };
  } catch {
    return null;
  }
}

export const ABC_DEFAULT_RULES = {
  risk_level: 'R2',
  redeem_arrival_days: 2,
  redeem_confirm_days: 1,
  redeem_cutoff_time: '15:00',
};