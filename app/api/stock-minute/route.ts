import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  try {
    const marketCode = /^6/.test(code) ? `sh${code}` : `sz${code}`;
    // 腾讯分时数据接口
    const url = `http://data.gtimg.cn/flashdata/hushen/minute/${marketCode}.js?t=${Date.now()}`;
    
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();

    // 解析返回格式: min_data_sh600673="date:231113\n0930 23.33 1125\n0931 23.40 1200\n..."
    const match = text.match(/="([\s\S]+)"/);
    if (!match) throw new Error('解析失败');

    const lines = match[1].split('\\n');
    const data = [];
    
    // 从第二行开始，第一行是日期
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(' ');
      if (parts.length >= 2) {
        const time = parts[0]; // 例如 "0930"
        const price = parseFloat(parts[1]); // 价格
        data.push({
          time: `${time.slice(0, 2)}:${time.slice(2, 4)}`, // 格式化 "09:30"
          price
        });
      }
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}