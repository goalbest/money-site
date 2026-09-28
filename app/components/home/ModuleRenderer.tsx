"use client";

import Link from "next/link";
import { MODULE_MAP } from "../../../lib/homeModules";
import type { HomeMetrics, AlertItem, Holding, BankSlice } from "../../../lib/homeMetrics";
import { getBankInfo } from "../../../lib/banks";
import CollapsibleCard from "./CollapsibleCard";

/* ============================================================
   格式化工具
   ============================================================ */
function fmtMoney(n: number): string {
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtPercent(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function profitColor(n: number): string {
  if (n > 0) return "text-rose-500";
  if (n < 0) return "text-emerald-500";
  return "text-slate-400";
}

/* ============================================================
   公共小组件
   ============================================================ */
function MoreLink({ href, text }: { href: string; text: string }) {
  return (
    <Link
      href={href}
      className="text-[12px] text-purple-600 font-medium
                 hover:text-purple-700 flex items-center gap-0.5"
    >
      {text}
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function Empty({ text, action }: { text: string; action?: { href: string; label: string } }) {
  return (
    <div className="px-5 py-8 text-center">
      <div className="text-slate-300 text-[12px] mb-3">{text}</div>
      {action && (
        <Link href={action.href} className="btn-primary inline-block text-[11px] px-5 py-2">
          {action.label}
        </Link>
      )}
    </div>
  );
}

function ValueBlock({
  label,
  value,
  color = "text-slate-900",
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="px-5 py-5">
      <div className="text-[11px] text-slate-500 mb-1.5">{label}</div>
      <div className={`font-mono font-bold text-[28px] tabular leading-none ${color}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-400 mt-2">{sub}</div>}
    </div>
  );
}

/* ============================================================
   列表渲染
   ============================================================ */
function HoldingsContent({ m }: { m: HomeMetrics }) {
  const list = m.topHoldings.slice(0, 5);
  if (m.count === 0) {
    return <Empty text="还没有持仓" action={{ href: "/add", label: "添加第一笔" }} />;
  }
  return (
    <div>
      {list.map((h: Holding) => {
        const p = h.products;
        if (!p) return null;
        const info = getBankInfo(p.bank);
        const hold = Number(h.holding_amount || 0);
        const today = (hold * Number(p.daily_return || 0)) / 10000;
        return (
          <Link
            key={h.id}
            href={`/holdings/${h.id}`}
            className="flex items-center gap-3 px-5 py-3.5
                       hover:bg-slate-50 border-t divider
                       transition-colors duration-200"
          >
            <span className="bank-avatar flex-shrink-0"
                  style={{ background: info.bg, color: info.color }}>
              {info.label}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-slate-900 font-medium truncate">{p.name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">{p.bank}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-mono font-bold text-[13px] text-slate-900 tabular">
                {fmtMoney(hold)}
              </div>
              <div className={`text-[10px] font-mono tabular mt-0.5 ${profitColor(today)}`}>
                {today >= 0 ? "+" : ""}{today.toFixed(2)}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function TopTodayContent({ m }: { m: HomeMetrics }) {
  const list = m.topToday.slice(0, 5);
  if (list.length === 0) return <Empty text="今日暂无收益数据" />;
  return (
    <div>
      {list.map((h, i) => {
        const p = h.products;
        if (!p) return null;
        const info = getBankInfo(p.bank);
        return (
          <Link
            key={h.id}
            href={`/holdings/${h.id}`}
            className="flex items-center gap-3 px-5 py-3.5
                       hover:bg-slate-50 border-t divider
                       transition-colors duration-200"
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center
                              text-[11px] font-bold flex-shrink-0 ${
              i === 0 ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white"
              : i === 1 ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
              : i === 2 ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white"
              : "bg-slate-100 text-slate-500"
            }`}>{i + 1}</span>
            <span className="bank-avatar flex-shrink-0"
                  style={{ background: info.bg, color: info.color }}>
              {info.label}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-slate-900 font-medium truncate">{p.name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">{p.bank}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-mono font-bold text-[14px] text-rose-500 tabular">
                +{h.todayProfit.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5 tabular">
                +{h.rate.toFixed(2)}%
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ============================================================
   榜单列表（拆分后共用）
   ============================================================ */
type RankType = "profit" | "hot" | "new";

function RankList({
  items,
  loading,
  type,
  onLinkClick,
}: {
  items: any[];
  loading: boolean;
  type: RankType;
  onLinkClick?: (e: React.MouseEvent) => void;
}) {
  if (loading) {
    return (
      <div className="px-5 py-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <Empty text="暂无数据" />;
  }

  if (type === "hot") {
    return (
      <div>
        {items.slice(0, 5).map((h, i) => (
          <div
            key={`${i}-${h.keyword}`}
            className="flex items-center gap-3 px-5 py-3 border-t divider first:border-t-0"
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center
                              text-[11px] font-bold flex-shrink-0 ${
              i === 0 ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white"
              : i === 1 ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
              : i === 2 ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white"
              : "bg-slate-100 text-slate-500"
            }`}>{i + 1}</span>
            <span className="flex-1 text-[13px] text-slate-900 font-medium truncate">
              {h.keyword}
            </span>
            <span className="text-[11px] text-slate-400 tabular flex-shrink-0">{h.count} 次</span>
          </div>
        ))}
      </div>
    );
  }

  // profit / new
  return (
    <div>
      {items.slice(0, 5).map((p, i) => {
        const info = getBankInfo(p.bank);
        const isProfit = type === "profit";
        const mainValue = isProfit
          ? (Number(p.annualized_1m) > 0 ? `+${Number(p.annualized_1m).toFixed(2)}%` : "—")
          : (p.unit_nav != null ? Number(p.unit_nav).toFixed(4) : "—");
        const mainLabel = isProfit ? "近 1 月年化" : "最新净值";
        const mainColor = isProfit ? "text-rose-500" : "text-slate-700";

        return (
          <Link
            key={p.id}
            href={`/product/${p.id}`}
            onClick={onLinkClick}
            className="flex items-center gap-3 px-5 py-3.5
                       hover:bg-slate-50 border-t divider
                       transition-colors duration-200"
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center
                              text-[11px] font-bold flex-shrink-0 ${
              i === 0 ? "bg-gradient-to-br from-rose-500 to-pink-600 text-white"
              : i === 1 ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
              : i === 2 ? "bg-gradient-to-br from-yellow-400 to-amber-400 text-white"
              : "bg-slate-100 text-slate-500"
            }`}>{i + 1}</span>
            <span className="bank-avatar flex-shrink-0"
                  style={{ background: info.bg, color: info.color }}>
              {info.label}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-slate-900 font-medium truncate">
                {p.name}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                {p.bank}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`font-mono font-bold text-[14px] tabular ${mainColor}`}>
                {mainValue}
              </div>
              <div className="text-[9px] text-slate-400 mt-0.5">{mainLabel}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ============================================================
   告警 / 分布 / 其他
   ============================================================ */
function AlertList({
  items,
  emptyText,
  href = "/holdings",
}: {
  items: AlertItem[];
  emptyText: string;
  href?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="px-5 py-6 text-center text-[12px] text-slate-400">
        {emptyText}
      </div>
    );
  }
  return (
    <div>
      {items.slice(0, 5).map((it) => {
        const info = getBankInfo(it.bank);
        const positive = it.value > 0;
        return (
          <Link
            key={it.holdingId}
            href={href}
            className="flex items-center gap-3 px-5 py-3
                       hover:bg-slate-50 border-t divider
                       transition-colors duration-200"
          >
            <span className="bank-avatar flex-shrink-0"
                  style={{ background: info.bg, color: info.color }}>
              {info.label}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-slate-900 font-medium truncate">
                {it.name}
              </div>
              {it.reason && (
                <div className="text-[10px] text-slate-400 mt-0.5">{it.reason}</div>
              )}
            </div>
            <div className="font-mono font-bold text-[14px] tabular flex-shrink-0">
              <span className={positive ? "text-rose-500" : "text-emerald-500"}>
                {positive ? "+" : ""}{it.value.toFixed(2)}{it.unit}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function DistributionContent({ m }: { m: HomeMetrics }) {
  const slices = m.assetDistribution.slice(0, 5);
  if (slices.length === 0) return <Empty text="暂无持仓分布" />;
  return (
    <div className="px-5 py-4 space-y-3">
      {slices.map((s: BankSlice) => {
        const info = getBankInfo(s.bank);
        return (
          <div key={s.bank}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="bank-avatar flex-shrink-0"
                      style={{ background: info.bg, color: info.color }}>
                  {info.label}
                </span>
                <span className="text-[12px] text-slate-700 font-medium truncate">
                  {s.bank}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 tabular flex-shrink-0 ml-2">
                {s.percent.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${s.percent}%`, background: info.bar }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlaceholderContent({
  icon, title, desc, href, hrefLabel,
}: {
  icon: string; title: string; desc: string; href: string; hrefLabel: string;
}) {
  return (
    <div className="px-5 py-6 text-center">
      <div className="text-[28px] mb-2">{icon}</div>
      <div className="text-[13px] text-slate-700 font-medium mb-1">{title}</div>
      <div className="text-[11px] text-slate-400 mb-4">{desc}</div>
      <Link
        href={href}
        className="text-[12px] text-purple-600 font-medium
                   px-4 py-2 rounded-full bg-purple-50
                   hover:bg-purple-100 active:scale-95
                   transition-all inline-block"
      >
        {hrefLabel}
      </Link>
    </div>
  );
}

/* ============================================================
   主组件
   ============================================================ */
type Props = {
  id: string;
  metrics: HomeMetrics;
  rankData?: {
    profit: any[];
    hot: any[];
    new: any[];
    loading: boolean;
  };
  onLinkClick?: (e: React.MouseEvent) => void;
};

export default function ModuleRenderer({ id, metrics: m, rankData, onLinkClick, onTitleLongPress }: Props) {
  const meta = MODULE_MAP[id];
  if (!meta) return null;

    const wrapper = (
    title: string,
    count: string | number | undefined,
    body: React.ReactNode,
    extra?: React.ReactNode
  ) => (
    <CollapsibleCard
      id={id}
      title={title}
      icon={meta.icon}
      count={count}
      extra={extra}
      onTitleLongPress={onTitleLongPress}
    >
      {body}
    </CollapsibleCard>
  );

  type Props = {
  id: string;
  metrics: HomeMetrics;
  rankData?: { profit: any[]; hot: any[]; new: any[]; loading: boolean };
  onLinkClick?: (e: React.MouseEvent) => void;
  onTitleLongPress?: () => void;   // ★ 加这行
};


  switch (id) {
    /* ---------- 数据展示 ---------- */
    case "holdings":
      return wrapper(
        "我的持仓",
        m.count > 0 ? `${m.count} 个` : undefined,
        <HoldingsContent m={m} />,
        <MoreLink href="/holdings" text="全部" />
      );

    case "topToday":
      return wrapper(
        "今日收益榜",
        m.topToday.length > 0 ? `${m.topToday.length} 个` : undefined,
        <TopTodayContent m={m} />,
        <MoreLink href="/holdings" text="全部" />
      );

    /* ★ 三合一拆分：3 个独立榜单 */
    case "profitRank":
      return wrapper(
        "收益榜",
        rankData && !rankData.loading ? `${rankData.profit.length}` : undefined,
        <RankList
          items={rankData?.profit || []}
          loading={rankData?.loading ?? true}
          type="profit"
          onLinkClick={onLinkClick}
        />,
        <MoreLink href="/discover?tab=profit" text="全部" />
      );

    case "hotRank":
      return wrapper(
        "热度榜",
        rankData && !rankData.loading ? `${rankData.hot.length}` : undefined,
        <RankList
          items={rankData?.hot || []}
          loading={rankData?.loading ?? true}
          type="hot"
          onLinkClick={onLinkClick}
        />,
        <MoreLink href="/discover?tab=hot" text="全部" />
      );

    case "newRank":
      return wrapper(
        "新品榜",
        rankData && !rankData.loading ? `${rankData.new.length}` : undefined,
        <RankList
          items={rankData?.new || []}
          loading={rankData?.loading ?? true}
          type="new"
          onLinkClick={onLinkClick}
        />,
        <MoreLink href="/discover?tab=new" text="全部" />
      );

    case "recentTx":
      return wrapper(
        "最近交易",
        undefined,
        <div className="px-5 py-6 text-center">
          <div className="text-[12px] text-slate-400 mb-3">最近 90 天交易</div>
          <Link href="/transactions" className="text-[12px] text-purple-600 font-medium">
            打开交易记录 →
          </Link>
        </div>
      );

    /* ---------- 智能提醒 ---------- */
    case "abnormalDrop":
      return wrapper("异常波动", m.abnormalDrops.length || undefined,
        <AlertList items={m.abnormalDrops} emptyText="所有产品表现正常" />);

    case "newHigh":
      return wrapper("创新高", m.newHighs.length || undefined,
        <AlertList items={m.newHighs} emptyText="暂无产品创新高" />);

    case "idleLong":
      return wrapper("长期未动", m.idleLongs.length || undefined,
        <AlertList items={m.idleLongs} emptyText="所有产品都在活跃持有" />);

    case "streakWin":
      return wrapper("持续跑赢", m.streakWins.length || undefined,
        <AlertList items={m.streakWins} emptyText="暂无连涨产品" />);

    case "takeProfit":
      return wrapper("止盈提示", m.takeProfits.length || undefined,
        <AlertList items={m.takeProfits} emptyText="暂无需要止盈的产品" />);

    case "stopLoss":
      return wrapper("止损提示", m.stopLosses.length || undefined,
        <AlertList items={m.stopLosses} emptyText="没有亏损超 3% 的产品" />);

    /* ---------- 分析洞察 ---------- */
    case "assetDistribution":
      return wrapper("资产分布", m.assetDistribution.length ? `${m.assetDistribution.length} 家` : undefined,
        <DistributionContent m={m} />,
        <MoreLink href="/holdings" text="详情" />);

    case "concentration":
      return wrapper("集中度分析", undefined,
        m.topBank ? (
          <ValueBlock
            label="最大持仓占比"
            value={`${m.topBank.percent.toFixed(1)}%`}
            color={m.topBank.percent > 50 ? "text-amber-500" : "text-slate-900"}
            sub={m.topBank.percent > 50
              ? `⚠️ ${m.topBank.bank} 占比超 50%，建议分散`
              : m.topBank.bank}
          />
        ) : <Empty text="暂无持仓" />);

    case "beatDeposit":
      return wrapper("跑赢存款", undefined,
        <ValueBlock
          label="vs 3 年定存（1.45%）"
          value={`${m.beatDeposit.diff >= 0 ? "+" : ""}${m.beatDeposit.diff.toFixed(2)}%`}
          color={m.beatDeposit.positive ? "text-rose-500" : "text-emerald-500"}
          sub={`你的年化 ${m.myAnnual.toFixed(2)}%`}
        />);

    case "beatInflation":
      return wrapper("跑赢通胀", undefined,
        <ValueBlock
          label="vs 通胀（0.3%）"
          value={`${m.beatInflation.diff >= 0 ? "+" : ""}${m.beatInflation.diff.toFixed(2)}%`}
          color={m.beatInflation.positive ? "text-rose-500" : "text-emerald-500"}
          sub={`你的实际收益 ${m.beatInflation.diff.toFixed(2)}%`}
        />);

    case "bestWorst":
      return wrapper("最佳 / 最差", undefined,
        <div className="grid grid-cols-2 divide-x divide-slate-100">
          <div className="px-5 py-5">
            <div className="text-[10px] text-slate-400 mb-1.5">最佳</div>
            {m.bestProduct ? (
              <>
                <div className="font-mono font-bold text-[20px] text-rose-500 tabular">
                  {fmtPercent(m.bestProduct.rate)}
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-1">
                  {m.bestProduct.name}
                </div>
              </>
            ) : <div className="text-slate-300 text-[12px]">—</div>}
          </div>
          <div className="px-5 py-5">
            <div className="text-[10px] text-slate-400 mb-1.5">最差</div>
            {m.worstProduct ? (
              <>
                <div className="font-mono font-bold text-[20px] text-emerald-500 tabular">
                  {fmtPercent(m.worstProduct.rate)}
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-1">
                  {m.worstProduct.name}
                </div>
              </>
            ) : <div className="text-slate-300 text-[12px]">—</div>}
          </div>
        </div>);

    case "monthStats":
      return wrapper("本月统计", undefined,
        <div className="grid grid-cols-2 divide-x divide-slate-100">
          <div className="px-5 py-5">
            <div className="text-[10px] text-slate-400 mb-1.5">买入</div>
            <div className="font-mono font-bold text-[16px] text-slate-900 tabular">
              ¥{fmtMoney(m.monthBuyAmount)}
            </div>
          </div>
          <div className="px-5 py-5">
            <div className="text-[10px] text-slate-400 mb-1.5">卖出</div>
            <div className="font-mono font-bold text-[16px] text-slate-900 tabular">
              ¥{fmtMoney(m.monthSellAmount)}
            </div>
          </div>
        </div>);

    case "monthProfit":
      return wrapper("本月收益", undefined,
        <ValueBlock
          label="当月累计"
          value={`${m.monthProfit >= 0 ? "+" : ""}${fmtMoney(m.monthProfit)}`}
          color={profitColor(m.monthProfit)}
          sub={`${m.todayProfit >= 0 ? "+" : ""}${m.todayProfit.toFixed(2)} 今日`}
        />);

    case "navStale":
      return wrapper("净值更新", m.navStaleCount || undefined,
        m.navStaleCount > 0 ? (
          <AlertList
            items={m.topHoldings.slice(0, m.navStaleCount).map((h) => ({
              holdingId: h.id,
              productId: h.product_id,
              name: h.products?.name || "",
              bank: h.products?.bank || "",
              value: 0,
              unit: "",
              reason: `净值更新至 ${h.products?.nav_date || "未知"}`,
            }))}
            emptyText=""
          />
        ) : (
          <div className="px-5 py-6 text-center text-[12px] text-slate-400">
            所有净值都是最新的
          </div>
        ));

    /* ---------- 计划 / 快捷 ---------- */
    case "goal":
      return wrapper("目标进度", undefined,
        <PlaceholderContent icon="🎯" title="还没有设置目标"
          desc="设置一个存款或收益目标，实时跟踪完成度"
          href="/profile" hrefLabel="去设置" />);

    case "dca":
      return wrapper("定投计划", undefined,
        <PlaceholderContent icon="💰" title="还没有定投计划"
          desc="每月自动买入，养成理财习惯"
          href="/add" hrefLabel="创建定投" />);

    case "quickAdd":
      return wrapper("一键加仓", undefined,
        <div className="px-5 py-6 text-center">
          <Link href="/add" className="btn-primary inline-block text-[13px] px-8 py-3">
            + 添加产品
          </Link>
        </div>);

    case "quickRefresh":
      return wrapper("刷新净值", undefined,
        <div className="px-5 py-6 text-center">
          <button onClick={() => window.location.reload()}
                  className="btn-secondary text-[13px] px-6 py-3">
            刷新页面
          </button>
        </div>);

    case "assetTrend":
      return wrapper("资产走势", undefined,
        <div className="px-5 py-8 text-center">
          <div className="text-[13px] text-slate-500 mb-3">
            需要"每日资产快照"功能才能展示
          </div>
          <div className="text-[11px] text-slate-400">敬请期待</div>
        </div>);

    case "hotSearch":
      return wrapper("热度榜", undefined,
        <div className="px-5 py-6 text-center">
          <Link href="/discover?tab=hot" className="text-[12px] text-purple-600 font-medium">
            打开热度榜 →
          </Link>
        </div>);

    default:
      return wrapper(meta.name, undefined,
        <div className="px-5 py-6 text-center text-[12px] text-slate-400">
          {meta.desc}
        </div>);
  }
}