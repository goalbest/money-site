import { supabase } from "../../../lib/supabase";
import Link from "next/link";
import NavChart from "./NavChart";
import MetricsPanel from "./MetricsPanel";
import TransactionList from "./TransactionList";
import BackButton from "../../components/BackButton";
import { getBankInfo } from "../../../lib/banks";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">没有找到该产品</div>
      </div>
    );
  }

  const { data: history } = await supabase
    .from("nav_history")
    .select("nav_date, unit_nav, accum_nav")
    .eq("product_id", productId)
    .order("nav_date", { ascending: true });

  const navList = history || [];

  let maxNav: number | null = null;
  let minNav: number | null = null;
  if (navList.length > 0) {
    const navs = navList.map(n => Number(n.unit_nav)).filter(n => !isNaN(n));
    maxNav = Math.max(...navs);
    minNav = Math.min(...navs);
  }

  const bankInfo = getBankInfo(product.bank);
  const latest = navList.length > 0 ? navList[navList.length - 1] : null;
  const latestNav = latest ? Number(latest.unit_nav) : null;
  const latestDate = latest?.nav_date || null;

  /* 最近 30 天涨跌 */
  let monthlyChange: number | null = null;
  if (navList.length >= 2) {
    const last = Number(navList[navList.length - 1].unit_nav);
    const refIdx = Math.max(0, navList.length - 31);
    const ref = Number(navList[refIdx].unit_nav);
    if (ref > 0) monthlyChange = ((last - ref) / ref) * 100;
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-6 max-w-3xl">

        {/* 顶部返回 + 标题 */}
        <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
          <BackButton fallback="/discover" />
          <div>
            <div className="text-[20px] font-bold tracking-tight text-slate-900">
              产品详情
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              净值走势 · 交易记录
            </div>
          </div>
        </div>

        {/* ============ 产品信息卡 ============ */}
        <div className="card p-5 mb-4 animate-fade-in-up delay-1">
          {/* 银行徽章 + 产品名 + 编码 */}
          <div className="flex items-start gap-3 mb-4">
            <span
              className="flex-shrink-0 rounded-lg flex items-center justify-center
                         font-bold"
              style={{
                background: bankInfo.bg,
                color: bankInfo.color,
                width: 34,
                height: 34,
                fontSize: 14,
              }}
            >
              {bankInfo.label}
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-bold text-slate-900 leading-snug">
                {product.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                <span className="text-[11px] text-slate-500 font-medium">
                  {product.bank}
                </span>
                {product.code && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {product.code}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 当前净值概览 */}
          {latestNav != null && (
            <div className="grid grid-cols-3 gap-3 py-4 border-t divider">
              <div>
                <div className="text-[10px] text-slate-400 mb-1">最新净值</div>
                <div className="text-[18px] font-bold font-mono text-slate-900 tabular leading-none">
                  {latestNav.toFixed(4)}
                </div>
                {latestDate && (
                  <div className="text-[10px] text-slate-400 mt-1.5 tabular">
                    {latestDate}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">近 30 天</div>
                <div className={`text-[18px] font-bold font-mono tabular leading-none ${
                  monthlyChange == null ? "text-slate-400"
                  : monthlyChange > 0 ? "text-rose-500"
                  : monthlyChange < 0 ? "text-emerald-500"
                  : "text-slate-700"
                }`}>
                  {monthlyChange == null
                    ? "—"
                    : `${monthlyChange >= 0 ? "+" : ""}${monthlyChange.toFixed(2)}%`}
                </div>
                {navList.length >= 2 && (
                  <div className="text-[10px] text-slate-400 mt-1.5">按净值计算</div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">数据天数</div>
                <div className="text-[18px] font-bold font-mono text-slate-900 tabular leading-none">
                  {navList.length}
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5">天</div>
              </div>
            </div>
          )}

          {/* 指标面板（保留原组件，下一轮重写它的样式） */}
          <div className="pt-4 border-t divider">
            <MetricsPanel navList={navList} />
          </div>
        </div>

        {/* ============ 净值走势卡 ============ */}
        <div className="card p-5 mb-4 animate-fade-in-up delay-2">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-bold text-slate-900">
              历史净值走势
            </div>
            {navList.length > 0 && (
              <div className="text-[11px] text-slate-400 tabular">
                {navList.length} 天数据
              </div>
            )}
          </div>

          {navList.length === 0 ? (
            <div className="py-16 text-center text-slate-300 text-xs">
              暂无净值历史数据
            </div>
          ) : (
            <>
              <NavChart data={navList} />

              {/* 最高/最低/天数 */}
              <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t divider">
                <div className="text-center">
                  <div className="text-[10px] text-slate-400 mb-1.5">最高净值</div>
                  <div className="font-mono text-[14px] font-semibold text-rose-500 tabular">
                    {maxNav?.toFixed(4)}
                  </div>
                </div>
                <div className="text-center border-x divider">
                  <div className="text-[10px] text-slate-400 mb-1.5">最低净值</div>
                  <div className="font-mono text-[14px] font-semibold text-emerald-500 tabular">
                    {minNav?.toFixed(4)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-slate-400 mb-1.5">数据天数</div>
                  <div className="font-mono text-[14px] font-semibold text-slate-700 tabular">
                    {navList.length}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ============ 我的交易记录 ============ */}
        <div className="card p-5 mb-4 animate-fade-in-up delay-3">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-bold text-slate-900">
              我的交易记录
            </div>
          </div>
          <TransactionList productId={productId} />
        </div>

        {/* ============ 净值明细表 ============ */}
        {navList.length > 0 && (
          <div className="card overflow-hidden animate-fade-in-up delay-4">
            <div className="px-5 py-4 border-b divider flex items-center justify-between">
              <div className="text-[15px] font-bold text-slate-900">
                净值明细
              </div>
              <div className="text-[11px] text-slate-400">
                最近 {Math.min(navList.length, 100)} 条
              </div>
            </div>

            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 tracking-wider">
                      日期
                    </th>
                    <th className="px-3 py-3 text-right text-[10px] font-semibold text-slate-500 tracking-wider">
                      单位净值
                    </th>
                    <th className="px-3 py-3 text-right text-[10px] font-semibold text-slate-500 tracking-wider">
                      累计净值
                    </th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-slate-500 tracking-wider">
                      日涨跌
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...navList].reverse().slice(0, 100).map((n, i) => {
                    const originalIdx = navList.length - 1 - i;
                    const prev = originalIdx > 0 ? navList[originalIdx - 1] : null;
                    const change =
                      prev && Number(prev.unit_nav) > 0
                        ? ((Number(n.unit_nav) - Number(prev.unit_nav)) /
                            Number(prev.unit_nav)) *
                          100
                        : null;

                    return (
                      <tr
                        key={n.nav_date}
                        className="border-b divider last:border-b-0 hover:bg-slate-50 transition-colors duration-150"
                      >
                        <td className="px-5 py-2.5 text-[12px] text-slate-700 tabular">
                          {n.nav_date}
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-right font-mono font-semibold text-slate-900 tabular">
                          {Number(n.unit_nav).toFixed(4)}
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-right font-mono text-slate-500 tabular">
                          {n.accum_nav ? Number(n.accum_nav).toFixed(4) : "—"}
                        </td>
                        <td
                          className={`px-5 py-2.5 text-[12px] text-right font-mono font-semibold tabular ${
                            change != null && change > 0
                              ? "text-rose-500"
                              : change != null && change < 0
                              ? "text-emerald-500"
                              : "text-slate-400"
                          }`}
                        >
                          {change != null
                            ? `${change > 0 ? "+" : ""}${change.toFixed(3)}%`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}