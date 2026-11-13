import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST() {
  try {
    const { data: stocks, error } = await supabase.from('fund_stocks').select('*').eq('type', 'stock');
    if (error) throw error;
    
    for (const stock of stocks) {
      let marketCode = /^6/.test(stock.code) ? `sh${stock.code}` : `sz${stock.code}`;
      // 加上时间戳防止缓存
      const res = await fetch(`http://qt.gtimg.cn/q=${marketCode}&_t=${Date.now()}`);
      const text = await res.text();
      const match = text.match(/="([^"]+)"/);
      if (!match) continue;
      
      const fields = match[1].split('~');
      const currentPrice = parseFloat(fields[3]);
      const prevPrice = parseFloat(fields[4]);
      
      if (!isNaN(currentPrice) && currentPrice > 0) {
        // 更新主表
        await supabase.from('fund_stocks').update({
          current_price: currentPrice,
          prev_price: prevPrice,
          nav_date: new Date().toISOString().split('T')[0]
        }).eq('id', stock.id);
        
        // 更新或插入当天的历史记录
        await supabase.from('fund_stock_history').upsert({
          product_id: stock.id,
          nav_date: new Date().toISOString().split('T')[0],
          price: currentPrice
        }, { onConflict: 'product_id, nav_date' });
      }
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}