import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: '缺少环境变量' }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  function calcAnnualized(navs: any[], periodMonths: number) {
    if (!navs || navs.length < 2) return 0;
    const sorted = [...navs].sort((a, b) => new Date(a.nav_date).getTime() - new Date(b.nav_date).getTime());
    const latest = sorted[sorted.length - 1];
    const latestDate = new Date(latest.nav_date);
    
    let targetDate = new Date(latestDate);
    targetDate.setMonth(targetDate.getMonth() - periodMonths);

    let closestNav = sorted[0];
    let minDiff = Infinity;
    for (const item of sorted) {
      const diff = Math.abs(new Date(item.nav_date).getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestNav = item;
      }
    }

    const actualDays = Math.max(1, (latestDate.getTime() - new Date(closestNav.nav_date).getTime()) / 86400000);
    const returnRate = (Number(latest.unit_nav) / Number(closestNav.unit_nav)) - 1;
    return (returnRate / actualDays) * 365 * 100;
  }

  try {
    const { data: products, error: prodErr } = await supabase.from('products').select('id, name');
    if (prodErr) throw prodErr;

    let updatedCount = 0;
    const logs: string[] = [];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      
      const { data: navs } = await supabase
        .from('nav_history')
        .select('nav_date, unit_nav')
        .eq('product_id', p.id)
        .order('nav_date', { ascending: true });

      if (!navs || navs.length < 2) continue;

      const annual_1m = calcAnnualized(navs, 1);
      const annual_3m = calcAnnualized(navs, 3);
      const annual_6m = calcAnnualized(navs, 6);
      const annual_1y = calcAnnualized(navs, 12);
      
      let annual_7d = 0;
      const latest = new Date(navs[navs.length - 1].nav_date);
      let target = new Date(latest); target.setDate(target.getDate() - 7);
      let closest = navs[0], minDiff = Infinity;
      for (const n of navs) {
        const diff = Math.abs(new Date(n.nav_date).getTime() - target.getTime());
        if (diff < minDiff) { minDiff = diff; closest = n; }
      }
      const days7 = Math.max(1, (latest.getTime() - new Date(closest.nav_date).getTime()) / 86400000);
      if (days7 >= 5 && days7 <= 10) {
        annual_7d = (((Number(navs[navs.length - 1].unit_nav) / Number(closest.unit_nav)) - 1) / days7) * 365 * 100;
      }

      const updates = {
        annual_7d_yield: Number(annual_7d.toFixed(4)),
        annualized_1m: Number(annual_1m.toFixed(4)),
        annual_3m_yield: Number(annual_3m.toFixed(4)),
        annual_6m_yield: Number(annual_6m.toFixed(4)),
        annual_1y_yield: Number(annual_1y.toFixed(4)),
      };

      await supabase.from('products').update(updates).eq('id', p.id);
      logs.push(`✅ ${p.name} 修复完成 (1月: ${annual_1m.toFixed(2)}%)`);
      updatedCount++;
    }

    return NextResponse.json({ success: true, updatedCount, logs });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}