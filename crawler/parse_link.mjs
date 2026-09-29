// crawler/parse_link.mjs
import fetch from 'node-fetch';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/**
 * 解析用户粘贴的链接，返回结构化的抓取参数
 * @param {string} url - 用户粘贴的链接
 * @returns {Promise<{source_type: string, params: object, source_url: string} | null>}
 */
export async function parseLink(url) {
  try {
    // 1. 跟随重定向，获取最终 URL
    const response = await fetch(url, { 
      redirect: 'follow', 
      headers: { 'User-Agent': USER_AGENT } 
    });
    const finalUrl = response.url;
    console.log(`最终 URL: ${finalUrl}`);

    // 2. 根据域名判断来源类型
    const hostname = new URL(finalUrl).hostname;
    
    // 3. 邮储银行 (psbc.com)
    if (hostname.includes('psbc.com')) {
      // 尝试从 URL 中提取产品代码
      const urlObj = new URL(finalUrl);
      // 邮储产品页可能通过 productCode、code 等参数传递产品代码
      const productCode = urlObj.searchParams.get('productCode') || 
                          urlObj.searchParams.get('code') ||
                          // 或者从路径中提取
                          finalUrl.match(/\/([A-Z0-9]{9,15})\/?$/)?.[1];
      
      if (productCode) {
        return {
          source_type: 'psbc',
          params: { productCode }, // 后续抓取脚本使用此参数
          source_url: url
        };
      }
    }

    // 4. 招商银行 (cmbchina.com) - 复用之前的经验
    if (hostname.includes('cmbchina.com')) {
      const urlObj = new URL(finalUrl);
      const XRIPINN = urlObj.searchParams.get('XRIPINN');
      const XSAACOD = urlObj.searchParams.get('XSAACOD');
      
      if (XRIPINN && XSAACOD) {
        return {
          source_type: 'cmb',
          params: { saaCode: XSAACOD, ripInn: XRIPINN },
          source_url: url
        };
      }
    }

    console.warn('未识别的链接类型:', finalUrl);
    return null;
  } catch (error) {
    console.error('解析链接失败:', error.message);
    return null;
  }
}

// 本地测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const testUrl = process.argv[2] || 'https://u.psbc.com/4bQ4pk';
  parseLink(testUrl).then(result => {
    console.log('解析结果:', JSON.stringify(result, null, 2));
  });
}