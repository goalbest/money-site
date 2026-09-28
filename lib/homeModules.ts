// lib/homeModules.ts

export type ModuleZone = "tile" | "card" | "hidden";
export type ModuleCategory = "data" | "alert" | "insight" | "plan" | "quick";

export type ModuleMeta = {
  id: string;
  name: string;         // 完整名
  shortName: string;    // 磁贴里显示的短名
  icon: string;         // emoji
  desc: string;         // 抽屉里的说明
  category: ModuleCategory;
  defaultZone: ModuleZone;
  /** 需要哪些数据字段（用于懒加载判断） */
  needs?: ("holdings" | "transactions" | "navHistory" | "watchRules" | "searchLogs")[];
};

export const MODULE_META: ModuleMeta[] = [
  // ============ 数据展示 ============
  {
    id: "holdings",
    name: "我的持仓",
    shortName: "持仓",
    icon: "📁",
    desc: "Top 5 持仓列表",
    category: "data",
    defaultZone: "card",
    needs: ["holdings"],
  },
  {
    id: "topToday",
    name: "今日收益榜",
    shortName: "今日榜",
    icon: "📊",
    desc: "今天收益最高的产品",
    category: "data",
    defaultZone: "card",
    needs: ["holdings"],
  },
  {
    id: "discover",
    name: "发现好产品",
    shortName: "发现",
    icon: "🔍",
    desc: "收益 / 热度 / 新品榜",
    category: "data",
    defaultZone: "card",
  },
  {
    id: "recentTx",
    name: "最近交易",
    shortName: "最近交易",
    icon: "📝",
    desc: "最近 3 笔买卖记录",
    category: "data",
    defaultZone: "card",
    needs: ["transactions"],
  },

  // ============ 磁贴 · 状态类 ============
  {
    id: "pending",
    name: "待处理",
    shortName: "待处理",
    icon: "🔔",
    desc: "监控规则触发的产品",
    category: "alert",
    defaultZone: "tile",
    needs: ["watchRules"],
  },
  {
    id: "monthStats",
    name: "本月统计",
    shortName: "月统计",
    icon: "💰",
    desc: "本月买入 / 卖出金额",
    category: "insight",
    defaultZone: "tile",
    needs: ["transactions"],
  },
  {
    id: "monthProfit",
    name: "本月收益",
    shortName: "月收益",
    icon: "📅",
    desc: "当月累计收益",
    category: "data",
    defaultZone: "tile",
    needs: ["navHistory"],
  },
  {
    id: "navStale",
    name: "净值更新",
    shortName: "净值更新",
    icon: "⏰",
    desc: "超过 3 天没更新净值的产品",
    category: "alert",
    defaultZone: "tile",
    needs: ["holdings"],
  },
  {
    id: "assetDistribution",
    name: "资产分布",
    shortName: "分布",
    icon: "🥧",
    desc: "按银行 / 类别的占比",
    category: "insight",
    defaultZone: "tile",
    needs: ["holdings"],
  },
  {
    id: "hotSearch",
    name: "热度榜",
    shortName: "热度",
    icon: "🔥",
    desc: "最近被搜最多的词",
    category: "data",
    defaultZone: "tile",
    needs: ["searchLogs"],
  },

  // ============ 磁贴 · 智能提醒 ============
  {
    id: "abnormalDrop",
    name: "异常波动",
    shortName: "异动",
    icon: "🚨",
    desc: "单日跌超 0.5% 的产品",
    category: "alert",
    defaultZone: "tile",
    needs: ["holdings"],
  },
  {
    id: "newHigh",
    name: "创新高",
    shortName: "新高",
    icon: "📈",
    desc: "净值创近 90 天新高",
    category: "alert",
    defaultZone: "tile",
    needs: ["navHistory"],
  },
  {
    id: "idleLong",
    name: "长期未动",
    shortName: "未动",
    icon: "💤",
    desc: "持有超 60 天且从未加仓",
    category: "insight",
    defaultZone: "tile",
    needs: ["holdings", "transactions"],
  },
  {
    id: "streakWin",
    name: "持续跑赢",
    shortName: "连涨",
    icon: "💡",
    desc: "连续 7 天正收益",
    category: "alert",
    defaultZone: "tile",
    needs: ["navHistory"],
  },
  {
    id: "takeProfit",
    name: "止盈提示",
    shortName: "止盈",
    icon: "🌡️",
    desc: "收益超 5% 建议考虑卖出",
    category: "alert",
    defaultZone: "tile",
    needs: ["holdings"],
  },
  {
    id: "stopLoss",
    name: "止损提示",
    shortName: "止损",
    icon: "🩹",
    desc: "亏损超 3% 的产品",
    category: "alert",
    defaultZone: "tile",
    needs: ["holdings"],
  },

  // ============ 磁贴 · 分析洞察 ============
  {
    id: "concentration",
    name: "集中度分析",
    shortName: "集中度",
    icon: "🥧",
    desc: "最大持仓占比（风险提示）",
    category: "insight",
    defaultZone: "tile",
    needs: ["holdings"],
  },
  {
    id: "beatDeposit",
    name: "跑赢存款",
    shortName: "跑赢存款",
    icon: "🏦",
    desc: "你的年化 vs 银行定存",
    category: "insight",
    defaultZone: "tile",
    needs: ["holdings"],
  },
  {
    id: "beatInflation",
    name: "跑赢通胀",
    shortName: "跑赢通胀",
    icon: "🎯",
    desc: "实际收益率 vs CPI",
    category: "insight",
    defaultZone: "tile",
    needs: ["holdings"],
  },
  {
    id: "bestWorst",
    name: "最佳 / 最差",
    shortName: "最佳最差",
    icon: "🏆",
    desc: "累计收益最高的产品",
    category: "insight",
    defaultZone: "tile",
    needs: ["holdings"],
  },

  // ============ 磁贴 · 计划执行 ============
  {
    id: "goal",
    name: "目标进度",
    shortName: "目标",
    icon: "🎯",
    desc: "自定义理财目标完成度",
    category: "plan",
    defaultZone: "tile",
  },
  {
    id: "dca",
    name: "定投计划",
    shortName: "定投",
    icon: "💰",
    desc: "每月定投计划",
    category: "plan",
    defaultZone: "tile",
  },

  // ============ 磁贴 · 快捷操作 ============
  {
    id: "quickAdd",
    name: "一键加仓",
    shortName: "加仓",
    icon: "⚡",
    desc: "对常买产品快速加仓",
    category: "quick",
    defaultZone: "tile",
  },
  {
    id: "quickRefresh",
    name: "刷新净值",
    shortName: "刷新",
    icon: "🔄",
    desc: "手动刷新所有产品净值",
    category: "quick",
    defaultZone: "tile",
  },

  // ============ 磁贴 · 占位 ============
  {
    id: "assetTrend",
    name: "资产走势",
    shortName: "走势",
    icon: "📈",
    desc: "近 30 天资产折线（需快照表）",
    category: "insight",
    defaultZone: "tile",
  },

  // ============ 抽屉 · 分析 ============
  {
    id: "quarterReport",
    name: "季度总结",
    shortName: "季报",
    icon: "📅",
    desc: "本季度收益、笔数、胜率",
    category: "insight",
    defaultZone: "hidden",
    needs: ["transactions"],
  },
  {
    id: "monthCompare",
    name: "月对比",
    shortName: "月对比",
    icon: "📈",
    desc: "本月 vs 上月",
    category: "insight",
    defaultZone: "hidden",
    needs: ["navHistory"],
  },
  {
    id: "holdDaysDist",
    name: "持有天数分布",
    shortName: "天数分布",
    icon: "⏱️",
    desc: "短期 / 中期 / 长期占比",
    category: "insight",
    defaultZone: "hidden",
    needs: ["holdings"],
  },
  {
    id: "drawdown",
    name: "回撤分析",
    shortName: "回撤",
    icon: "📉",
    desc: "历史最大回撤",
    category: "insight",
    defaultZone: "hidden",
    needs: ["navHistory"],
  },
  {
    id: "bankConcentration",
    name: "银行集中度",
    shortName: "银行集中",
    icon: "🌐",
    desc: "几家银行 / 占比",
    category: "insight",
    defaultZone: "hidden",
    needs: ["holdings"],
  },

  // ============ 抽屉 · 计划 ============
  {
    id: "budget",
    name: "预算控制",
    shortName: "预算",
    icon: "📅",
    desc: "本月可买额度",
    category: "plan",
    defaultZone: "hidden",
  },
  {
    id: "reminders",
    name: "提醒规则",
    shortName: "提醒",
    icon: "🔔",
    desc: "自定义提醒条件",
    category: "plan",
    defaultZone: "hidden",
  },
  {
    id: "notes",
    name: "投资笔记",
    shortName: "笔记",
    icon: "📝",
    desc: "每笔交易加备注",
    category: "plan",
    defaultZone: "hidden",
  },
  {
    id: "favorites",
    name: "收藏组合",
    shortName: "组合",
    icon: "⭐",
    desc: "组合产品一起观察",
    category: "plan",
    defaultZone: "hidden",
  },
];

export const MODULE_MAP: Record<string, ModuleMeta> = Object.fromEntries(
  MODULE_META.map(m => [m.id, m])
);

export const ALL_MODULE_IDS = MODULE_META.map(m => m.id);

/** 默认布局（首次访问时的初始分区） */
export const DEFAULT_LAYOUT = {
  tile: [
    "assetTrend",
    "pending",
    "monthStats",
    "monthProfit",
    "navStale",
    "abnormalDrop",
  ],
  card: ["holdings", "topToday", "discover"],
  hidden: [
    "recentTx",
    "assetDistribution",
    "hotSearch",
    "newHigh",
    "idleLong",
    "streakWin",
    "takeProfit",
    "stopLoss",
    "concentration",
    "beatDeposit",
    "beatInflation",
    "bestWorst",
    "goal",
    "dca",
    "quickAdd",
    "quickRefresh",
    "quarterReport",
    "monthCompare",
    "holdDaysDist",
    "drawdown",
    "bankConcentration",
    "budget",
    "reminders",
    "notes",
    "favorites",
  ],
};

/** 按分类分组（抽屉里用） */
export const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  data: "数据展示",
  alert: "智能提醒",
  insight: "分析洞察",
  plan: "计划执行",
  quick: "快捷操作",
};