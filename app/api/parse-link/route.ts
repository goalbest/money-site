// app/api/parse-link/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
    }

    const hostname = new URL(url).hostname;
    let product;
    let sourceType: string;
    let params: any;
    let bank = '';

    if (hostname.includes('psbc.com')) {
      let finalUrl = url;
      if (hostname.includes('u.psbc.com')) {
        const { resolveShortLink } = await import('@/lib/psbc-parse');
        finalUrl = await resolveShortLink(url);
        console.log('短链解析后:', finalUrl);
      }
      
      const u = new URL(finalUrl);
      const hashQuery = u.hash.split('?')[1] || '';
      const hashParams = new URLSearchParams(hashQuery);
      const productCode =
        hashParams.get('productId') ||
        u.searchParams.get('productId') ||
        u.searchParams.get('code');

      if (!productCode) {
        return NextResponse.json({ error: '无法从链接提取 productId，请检查链接是否完整' }, { status: 400 });
      }

      const { fetchPsbcProduct } = await import('@/lib/psbc-parse');
      const psbcProd = await fetchPsbcProduct(productCode);
      if (!psbcProd) {
        return NextResponse.json({ error: `邮储接口未找到产品: ${productCode}` }, { status: 404 });
      }

      product = {
        code: psbcProd.code,
        name: psbcProd.name,
        unitNav: psbcProd.unitNav,
        navDate: psbcProd.navDate,
        sevenYield: psbcProd.sevenYield,
        wfEarn: psbcProd.wfEarn,
        riskLevel: psbcProd.riskLevel,
      };
      sourceType = 'zywm';
      bank = '中邮理财';
      params = { product_code: psbcProd.code };

    } else if (hostname.includes('boc.cn')) {
      const u = new URL(url);
      let productId = u.searchParams.get('productId') || (u.hash.split('?')[1] ? new URLSearchParams(u.hash.split('?')[1]).get('productId') : null);
      if (!productId) return NextResponse.json({ error: '无法从链接中提取 productId' }, { status: 400 });
      product = { code: productId, name: `中行产品 ${productId}`, unitNav: null, navDate: null, sevenYield: null, wfEarn: null, riskLevel: null };
      sourceType = 'boc'; bank = '中国银行'; params = { product_id: productId };

    } else if (hostname.includes('abchina.com')) {
      const { parseAbcLink, ABC_DEFAULT_RULES } = await import('@/lib/abc-parse');
      const info = parseAbcLink(url);
      if (!info) return NextResponse.json({ error: '无法从农行链接提取产品代码' }, { status: 400 });
      product = { code: info.productCode, name: `农行产品 ${info.productCode}`, unitNav: null, navDate: null, sevenYield: null, wfEarn: null, riskLevel: ABC_DEFAULT_RULES.risk_level };
      sourceType = 'abc'; bank = '农银理财'; params = { product_code: info.productCode };

    } else if (hostname.includes('cmbchina.com')) {
      const u = new URL(url);
      const ripInn = u.searchParams.get('XRIPINN');
      const saaCode = u.searchParams.get('XSAACOD');
      if (!ripInn || !saaCode) return NextResponse.json({ error: '无法从链接提取参数' }, { status: 400 });
      product = { code: ripInn, name: `招行产品 ${ripInn}`, unitNav: null, navDate: null, sevenYield: null, wfEarn: null, riskLevel: null };
      sourceType = 'cmb'; bank = '招银理财'; params = { saaCode, ripInn };

    } else {
      return NextResponse.json({ error: '暂不支持该银行链接' }, { status: 400 });
    }

    console.log('解析成功:', product.code, product.name, '银行:', bank);

    const { data: prod, error: prodErr } = await supabase
      .from('products')
      .upsert(
        {
          name: product.name,
          bank: bank,
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
      return NextResponse.json({ error: `写入 products 失败: ${prodErr?.message}` }, { status: 500 });
    }

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

    if (srcErr) return NextResponse.json({ ok: true, warning: `写入失败: ${srcErr.message}`, product: prod });

    return NextResponse.json({
      ok: true,
      product: prod,
      message: `✅ ${product.name} 已添加`,
    });

  } catch (e: any) {
    console.error('❌ 真实报错详情:', e);
    return NextResponse.json({ error: `服务器错误: ${e.message}` }, { status: 500 });
  }
}