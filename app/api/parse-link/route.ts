// app/api/parse-link/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parsePsbcLink } from '@/lib/psbc-parse';
import { parseCmbLink } from '@/lib/cmb-parse';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
    }

    // ── 1. 根据域名判断来源 ──
    const hostname = new URL(url).hostname;
    let product;
    let sourceType: string;
    let params: any;

    if (hostname.includes('psbc.com')) {
      // 邮储银行
      product = await parsePsbcLink(url);
      sourceType = 'psbc';
      params = { product_code: product.code };
    } else if (hostname.includes('cmbchina.com')) {
      // 招商银行：不立即抓，只提取参数（净值交给 Playwright workflow）
      const u = new URL(url);
      const ripInn = u.searchParams.get('XRIPINN');
      const saaCode = u.searchParams.get('XSAACOD');
      if (!ripInn || !saaCode) {
        return NextResponse.json({ error: '无法从链接提取 XRIPINN 或 XSAACOD' }, { status: 400 });
      }
      product = {
        code: ripInn,
        name: `招行产品 ${ripInn}`,   // 暂用代码占位，Playwright 抓取后会更新
        unitNav: null,
        navDate: null,
        sevenYield: null,
        wfEarn: null,
        riskLevel: null,
      };
      sourceType = 'cmb';
      params = { saaCode, ripInn };
    } else {
      return NextResponse.json({ error: '暂不支持该银行链接' }, { status: 400 });
    }

    console.log('解析成功:', product.code, product.name);

    // ── 2. 写入 products（upsert，bank_code 唯一）──
    const { data: prod, error: prodErr } = await supabase
      .from('products')
      .upsert(
        {
          name: product.name,
          bank: sourceType === 'psbc' ? '邮储银行' : '招银理财',
          bank_code: product.code,
          unit_nav: product.unitNav,
          nav_date: product.navDate,
          annual_7d_yield: product.sevenYield,
          daily_income: product.wfEarn,
          risk_level: product.riskLevel,
        },
        { onConflict: 'bank_code' }
      )
      .select('id, name, bank_code')
      .single();

    if (prodErr || !prod) {
      return NextResponse.json(
        { error: `写入 products 失败: ${prodErr?.message}` },
        { status: 500 }
      );
    }

    // ── 3. 写入 product_sources ──
    const { error: srcErr } = await supabase
      .from('product_sources')
      .upsert(
        {
          product_id: prod.id,
          source_type: sourceType,
          source_url: url,
          params,
          enabled: true,
          last_fetch_at: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
      );

    if (srcErr) {
      return NextResponse.json({
        ok: true,
        warning: `product_sources 写入失败: ${srcErr.message}`,
        product: prod,
      });
    }

    return NextResponse.json({
      ok: true,
      product: prod,
      message: `✅ ${product.name} 已添加（净值 ${product.unitNav ?? '—'}）`,
    });
  } catch (e: any) {
    console.error('parse-link 异常:', e);
    return NextResponse.json(
      { error: `服务器错误: ${e.message}` },
      { status: 500 }
    );
  }
}