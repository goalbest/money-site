"use client";

import Link from "next/link";
import { MODULE_MAP } from "../../../lib/homeModules";
import type { HomeMetrics, AlertItem, Holding, BankSlice } from "../../../lib/homeMetrics";
import type { SnapData } from "../../../lib/useAssetSnapshots";
import { getBankInfo } from "../../../lib/banks";
import CollapsibleCard from "./CollapsibleCard";
import ScrollableList from "./ScrollableList";
import type { GoalsData } from "../../../lib/useGoals";
import type { DCAData } from "../../../lib/useDCAPlans";
import { WEEKDAY_LABELS } from "../../../lib/useDCAPlans";

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
function fmtDelta(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(2)}万`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${abs.toFixed(2)}`;
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
  label, value, color = "text-slate-900", sub,
}: {
  label: string; value: string; color?: string; sub?: string;
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
   资产走势折线图
   ============================================================ */
function TrendChart({ snapshots }: { snapshots: SnapData["snapshots"] }) {
  const data = snapshots.slice(-30);
  if (data.length < 2) return null;

  const w = 320;
  const h = 90;
  const padX = 4;
  const padY = 8;

  const amounts = data.map(d => d.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const range = max - min || 1;

  const stepX = (w - padX * 2) / (data.length - 1);
  const coords = data.map((d, i) => ({
    x: padX + i * stepX,
    y: h - padY - ((d.amount - min) / range) * (h - padY * 2),
  }));

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${h} L ${coords[0].x.toFixed(1)} ${h} Z`;

  const positive = data[data.length - 1].amount >= data[0].amount;
  const stroke = positive ? "#f43f5e" : "#10b981";

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: h }}
    >
      <defs>
        <linearGradient id={`trendGrad-${positive ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.15" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#trendGrad-${positive ? "up" : "down"})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r="3"
        fill={stroke}
        stroke="#ffffff"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/* ============================================================
   资产走势内容
   ============================================================ */
function AssetTrendContent({ m, snap }: { m: HomeMetrics; snap: SnapData }) {
  if (snap.snapshots.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <div className="text-[13px] text-slate-500 mb-3">还在攒数据</div>
        <div className="text-[11px] text-slate-400 leading-relaxed">
          今天已开始记录，明天再来看就能看到走势图
        </div>
      </div>
    );
  }

  if (snap.snapshots.length === 1) {
    return (
      <div className="px-5 py-8 text-center">
        <div className="text-[12px] text-slate-500 mb-2">
          已记录 <span className="font-mono font-bold text-slate-900">1</span> 天
        </div>
        <div className="text-[11px] text-slate-400 leading-relaxed">
          明天再来看，就有对比了
        </div>
      </div>
    );
  }

  const today = snap.snapshots[snap.snapshots.length - 1];
  const first = snap.snapshots[0];
  const totalDelta = today.amount - first.amount;
  const totalPercent = first.amount > 0 ? (totalDelta / first.amount) * 100 : 0;

  return (
    <div>
      <div className="px-5 pt-4 pb-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] text-slate-400 mb-1">当前资产</div>
          <div className="font-mono font-bold text-[15px] text-slate-900 tabular">
            {fmtMoney(today.amount)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 mb-1">近 7 天</div>
          <div className={`font-mono font-bold text-[15px] tabular ${
            snap.has7d ? profitColor(snap.trend7d) : "text-slate-400"
          }`}>
            {snap.has7d ? fmtDelta(snap.trend7d) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 mb-1">近 30 天</div>
          <div className={`font-mono font-bold text-[15px] tabular ${
            snap.has30d ? profitColor(snap.trend30d) : "text-slate-400"
          }`}>
            {snap.has30d ? fmtDelta(snap.trend30d) : "—"}
          </div>
        </div>
      </div>

      <div className="px-3">
        <TrendChart snapshots={snap.snapshots} />
      </div>

      <div className="px-5 pb-4 pt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span className="tabular">{first.date.slice(5)}</span>
        <span className="tabular">
          共 {snap.snapshots.length} 天 · 累计 {fmtPercent(totalPercent)}
        </span>
        <span className="tabular">{today.date.slice(5)}</span>
      </div>
    </div>
  );
}

/* ============================================================
   列表内容
   ============================================================ */

/** 我的持仓 */
function HoldingsContent({ m }: { m: HomeMetrics }) {
  return (
    <ScrollableList
      items={m.topHoldings}
      visibleCount={5}
      itemHeight={62}
      initialCount={20}
      pageSize={20}
      empty={<Empty text="还没有持仓" action={{ href: "/add", label: "添加第一笔" }} />}
      renderItem={(h: Holding) => {
        const p = h.products;
        if (!p) return null;
        const info = getBankInfo(p.bank);
        const hold = Number(h.holding_amount || 0);
        const today = (hold * Number(p.daily_return || 0)) / 10000;
        return (
          <Link
            key={h.id}
            href={`/product/${h.product_id}`}
            className="flex items-center gap-3 px-5 py-3
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
      }}
    />
  );
}

/** 今日收益榜 */
function TopTodayContent({ m }: { m: HomeMetrics }) {
  return (
    <ScrollableList
      items={m.topToday}
      visibleCount={5}
      itemHeight={62}
      initialCount={20}
      pageSize={20}
      empty={<Empty text="今日暂无收益数据" />}
      renderItem={(h: any, i: number) => {
        const p = h.products;
        if (!p) return null;
        const info = getBankInfo(p.bank);
        return (
          <Link
            key={h.id}
            href={`/product/${h.product_id}`}
            className="flex items-center gap-3 px-5 py-3
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
              <div className={`font-mono font-bold text-[14px] tabular ${profitColor(h.todayProfit)}`}>
                {h.todayProfit >= 0 ? "+" : ""}{h.todayProfit.toFixed(2)}
              </div>
              <div className={`text-[10px] text-slate-400 font-mono mt-0.5 tabular ${profitColor(h.rate)}`}>
                {h.rate >= 0 ? "+" : ""}{h.rate.toFixed(2)}%
              </div>
            </div>
          </Link>
        );
      }}
    />
  );
}

/* ============================================================
   榜单列表
   ============================================================ */
type RankType = "profit" | "hot" | "new";

function RankList({
  items, loading, type, onLinkClick,
}: {
  items: any[]; loading: boolean; type: RankType;
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
  if (items.length === 0) return <Empty text="暂无数据" />;

  if (type === "hot") {
    return (
      <ScrollableList
        items={items}
        visibleCount={5}
        itemHeight={48}
        initialCount={20}
        pageSize={20}
        empty={<Empty text="暂无数据" />}
        renderItem={(h: any, i: number) => (
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
            <span className="flex-1 text-[13px] text-slate-900 font-medium truncate">{h.keyword}</span>
            <span className="text-[11px] text-slate-400 tabular flex-shrink-0">{h.count} 次</span>
          </div>
        )}
      />
    );
  }

  return (
    <ScrollableList
      items={items}
      visibleCount={5}
      itemHeight={62}
      initialCount={20}
      pageSize={20}
      empty={<Empty text="暂无数据" />}
      renderItem={(p: any, i: number) => {
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
            className="flex items-center gap-3 px-5 py-3
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
              <div className={`font-mono font-bold text-[14px] tabular ${mainColor}`}>{mainValue}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">{mainLabel}</div>
            </div>
          </Link>
        );
      }}
    />
  );
}

/* ============================================================
   告警列表
   ============================================================ */
function AlertList({
  items, emptyText, href = "/holdings",
}: {
  items: AlertItem[]; emptyText: string; href?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="px-5 py-6 text-center text-[12px] text-slate-400">
        {emptyText}
      </div>
    );
  }
  return (
    <ScrollableList
      items={items}
      visibleCount={5}
      itemHeight={56}
      initialCount={20}
      pageSize={20}
      empty={<div />}
      renderItem={(it: AlertItem) => {
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
              <div className="text-[13px] text-slate-900 font-medium truncate">{it.name}</div>
              {it.reason && <div className="text-[10px] text-slate-400 mt-0.5">{it.reason}</div>}
            </div>
            <div className="font-mono font-bold text-[14px] tabular flex-shrink-0">
              <span className={positive ? "text-rose-500" : "text-emerald-500"}>
                {positive ? "+" : ""}{it.value.toFixed(2)}{it.unit}
              </span>
            </div>
          </Link>
        );
      }}
    />
  );
}

/* ============================================================
   资产分布
   ============================================================ */
function DistributionContent({ m }: { m: HomeMetrics }) {
  return (
    <ScrollableList
      items={m.assetDistribution}
      visibleCount={5}
      itemHeight={48}
      initialCount={20}
      pageSize={20}
      empty={<Empty text="暂无持仓分布" />}
      renderItem={(s: BankSlice) => {
        const info = getBankInfo(s.bank);
        return (
          <div key={s.bank} className="px-5 py-2.5 border-t divider first:border-t-0">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="bank-avatar flex-shrink-0"
                      style={{ background: info.bg, color: info.color }}>
                  {info.label}
                </span>
                <span className="text-[12px] text-slate-700 font-medium truncate">{s.bank}</span>
              </div>
              <span className="text-[11px] text-slate-500 tabular flex-shrink-0 ml-2">
                {s.percent.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                   style={{ width: `${s.percent}%`, background: info.bar }} />
            </div>
          </div>
        );
      }}
    />
  );
}

/* ============================================================
   占位
   ============================================================ */
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
      <Link href={href}
        className="text-[12px] text-purple-600 font-medium
                   px-4 py-2 rounded-full bg-purple-50
                   hover:bg-purple-100 active:scale-95
                   transition-all inline-block">
        {hrefLabel}
      </Link>
    </div>
  );
}

/* ============================================================
   目标进度
   ============================================================ */
function GoalContent({ m, goals }: { m: HomeMetrics; goals?: GoalsData }) {
  if (!goals) return null;

  if (goals.goals.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl
                        bg-gradient-to-br from-violet-500 to-purple-600
                        flex items-center justify-center
                        shadow-lg shadow-purple-500/25">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </div>
        <div className="text-[13px] font-semibold text-slate-800 mb-1.5">
          还没有设置目标
        </div>
        <div className="text-[11px] text-slate-400 mb-5 leading-relaxed">
          设定一个存款或收益目标<br />实时跟踪完成度
        </div>
        <button
          onClick={() => goals.openModal()}
          className="btn-primary text-[12px] px-6 py-2.5"
        >
          + 创建第一个目标
        </button>
      </div>
    );
  }

  return (
    <div>
      {goals.goals.map((g) => {
        const p = goals.calcProgress(g);
        const isReached = p.reached;
        const percent = p.percent;
        const barColor = isReached
          ? "linear-gradient(90deg,#34d399,#059669)"
          : "linear-gradient(90deg,#6366f1,#a855f7,#ec4899)";

        return (
          <div key={g.id} className="px-5 py-4 border-t divider first:border-t-0">
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[14px] leading-none">
                  {isReached ? "🏆" : "🎯"}
                </span>
                <span className="text-[13px] font-semibold text-slate-900 truncate">
                  {g.name}
                </span>
                {isReached && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold
                                   bg-emerald-50 text-emerald-600 flex-shrink-0">
                    已完成
                  </span>
                )}
              </div>
              <button
                onClick={() => goals.openModal(g)}
                className="w-6 h-6 rounded-full hover:bg-slate-100
                           flex items-center justify-center flex-shrink-0
                           transition-colors"
                aria-label="编辑"
              >
                <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>

            <div className="mb-2.5">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${percent}%`, background: barColor }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 tabular">
                <span className="font-mono font-semibold text-slate-600">
                  {percent.toFixed(1)}%
                </span>
                <span className="font-mono">
                  {m.totalAssets.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                  {" / "}
                  {g.targetAmount.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
              {!isReached && p.remaining > 0 && (
                <span>
                  还差{" "}
                  <span className="font-mono font-semibold text-slate-700">
                    ¥{p.remaining.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                  </span>
                </span>
              )}
              {p.daysLeft != null && !isReached && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>
                    剩 <span className="font-mono font-semibold text-slate-700">{p.daysLeft}</span> 天
                  </span>
                </>
              )}
              {p.dailyNeeded != null && p.dailyNeeded > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>
                    日均需{" "}
                    <span className="font-mono font-semibold text-purple-600">
                      ¥{p.dailyNeeded.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="px-5 py-3 border-t divider flex gap-2">
        <button
          onClick={() => goals.openModal()}
          className="flex-1 py-2.5 rounded-full
                     bg-purple-50 text-purple-600 text-[12px] font-semibold
                     hover:bg-purple-100 active:scale-[0.98]
                     transition-all"
        >
          + 添加目标
        </button>
        {goals.goals.length > 0 && (
          <button
            onClick={() => {
              if (goals.goals.length === 1) {
                if (confirm(`删除目标「${goals.goals[0].name}」？`)) {
                  goals.remove(goals.goals[0].id);
                }
              } else {
                const names = goals.goals.map((g, i) => `${i + 1}. ${g.name}`).join("\n");
                const input = prompt(`输入要删除的编号：\n\n${names}`);
                const idx = Number(input) - 1;
                if (idx >= 0 && idx < goals.goals.length) {
                  if (confirm(`删除「${goals.goals[idx].name}」？`)) {
                    goals.remove(goals.goals[idx].id);
                  }
                }
              }
            }}
            className="px-4 py-2.5 rounded-full
                       bg-slate-50 text-slate-500 text-[12px] font-medium
                       hover:bg-slate-100 active:scale-[0.98]
                       transition-all"
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   定投计划
   ============================================================ */
function DCAContent({ dca }: { dca?: DCAData }) {
  if (!dca) return null;

  if (dca.plans.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl
                        bg-gradient-to-br from-violet-500 to-purple-600
                        flex items-center justify-center
                        shadow-lg shadow-purple-500/25">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-[13px] font-semibold text-slate-800 mb-1.5">
          还没有定投计划
        </div>
        <div className="text-[11px] text-slate-400 mb-5 leading-relaxed">
          每月自动买入，养成长期理财习惯
        </div>
        <button
          onClick={() => dca.openModal()}
          className="btn-primary text-[12px] px-6 py-2.5"
        >
          + 创建定投
        </button>
      </div>
    );
  }

  const monthly = dca.monthlyTotal();

  return (
    <div>
      <div className="px-5 py-3 bg-gradient-to-r from-violet-50 to-purple-50/50 border-b divider">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">每月总投入</span>
          <span className="font-mono font-bold text-[14px] text-purple-600 tabular">
            ¥{monthly.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {dca.plans.map((plan) => {
        const days = dca.daysUntil(plan.nextDate);
        const isSoon = days <= 3 && plan.enabled;
        const info = getBankInfo(plan.bank);

        const freqText = (() => {
          if (plan.frequency === "daily") return "每天";
          if (plan.frequency === "monthly") return `每月 ${plan.dayOfMonth} 号`;
          if (plan.frequency === "weekly")
            return `每周${WEEKDAY_LABELS[plan.weekday ?? 1]}`;
          if (plan.frequency === "biweekly")
            return `每两周 周${WEEKDAY_LABELS[plan.weekday ?? 1]}`;
          return "";
        })();

        return (
          <div
            key={plan.id}
            className={`px-5 py-4 border-t divider first:border-t-0
                        ${!plan.enabled ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-2.5 mb-2">
              <span
                className="bank-avatar flex-shrink-0 mt-0.5"
                style={{ background: info.bg, color: info.color }}
              >
                {info.label}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-slate-900 truncate">
                  {plan.productName}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {plan.bank}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-mono font-bold text-[14px] text-slate-900 tabular">
                  ¥{plan.amount.toLocaleString("zh-CN")}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {freqText}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px]">
                {plan.enabled ? (
                  <>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isSoon ? "bg-amber-500 animate-pulse" : "bg-emerald-400"
                    }`} />
                    <span className={isSoon ? "text-amber-600" : "text-slate-500"}>
                      下次 {plan.nextDate.slice(5)}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className={isSoon ? "text-amber-600" : "text-slate-400"}>
                      {days === 0 ? "今天" : `${days} 天后`}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    <span className="text-slate-400">已暂停</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => dca.toggle(plan.id)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center
                              transition-all active:scale-90
                              ${plan.enabled
                                ? "bg-slate-100 hover:bg-slate-200"
                                : "bg-purple-50 hover:bg-purple-100"}`}
                  aria-label={plan.enabled ? "暂停" : "启用"}
                >
                  {plan.enabled ? (
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => dca.openModal(plan)}
                  className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100
                             flex items-center justify-center
                             transition-all active:scale-90"
                  aria-label="编辑"
                >
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (confirm(`删除定投「${plan.productName}」？`)) {
                      dca.remove(plan.id);
                    }
                  }}
                  className="w-7 h-7 rounded-full bg-rose-50 hover:bg-rose-100
                             flex items-center justify-center
                             transition-all active:scale-90"
                  aria-label="删除"
                >
                  <svg className="w-3 h-3 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div className="px-5 py-3 border-t divider">
        <button
          onClick={() => dca.openModal()}
          className="w-full py-2.5 rounded-full
                     bg-purple-50 text-purple-600 text-[12px] font-semibold
                     hover:bg-purple-100 active:scale-[0.98]
                     transition-all"
        >
          + 添加定投
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   主组件
   ============================================================ */
type Props = {
  id: string;
  metrics: HomeMetrics;
  snap: SnapData;
  goals?: GoalsData;
  dca?: DCAData;
  rankData?: {
    profit: any[];
    hot: any[];
    new: any[];
    loading: boolean;
  };
  onLinkClick?: (e: React.MouseEvent) => void;
  onTitleLongPress?: () => void;
};

export default function ModuleRenderer({
  id, metrics: m, snap, goals, dca, rankData, onLinkClick, onTitleLongPress,
}: Props) {
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

  switch (id) {
    case "holdings":
      return wrapper("我的持仓", m.count > 0 ? `${m.count}` : undefined,
        <HoldingsContent m={m} />, <MoreLink href="/holdings" text="全部" />);

    case "topToday":
      return wrapper("今日收益榜", m.topToday.length > 0 ? `${m.topToday.length}` : undefined,
        <TopTodayContent m={m} />, <MoreLink href="/holdings" text="全部" />);

    case "profitRank":
      return wrapper("收益榜", rankData && !rankData.loading ? `${rankData.profit.length}` : undefined,
        <RankList items={rankData?.profit || []} loading={rankData?.loading ?? true}
                  type="profit" onLinkClick={onLinkClick} />,
        <MoreLink href="/discover?tab=profit" text="全部" />);

    case "hotRank":
      return wrapper("热度榜", rankData && !rankData.loading ? `${rankData.hot.length}` : undefined,
        <RankList items={rankData?.hot || []} loading={rankData?.loading ?? true}
                  type="hot" onLinkClick={onLinkClick} />,
        <MoreLink href="/discover?tab=hot" text="全部" />);

    case "newRank":
      return wrapper("新品榜", rankData && !rankData.loading ? `${rankData.new.length}` : undefined,
        <RankList items={rankData?.new || []} loading={rankData?.loading ?? true}
                  type="new" onLinkClick={onLinkClick} />,
        <MoreLink href="/discover?tab=new" text="全部" />);

    case "recentTx":
      return wrapper("最近交易", undefined,
        <div className="px-5 py-6 text-center">
          <div className="text-[12px] text-slate-400 mb-3">最近 90 天交易</div>
          <Link href="/transactions" className="text-[12px] text-purple-600 font-medium">
            打开交易记录 →
          </Link>
        </div>);

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

    case "assetDistribution":
      return wrapper("资产分布", m.assetDistribution.length ? `${m.assetDistribution.length}` : undefined,
        <DistributionContent m={m} />, <MoreLink href="/holdings" text="详情" />);

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
                <div className="text-[10px] text-slate-400 truncate mt-1">{m.bestProduct.name}</div>
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
                <div className="text-[10px] text-slate-400 truncate mt-1">{m.worstProduct.name}</div>
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
              holdingId: h.id, productId: h.product_id,
              name: h.products?.name || "", bank: h.products?.bank || "",
              value: 0, unit: "",
              reason: `净值更新至 ${h.products?.nav_date || "未知"}`,
            }))}
            emptyText=""
          />
        ) : (
          <div className="px-5 py-6 text-center text-[12px] text-slate-400">
            所有净值都是最新的
          </div>
        ));

    case "assetTrend":
      return wrapper(
        "资产走势",
        snap.snapshots.length > 1 ? `${snap.snapshots.length} 天` : undefined,
        <AssetTrendContent m={m} snap={snap} />
      );

    case "goal":
      return wrapper(
        "目标进度",
        goals && goals.goals.length > 0 ? `${goals.goals.length}` : undefined,
        <GoalContent m={m} goals={goals} />
      );

    case "dca":
      return wrapper(
        "定投计划",
        dca && dca.plans.length > 0 ? `${dca.plans.length}` : undefined,
        <DCAContent dca={dca} />
      );

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