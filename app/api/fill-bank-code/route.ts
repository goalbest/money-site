// app/api/fill-bank-code/route.ts
import { NextResponse } from 'next/server';

const PSBC_API = 'https://s.psbc.com/portal/PsbcService/finquerytwo/';

async function searchPsbc(keyword: string) {
  const ts = Date.now();
  const params = new URLSearchParams({
    callback: 'cb', currency: '', deadline: '', netproduct: '', risklevel: '',
    entruststartamt: '', buystatus: '', product_status: '',
    zhongyouflag: '', bankflag: '', investor_nature: '', order: '',
    finkeyword: keyword, pageNum: '1', _: String(ts),
  });
  const r = await fetch(`${PSBC_API}?${params}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Referer': 'https://www.psbc.com/',
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  const m = text.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error('JSONP 解析失败');
  return JSON.parse(m[1]);
}

export async function POST(request: Request) {
  try {
    const { name, code, bank } = await request.json();

    // 只处理邮储/中邮
    const isPsbc =
      /中邮|邮储/.test(bank || '') ||
      /中邮|邮储|鸿运|鸿锦|优盛|福瑞|灵活添利|财富鑫鑫|鸿业远图/.test(name || '') ||
      /^(26|25|24|23)\d{2}/.test(code || '');

    if (!isPsbc) {
      return NextResponse.json({ ok: false, reason: '非邮储/中邮产品' });
    }

    let hit = null;
    if (code) {
      const data = await searchPsbc(code);
      hit = (data.resultList || []).find((x: any) => x.SECODE === code);
    }

    if (!hit && name) {
      const data = await searchPsbc(name);
      if ((data.resultList || []).length > 0) hit = data.resultList[0];
    }

    if (!hit) {
      return NextResponse.json({ ok: false, reason: '未找到匹配产品' });
    }

    const nav = parseFloat(hit.LATEST_NET);
    const seven = parseFloat(hit.SEVEN_ANNUAL_YIELD);
    const wf = parseFloat(hit.WF_EARN);

    // 顺便查 products 里有没有这个 bank_code
    const { supabase } = await import('@/lib/supabase');
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('bank_code', hit.SECODE)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      bank_code: hit.SECODE,
      existing_id: existing?.id || null,
      name: hit.FPNAME,
      unit_nav: isFinite(nav) && nav > 0 ? nav : null,
      annual_7d_yield: isFinite(seven) && seven > 0 ? seven : null,
      daily_income: isFinite(wf) && wf > 0 ? wf : null,
      risk_level: hit.RISKLEVEL ? `PR${hit.RISKLEVEL}` : null,
      nav_date: new Date().toISOString().slice(0, 10),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}