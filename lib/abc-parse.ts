// lib/abc-parse.ts
// 农行理财链接解析

export interface AbcLinkInfo {
  productCode: string;   // 用于 API 查询的产品代码
  rawCode: string;       // URL 里的原始 code
}

/**
 * 从农行分享链接提取产品代码
 * 例：https://wx.abchina.com/webank/main-view/financialDetails?code=d62af97488cc427a8e08841c_fNYJXLD
 */
export function parseAbcLink(url: string): AbcLinkInfo | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('abchina.com')) return null;

    const code = u.searchParams.get('code');
    if (!code) return null;

    // code 格式：d62af97488cc427a8e08841c_fNYJXLD
    // 提取 "_" 后面的部分作为产品代码
    let productCode = code;
    if (code.includes('_')) {
      const parts = code.split('_');
      productCode = parts[parts.length - 1]; // NYJXLD
      // 去掉开头的 f（可能是标识位）
      if (productCode.startsWith('f') && productCode.length > 6) {
        productCode = productCode.slice(1);
      }
    }

    return { productCode, rawCode: code };
  } catch {
    return null;
  }
}

// 农行规则默认值（页面公开信息）
export const ABC_DEFAULT_RULES = {
  risk_level: 'R2',
  redeem_arrival_days: 2,
  redeem_confirm_days: 1,
  redeem_cutoff_time: '15:00',
};