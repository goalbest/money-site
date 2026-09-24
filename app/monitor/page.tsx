"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { getBankInfo } from "../../lib/banks";
import NewRuleModal from "../components/NewRuleModal";

const INDICATOR_LABELS: Record<string, string> = {
  annualized_7d: "近 7 日年化",
  annualized_14d: "近 14 日年化",
  annualized_1m: "近 1 月年化",
  annualized_3m: "近 3 月年化",
  annualized_1y: "近 1 年年化",
  unit_nav: "单位净值",
  daily_return: "日涨跌",
};

const OPERATOR_LABELS: Record<string, string> = {
  "<": "<",
  ">": ">",
  "<=": "≤",
  ">=": "≥",
};

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7,
  "14d": 14,
  "1m": 30,
  "3m": 90,
  "1y": 365,
};

function calcAnnualized(
  navs: { date: string; nav: number }[],
  days: number
): number | null {
  if (navs.length < 2) return null;
  const sorted = [...navs].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const latestTime = new Date(latest.date).getTime();
  const targetTime = latestTime - days * 86400000;

  let ref = sorted[sorted.length - 1];
  let minDiff = Infinity;
  for (const n of sorted) {
    const diff = Math.abs(new Date(n.date).getTime() - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      ref = n;
    }
  }
  if (!ref || ref.nav <= 0 || ref.date === latest.date) return null;

  const actualDays = Math.max(
    1,
    Math.round((latestTime - new Date(ref.date).getTime()) / 86400000)
  );
  const totalReturn = (latest.nav - ref.nav) / ref.nav;
  return ((totalReturn * 365) / actualDays) * 100;
}

function getConditions(rule: any): { indicator: string; operator: string; threshold: number }[] {
  if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    return rule.conditions;
  }
  return [
    {
      indicator: rule.indicator || "annualized_1m",
      operator: rule.operator || "<",
      threshold: Number(rule.threshold || 0),
    },
  ];
}

function condKey(conditions: any[]): string {
  return JSON.stringify(
    conditions
      .map(c => [c.indicator, c.operator, Number(c.threshold)])
      .sort()
  );
}

export default function MonitorPage() {
  const router = useRouter();
  const [holdings, setHoldings] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [navMap, setNavMap] = useState<Record<number, { date: string; nav: number }[]>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [menuGroup, setMenuGroup] = useState<any | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      router.push("/login");
      return;
    }
    loadData(userId);
  }, []);

  async function loadData(userId: string) {
    setLoading(true);

    const [holdingsRes, rulesRes] = await Promise.all([
      supabase
        .from("user_holdings")
        .select(
          "id, product_id, holding_amount, in_transit_amount, products(id, name, bank, unit_nav, annualized_1m, daily_return, nav_date)"
        )
        .eq("user_id", userId)
        .eq("status", "active"),
      supabase
        .from("watch_rules")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    const hd = holdingsRes.data || [];
    setHoldings(hd);
    setRules(rulesRes.data || []);

    const productIds = hd.map((h: any) => h.product_id).filter(Boolean);
    if (productIds.length > 0) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const { data: navs } = await supabase
        .from("nav_history")
        .select("product_id, nav_date, unit_nav")
        .in("product_id", productIds)
        .gte("nav_date", oneYearAgo.toISOString().split("T")[0])
        .order("nav_date", { ascending: true });

      const grouped: Record<number, { date: string; nav: number }[]> = {};
      (navs || []).forEach((n: any) => {
        if (!grouped[n.product_id]) grouped[n.product_id] = [];
        grouped[n.product_id].push({ date: n.nav_date, nav: Number(n.unit_nav) });
      });
      setNavMap(grouped);
    }

    setLoading(false);
  }

  const calcMap = useMemo(() => {
    const result: Record<number, Record<string, number>> = {};
    Object.entries(navMap).forEach(([pidStr, navs]) => {
      const pid = Number(pidStr);
      const h = holdings.find(x => x.product_id === pid);
      if (!h?.products) return;

      result[pid] = {
        annualized_7d: calcAnnualized(navs, PERIOD_DAYS["7d"]) ?? 0,
        annualized_14d: calcAnnualized(navs, PERIOD_DAYS["14d"]) ?? 0,
        annualized_1m: Number(h.products.annualized_1m || 0),
        annualized_3m: calcAnnualized(navs, PERIOD_DAYS["3m"]) ?? 0,
        annualized_1y: calcAnnualized(navs, PERIOD_DAYS["1y"]) ?? 0,
        unit_nav: Number(h.products.unit_nav || 0),
        daily_return: Number(h.products.daily_return || 0),
      };
    });
    return result;
  }, [navMap, holdings]);

  function checkCondition(pid: number, condition: any): boolean {
    const map = calcMap[pid];
    if (!map) return false;
    const current = map[condition.indicator];
    if (current == null) return false;
    const threshold = Number(condition.threshold);
    switch (condition.operator) {
      case "<": return current < threshold;
      case ">": return current > threshold;
      case "<=": return current <= threshold;
      case ">=": return current >= threshold;
      default: return false;
    }
  }

  function isTriggered(rule: any): boolean {
    const conditions = getConditions(rule);
    if (conditions.length === 0) return false;
    return conditions.every(c => checkCondition(rule.product_id, c));
  }

  function currentValuesText(rule: any): string {
    const map = calcMap[rule.product_id];
    if (!map) return "—";
    const conditions = getConditions(rule);
    return conditions
      .map(c => {
        const v = map[c.indicator];
        if (v == null) return "—";
        const isNav = c.indicator === "unit_nav";
        return v.toFixed(isNav ? 4 : 2) + (isNav ? "" : "%");
      })
      .join(" · ");
  }

  function conditionDescription(c: any): string {
    const label = INDICATOR_LABELS[c.indicator] || c.indicator;
    const op = OPERATOR_LABELS[c.operator] || c.operator;
    const unit = c.indicator === "unit_nav" ? "" : "%";
    return `${label} ${op} ${Number(c.threshold).toFixed(2)}${unit}`;
  }

  /* ============ 规则分组 ============ */
  const ruleGroups = useMemo(() => {
    const map: Record<string, {
      key: string;
      conditions: any[];
      rules: any[];
    }> = {};

    rules.forEach(rule => {
      const conds = getConditions(rule);
      const key = condKey(conds);
      if (!map[key]) {
        map[key] = { key, conditions: conds, rules: [] };
      }
      map[key].rules.push(rule);
    });

    return Object.values(map)
      .map(g => {
        const enabledRules = g.rules.filter(r => r.enabled);
        const triggeredRules = enabledRules.filter(r => isTriggered(r));
        const pausedRules = g.rules.filter(r => !r.enabled);
        return {
          ...g,
          total: g.rules.length,
          enabled: enabledRules.length,
          triggered: triggeredRules.length,
          paused: pausedRules.length,
          allEnabled: g.rules.every(r => r.enabled),
          anyEnabled: g.rules.some(r => r.enabled),
        };
      })
      .sort((a, b) => b.triggered - a.triggered || b.total - a.total);
  }, [rules, calcMap]);

  const totalTriggered = ruleGroups.reduce((s, g) => s + g.triggered, 0);
  const totalEnabled = ruleGroups.reduce((s, g) => s + g.enabled, 0);
  const totalRules = ruleGroups.reduce((s, g) => s + g.total, 0);

  /* ============ 组开关 ============ */
  async function toggleGroup(group: any, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const newEnabled = !group.allEnabled;
    /* 乐观更新 */
    setRules(prev =>
      prev.map(r => {
        if (group.rules.find((gr: any) => gr.id === r.id)) {
          return { ...r, enabled: newEnabled };
        }
        return r;
      })
    );
    const ids = group.rules.map((r: any) => r.id);
    await supabase
      .from("watch_rules")
      .update({ enabled: newEnabled })
      .in("id", ids);
  }

  /* ============ 编辑规则 ============ */
  async function handleSave(data: {
    product_ids: number[];
    conditions: { indicator: string; operator: string; threshold: number }[];
  }) {
    const userId = localStorage.getItem("user_id");
    if (!userId) return;

    const first = data.conditions[0];

    if (editingRule) {
      await supabase
        .from("watch_rules")
        .update({
          product_id: data.product_ids[0],
          conditions: data.conditions,
          indicator: first.indicator,
          operator: first.operator,
          threshold: first.threshold,
        })
        .eq("id", editingRule.id);
    } else {
      const payloads = data.product_ids.map(pid => ({
        user_id: Number(userId),
        product_id: pid,
        conditions: data.conditions,
        indicator: first.indicator,
        operator: first.operator,
        threshold: first.threshold,
        enabled: true,
      }));
      await supabase.from("watch_rules").insert(payloads);
    }

    setEditingRule(null);
    loadData(userId);
  }

  /* ============ 删除整组 ============ */
  async function deleteGroup(group: any) {
    if (!confirm(`删除这组规则？\n条件：${group.conditions.map(conditionDescription).join(" AND ")}\n影响 ${group.total} 个产品`)) return;
    const ids = group.rules.map((r: any) => r.id);
    await supabase.from("watch_rules").delete().in("id", ids);
    setMenuGroup(null);
    const userId = localStorage.getItem("user_id");
    if (userId) loadData(userId);
  }

  /* ============ 单条规则操作（从组内删除某个产品） ============ */
  async function removeRuleFromGroup(rule: any, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("从这组规则中移除该产品？")) return;
    await supabase.from("watch_rules").delete().eq("id", rule.id);
    const userId = localStorage.getItem("user_id");
    if (userId) loadData(userId);
  }

  function toggleExpand(key: string) {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading) {
    return (
      <div className="min-h-screen pb-24">
        <div className="container mx-auto px-5 pt-8 max-w-3xl">
          <div className="h-7 w-32 bg-slate-200/60 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-48 bg-slate-200/60 rounded animate-pulse mb-6" />
          <div className="card p-5 mb-4 h-32 animate-pulse" />
          <div className="card p-5 h-32 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-5 pt-8 max-w-3xl">

        {/* 顶部标题 */}
        <div className="flex items-center gap-3 mb-5 animate-fade-in-up">
          <div className="flex-1">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">
              净值监控
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              {totalTriggered > 0
                ? `${totalTriggered} 个产品已触发`
                : totalEnabled > 0
                ? `${totalEnabled} 个产品监控中`
                : "为持仓设置监控规则"}
            </div>
          </div>
        </div>

        {/* Tab */}
        <div className="segment-group flex mb-5 animate-fade-in-up delay-1">
          <Link
            href="/holdings"
            className="flex-1 py-2.5 text-[13px] segment-item text-center hover:text-slate-700"
          >
            持仓
          </Link>
          <button className="flex-1 py-2.5 text-[13px] segment-item segment-item-active">
            监控 {totalRules > 0 ? `(${totalRules})` : ""}
          </button>
        </div>

        {/* 操作条 */}
        <div className="flex items-center justify-between mb-3 animate-fade-in-up delay-2">
          <div className="text-[13px] text-slate-500 font-medium">
            规则组 {ruleGroups.length > 0 && <span className="text-slate-400">（{ruleGroups.length} 组）</span>}
          </div>
          <button
            onClick={() => {
              setEditingRule(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full
                       bg-purple-50 text-purple-600 text-[12px] font-semibold
                       hover:bg-purple-100 active:scale-95
                       transition-all duration-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新建规则
          </button>
        </div>

        {/* 空状态 */}
        {ruleGroups.length === 0 ? (
          <div className="card p-12 text-center animate-fade-in-up delay-3">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl
                            bg-gradient-to-br from-violet-500 to-purple-600
                            flex items-center justify-center
                            shadow-lg shadow-purple-500/25">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-[16px] font-bold text-slate-900 mb-2">还没有监控规则</div>
            <div className="text-[12px] text-slate-400 mb-6 leading-relaxed">
              支持多产品、多条件组合<br />全部满足时标记触发
            </div>
            <button
              onClick={() => {
                setEditingRule(null);
                setModalOpen(true);
              }}
              className="btn-primary inline-block text-sm px-8 py-3"
            >
              新建第一条规则
            </button>
          </div>
        ) : (
          /* ============ 规则组列表 ============ */
          <div className="space-y-3">
            {ruleGroups.map((group, gi) => {
              const isExpanded = expandedGroups[group.key] !== false; /* 默认展开 */
              const hasTriggered = group.triggered > 0;

              return (
                <div
                  key={group.key}
                  className="card overflow-hidden animate-fade-in-up"
                  style={{ animationDelay: `${0.05 * Math.min(gi, 8)}s` }}
                >
                  {/* ===== 组头：状态 + 条件 + 开关 + 菜单 ===== */}
                  <div className={`p-5 transition-colors ${
                    hasTriggered && group.anyEnabled
                      ? "bg-gradient-to-br from-rose-50/50 to-transparent"
                      : ""
                  }`}>
                    {/* 第一行：状态徽章 + 开关 + 菜单 */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {group.anyEnabled && group.triggered > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold
                                           bg-rose-100 text-rose-600">
                            {group.triggered} 个已触发
                          </span>
                        )}
                        {group.anyEnabled && group.triggered === 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold
                                           bg-emerald-100 text-emerald-600">
                            全部正常
                          </span>
                        )}
                        {!group.anyEnabled && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold
                                           bg-slate-100 text-slate-500">
                            已暂停
                          </span>
                        )}
                        {group.conditions.length > 1 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold
                                           bg-purple-100 text-purple-600">
                            {group.conditions.length} 条件 AND
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* 组开关 */}
                        <button
                          onClick={(e) => toggleGroup(group, e)}
                          className={`relative
                                      w-[42px] h-[24px] rounded-full
                                      transition-colors duration-300
                                      ${group.allEnabled
                                        ? "bg-gradient-to-r from-violet-500 to-purple-600"
                                        : group.anyEnabled
                                        ? "bg-amber-400"
                                        : "bg-slate-200"
                                      }`}
                          style={{
                            boxShadow: group.allEnabled
                              ? "0 2px 8px rgba(139, 92, 246, 0.35)"
                              : "none",
                          }}
                          aria-label={group.allEnabled ? "暂停全部" : "启用全部"}
                        >
                          <span
                            className={`absolute top-[3px] w-[18px] h-[18px] rounded-full
                                        bg-white shadow-sm
                                        transition-all duration-300 ease-out
                                        ${group.allEnabled ? "left-[21px]" : "left-[3px]"}`}
                          />
                        </button>

                        {/* 组菜单 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuGroup(group);
                          }}
                          className="w-7 h-7 rounded-full hover:bg-slate-100
                                     flex items-center justify-center
                                     transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="5" cy="12" r="1.8" />
                            <circle cx="12" cy="12" r="1.8" />
                            <circle cx="19" cy="12" r="1.8" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* 第二行：条件描述 */}
                    <div className="text-[14px] text-slate-900 font-medium leading-relaxed">
                      {group.conditions.map((c, i) => (
                        <span key={i}>
                          {i > 0 && <span className="mx-1.5 text-[11px] text-purple-500 font-semibold">AND</span>}
                          <span className="text-slate-700">{conditionDescription(c)}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* ===== 展开/折叠产品列表 ===== */}
                  <button
                    onClick={() => toggleExpand(group.key)}
                    className="w-full px-5 py-2.5 bg-slate-50/60 border-t divider
                               flex items-center justify-between
                               hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-slate-500">
                        {group.total} 个产品
                      </span>
                      {group.triggered > 0 && (
                        <span className="flex items-center gap-1 text-rose-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          {group.triggered} 触发
                        </span>
                      )}
                      {group.enabled - group.triggered > 0 && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {group.enabled - group.triggered} 正常
                        </span>
                      )}
                      {group.paused > 0 && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          {group.paused} 暂停
                        </span>
                      )}
                    </div>
                    <svg
                      className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* 产品列表 */}
                  {isExpanded && (
                    <div className="animate-fade-in" style={{ animationDuration: "0.25s" }}>
                      {group.rules.map((rule: any) => {
                        const holding = holdings.find(h => h.product_id === rule.product_id);
                        const product = holding?.products;
                        const info = product ? getBankInfo(product.bank) : null;
                        const triggered = rule.enabled && isTriggered(rule);

                        /* 产品已从持仓中移除 */
                        if (!product) {
                          return (
                            <div
                              key={rule.id}
                              className="flex items-center gap-3 px-5 py-3
                                         border-t divider opacity-60"
                            >
                              <span className="w-7 h-7 rounded-lg bg-slate-100
                                               flex items-center justify-center flex-shrink-0">
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] text-slate-400">
                                  该产品已不在持仓中
                                </div>
                              </div>
                              <button
                                onClick={(e) => removeRuleFromGroup(rule, e)}
                                className="text-[11px] text-rose-500 font-medium
                                           px-2 py-1 rounded-lg hover:bg-rose-50"
                              >
                                移除
                              </button>
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={rule.id}
                            href={`/holdings/${holding!.id}`}
                            className={`flex items-center gap-3 px-5 py-3.5 group
                                        border-t divider
                                        hover:bg-slate-50 active:bg-slate-100
                                        transition-colors duration-150
                                        ${!rule.enabled ? "opacity-50" : ""}`}
                          >
                            {info && (
                              <span
                                className="bank-avatar flex-shrink-0"
                                style={{ background: info.bg, color: info.color }}
                              >
                                {info.label}
                              </span>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] text-slate-900 font-medium truncate">
                                {product.name}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                                    !rule.enabled
                                      ? "bg-slate-100 text-slate-500"
                                      : triggered
                                      ? "bg-rose-100 text-rose-600"
                                      : "bg-emerald-100 text-emerald-600"
                                  }`}
                                >
                                  {!rule.enabled ? "暂停" : triggered ? "已触发" : "正常"}
                                </span>
                                <span className="text-[10px] text-slate-400 truncate">
                                  {product.bank}
                                </span>
                              </div>
                            </div>

                            {/* 当前值 */}
                            <div className="text-right flex-shrink-0">
                              <div className={`font-mono font-bold text-[12px] tabular ${
                                triggered ? "text-rose-500" : "text-slate-700"
                              }`}>
                                {currentValuesText(rule)}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                当前值
                              </div>
                            </div>

                            {/* 触发时显示快捷操作 */}
                            {triggered && (
                              <div className="flex items-center gap-1 ml-1 flex-shrink-0
                                              px-2 py-1 rounded-full
                                              bg-rose-50 text-rose-600
                                              text-[10px] font-semibold">
                                去处理
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {ruleGroups.length > 0 && (
          <div className="card-tile p-4 mt-5 animate-fade-in-up delay-4">
            <div className="text-[11px] text-slate-400 leading-relaxed">
              <span className="font-medium text-slate-500">提示 · </span>
              相同条件的规则会归为一组。点击产品可进入持仓详情卖出；右上角开关可暂停/启用整组。
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>

      {/* 新建/编辑弹窗 */}
      <NewRuleModal
        open={modalOpen}
        holdings={holdings}
        editing={editingRule}
        onClose={() => {
          setModalOpen(false);
          setEditingRule(null);
        }}
        onSave={handleSave}
      />

      {/* 组菜单 */}
      {menuGroup && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[80] animate-fade-in"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => setMenuGroup(null)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[90] animate-fade-in-up"
            style={{ animationDuration: "0.3s" }}
          >
            <div className="max-w-3xl mx-auto px-4 pb-4">
              <div className="bg-white rounded-3xl overflow-hidden shadow-2xl mb-2">
                <div className="px-5 py-4 border-b divider">
                  <div className="text-[10px] text-slate-400 mb-1">规则组</div>
                  <div className="text-[13px] font-semibold text-slate-900 leading-snug">
                    {menuGroup.conditions.map(conditionDescription).join(" AND ")}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {menuGroup.total} 个产品
                  </div>
                </div>

                <button
                  onClick={() => {
                    setMenuGroup(null);
                    toggleGroup(menuGroup);
                  }}
                  className="w-full flex items-center gap-3 px-5 py-4
                             hover:bg-slate-50 active:bg-slate-100
                             transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      {menuGroup.allEnabled ? (
                        <path d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                      ) : (
                        <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                      )}
                    </svg>
                  </div>
                  <span className="text-[14px] text-slate-800 font-medium">
                    {menuGroup.allEnabled ? "暂停全部" : "启用全部"}
                  </span>
                </button>

                <button
                  onClick={() => deleteGroup(menuGroup)}
                  className="w-full flex items-center gap-3 px-5 py-4
                             hover:bg-rose-50 active:bg-rose-100
                             transition-colors text-left
                             border-t divider"
                >
                  <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                    </svg>
                  </div>
                  <span className="text-[14px] text-rose-600 font-medium">删除整组</span>
                </button>
              </div>

              <button
                onClick={() => setMenuGroup(null)}
                className="w-full bg-white rounded-2xl py-4 text-[15px] font-semibold
                           text-slate-700 shadow-2xl active:bg-slate-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}