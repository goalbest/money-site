import { supabase } from "../../../lib/supabase";
import Link from "next/link";
import NavChart from "./NavChart";
import MetricsPanel from "./MetricsPanel";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if (!product) return <div className="p-8 text-center text-gray-500">没有找到该产品</div>;

  const { data: history } = await supabase
    .from("nav_history")
    .select("nav_date, unit_nav, accum_nav")
    .eq("product_id", productId)
    .order("nav_date", { ascending: true });

  const navList = history || [];

  // 区间统计（用于指标卡底部）
  let maxNav = null;
  let minNav = null;
  if (navList.length > 0) {
    const navs = navList.map(n => Number(n.unit_nav)).filter(n => !isNaN(n));
    maxNav = Math.max(...navs);
    minNav = Math.min(...navs);
  }

  return (
    <main className="container mx-auto p-6 max-w-4xl">
      <Link href="/" className="text-blue-600 text-sm hover:underline mb-4 inline-block">
        ← 返回首页
      </Link>

      {/* 产品头部 + 指标卡 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-4">
        <h1 className="text-xl font-bold mb-2">{product.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
          <span>{product.bank}</span>
          {product.code && <span className="font-mono text-xs">编码 {product.code}</span>}
        </div>

        {/* 可切换指标卡 */}
        <MetricsPanel navList={navList} />
      </div>

      {/* 净值走势图 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-4">
        <h2 className="text-base font-semibold mb-4">历史净值走势</h2>
        {navList.length === 0 ? (
          <p className="text-gray-400 text-sm py-12 text-center">暂无净值历史数据</p>
        ) : (
          <>
            <NavChart data={navList} />
            <div className="grid grid-cols-3 gap-3 mt-4 text-center text-xs text-gray-500">
              <div>
                <div className="text-gray-400 mb-1">最高净值</div>
                <div className="font-mono text-gray-900">{maxNav?.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">最低净值</div>
                <div className="font-mono text-gray-900">{minNav?.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">数据天数</div>
                <div className="font-mono text-gray-900">{navList.length} 天</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 净值明细表 */}
      {navList.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-base font-semibold">净值明细</h2>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">日期</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">单位净值</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">累计净值</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">日涨跌</th>
                </tr>
              </thead>
              <tbody>
                {[...navList].reverse().map((n, i) => {
                  const originalIdx = navList.length - 1 - i;
                  const prev = originalIdx > 0 ? navList[originalIdx - 1] : null;
                  const change = prev && Number(prev.unit_nav) > 0
                    ? ((Number(n.unit_nav) - Number(prev.unit_nav)) / Number(prev.unit_nav)) * 100
                    : null;

                  return (
                    <tr key={n.nav_date} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">{n.nav_date}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono">
                        {Number(n.unit_nav).toFixed(4)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono text-gray-500">
                        {n.accum_nav ? Number(n.accum_nav).toFixed(4) : "—"}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right font-mono ${change != null && change > 0 ? "text-red-500" : change != null && change < 0 ? "text-green-600" : "text-gray-400"}`}>
                        {change != null ? `${change > 0 ? "+" : ""}${change.toFixed(3)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}