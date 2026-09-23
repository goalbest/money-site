import { NextRequest, NextResponse } from "next/server";
import https from "https";
import crypto from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const HTTP_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

// ★ 关键：允许 legacy SSL
const HTTPS_AGENT = new https.Agent({
  rejectUnauthorized: false,
  minVersion: "TLSv1",
  maxVersion: "TLSv1.3",
  ciphers: "DEFAULT@SECLEVEL=1",
  secureOptions:
    0x4 |
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3,
});

function httpsGet(fullUrl: string, depth = 0): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    if (depth > 5) return resolve({ status: 0, body: "" });
    const u = new URL(fullUrl);
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "GET",
        headers: HTTP_HEADERS,
        agent: HTTPS_AGENT,
      },
      (res) => {
        // 处理重定向
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          let next: string;
          if (loc.startsWith("http")) next = loc;
          else if (loc.startsWith("/")) next = `https://${u.hostname}${loc}`;
          else next = new URL(loc, fullUrl).toString();
          resolve(httpsGet(next, depth + 1));
          return;
        }
        let d = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: d }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function parseNotice(html: string) {
  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

  const codeMatch = cleanText.match(/([A-Z0-9]{9,15})\s*非保本/);
  const code = codeMatch ? codeMatch[1] : null;

  const navMatch = cleanText.match(/([0-9]+\.[0-9]{2,4})\s*当前净值/);
  const nav = navMatch ? parseFloat(navMatch[1]) : null;

  const dateMatch = cleanText.match(/(\d{4}-\d{2}-\d{2})\s*净值日期/);
  const navDate = dateMatch ? dateMatch[1] : null;

  const nameMatch = cleanText.match(/([^\s]{5,40})\s+[A-Z0-9]{9,15}\s*非保本/);
  const name = nameMatch ? nameMatch[1].trim() : null;

  return { code, name, nav, navDate };
}

export async function POST(req: NextRequest) {
  try {
    const { productId, url } = await req.json();

    if (!productId || !url) {
      return NextResponse.json({ error: "缺少 productId 或 url" }, { status: 400 });
    }

    if (!url.startsWith("http")) {
      return NextResponse.json({ error: "URL 必须以 http 开头" }, { status: 400 });
    }

    console.log(`🌐 抓取: ${url}`);

    let result;
    try {
      result = await httpsGet(url);
    } catch (e: any) {
      return NextResponse.json({
        error: `抓取失败: ${e.message || "网络错误"}`,
      }, { status: 500 });
    }

    console.log(`  HTTP ${result.status}, 长度 ${result.body.length}`);

    if (result.status !== 200) {
      return NextResponse.json({
        error: `页面返回 HTTP ${result.status}，可能是短链接跳转到了 App 下载页。请用产品公告页的完整 URL`,
      }, { status: 500 });
    }

    if (result.body.length < 500) {
      return NextResponse.json({
        error: "页面内容太短，可能不是产品公告页",
      }, { status: 500 });
    }

    const info = parseNotice(result.body);
    console.log(`  解析: ${JSON.stringify(info)}`);

    if (!info.nav || !info.navDate) {
      return NextResponse.json({
        error: "无法从页面解析出净值数据，请确认是产品公告页（含'当前净值'和'净值日期'）",
      }, { status: 400 });
    }

    // 更新 products
    const updates: any = {
      unit_nav: info.nav,
      nav_date: info.navDate,
    };
    if (info.code) {
      updates.code = info.code;
      updates.bank_code = info.code;
    }

    const r1 = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(updates),
    });

    if (!r1.ok) {
      const err = await r1.text();
      return NextResponse.json({ error: `更新产品失败: ${err.slice(0, 100)}` }, { status: 500 });
    }

    // 写 nav_history
    await fetch(`${SUPABASE_URL}/rest/v1/nav_history?on_conflict=product_id,nav_date`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([{
        product_id: productId,
        nav_date: info.navDate,
        unit_nav: info.nav,
      }]),
    });

    return NextResponse.json({
      success: true,
      name: info.name,
      code: info.code,
      nav: info.nav,
      navDate: info.navDate,
    });
  } catch (e: any) {
    console.error("抓取失败:", e);
    return NextResponse.json({ error: e.message || "服务器错误" }, { status: 500 });
  }
}