// lib/psbc-parse.ts
import { chromium } from 'playwright';

// ── 1. 解析短链 ──
export async function resolveShortLink(url: string): Promise<string> {
  // 尝试纯 Fetch 跟随重定向
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) {
        console.log('✅ Fetch 成功解析短链:', loc);
        return loc;
      }
    }
  } catch (e) {
    console.log('⚠️ Fetch 短链失败，降级用 Playwright');
  }

  // 降级用 Playwright
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000); 
    const finalUrl = page.url();
    console.log('✅ Playwright 成功解析短链:', finalUrl);
    return finalUrl;
  } catch (error) {
    console.error('❌ Playwright 解析短链失败:', error);
    return url;
  } finally {
    if (browser) await browser.close();
  }
}

// ── 2. 提取 productId ──
export function extractProductCode(finalUrl: string): string | null {
  try {
    const u = new URL(finalUrl);
    const hashQuery = u.hash.split('?')[1] || '';
    const hashParams = new URLSearchParams(hashQuery);
    return hashParams.get('productId') || u.searchParams.get('productId') || null;
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

// ── 3. 抓取数据 ──
export async function fetchPsbcProduct(code: string): Promise<PsbcProduct | null> {
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });
    const page = await context.newPage();

    await page.goto('https://www.psbc.com/', { waitUntil: 'networkidle', timeout: 30000 });

    const ts = Date.now();
    const params = new URLSearchParams({
      callback: 'cb', currency: '', deadline: '', netproduct: '', risklevel: '', entruststartamt: '',
      buystatus: '', product_status: '', zhongyouflag: '', bankflag: '', investor_nature: '', order: '',
      finkeyword: code, pageNum: '1', _: String(ts),
    });
    const apiUrl = `https://s.psbc.com/portal/PsbcService/finquerytwo/?${params}`;

    const text = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return await res.text();
    }, apiUrl);

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
      navDate: new Date().toISOString().slice(0, 10),
      sevenYield: isFinite(seven) && seven > 0 ? seven : null,
      wfEarn: isFinite(wf) && wf > 0 ? wf : null,
      riskLevel: hit.RISKLEVEL ? `PR${hit.RISKLEVEL}` : null,
      raw: hit,
    };
  } catch (error) {
    console.error('❌ Playwright 请求邮储接口失败:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}