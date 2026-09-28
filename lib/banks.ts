// lib/banks.ts

export type BankInfo = {
  name: string;
  label: string;
  bg: string;
  color: string;
  bar: string;
  keywords: string[];
};

export const BANKS: BankInfo[] = [
  // ========== 国有大行（6家） ==========
  { name: "工银理财", label: "工", bg: "#ffeaea", color: "#c81e1e", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["工银", "工商银行"] },
  { name: "农银理财", label: "农", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)", keywords: ["农银", "农业银行"] },
  { name: "中银理财", label: "中", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["中银", "中国银行"] },
  { name: "建信理财", label: "建", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["建信", "建设银行"] },
  { name: "交银理财", label: "交", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)", keywords: ["交银", "交通银行"] },
  { name: "中邮理财", label: "邮", bg: "#fff0e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)", keywords: ["中邮", "邮储", "邮政储蓄"] },

  // ========== 股份制银行（12家） ==========
  { name: "招银理财", label: "招", bg: "#fff0f0", color: "#dc2626", bar: "linear-gradient(180deg,#f87171,#dc2626)", keywords: ["招银", "招商银行"] },
  { name: "兴银理财", label: "兴", bg: "#e6f0ff", color: "#1d4ed8", bar: "linear-gradient(180deg,#60a5fa,#1d4ed8)", keywords: ["兴银", "兴业银行"] },
  { name: "浦银理财", label: "浦", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)", keywords: ["浦发", "浦银", "浦发银行"] },
  { name: "信银理财", label: "信", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["信银", "中信", "中信银行"] },
  { name: "光大理财", label: "光", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["光大", "光大银行"] },
  { name: "民生理财", label: "民", bg: "#e6f9ed", color: "#047857", bar: "linear-gradient(180deg,#34d399,#047857)", keywords: ["民生", "民生银行"] },
  { name: "华夏理财", label: "华", bg: "#ffe4e8", color: "#be123c", bar: "linear-gradient(180deg,#fb7185,#be123c)", keywords: ["华夏", "华夏银行"] },
  { name: "广银理财", label: "广", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["广发", "广银", "广发银行"] },
  { name: "平安理财", label: "平", bg: "#fff4e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)", keywords: ["平安", "平安银行"] },
  { name: "浙银理财", label: "浙", bg: "#fff0f0", color: "#dc2626", bar: "linear-gradient(180deg,#f87171,#dc2626)", keywords: ["浙商", "浙银", "浙商银行"] },
  { name: "渤银理财", label: "渤", bg: "#fff0e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)", keywords: ["渤海", "渤海银行"] },
  { name: "恒丰理财", label: "恒", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)", keywords: ["恒丰", "恒丰银行"] },

  // ========== 民营银行（14家） ==========
  { name: "微众银行", label: "微", bg: "#e8f4ff", color: "#0066ff", bar: "linear-gradient(180deg,#4a9eff,#0066ff)", keywords: ["微众", "微众银行", "WeBank"] },
  { name: "网商银行", label: "网", bg: "#e6f0ff", color: "#1677ff", bar: "linear-gradient(180deg,#4d94ff,#1677ff)", keywords: ["网商", "网商银行", "MYbank"] },
  { name: "富民银行", label: "富", bg: "#fff4e0", color: "#d97706", bar: "linear-gradient(180deg,#fbbf24,#d97706)", keywords: ["富民", "富民银行"] },
  { name: "蓝海银行", label: "蓝", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)", keywords: ["蓝海", "蓝海银行"] },
  { name: "众邦银行", label: "众", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["众邦", "众邦银行"] },
  { name: "新网银行", label: "新", bg: "#e6f9ed", color: "#047857", bar: "linear-gradient(180deg,#34d399,#047857)", keywords: ["新网", "新网银行"] },
  { name: "金城银行", label: "金", bg: "#fff0e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)", keywords: ["金城", "金城银行"] },
  { name: "华瑞银行", label: "华", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["华瑞", "华瑞银行"] },
  { name: "三湘银行", label: "三", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)", keywords: ["三湘", "三湘银行"] },
  { name: "亿联银行", label: "亿", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["亿联", "亿联银行"] },
  { name: "苏宁银行", label: "苏", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)", keywords: ["苏宁", "苏宁银行"] },
  { name: "中关村银行", label: "关", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["中关村", "中关村银行"] },
  { name: "客商银行", label: "客", bg: "#fff4e0", color: "#d97706", bar: "linear-gradient(180deg,#fbbf24,#d97706)", keywords: ["客商", "客商银行"] },
  { name: "华通银行", label: "通", bg: "#e6f9ed", color: "#047857", bar: "linear-gradient(180deg,#34d399,#047857)", keywords: ["华通", "华通银行"] },

  // ========== 城商行 ==========
  { name: "宁银理财", label: "宁", bg: "#fff4e0", color: "#d97706", bar: "linear-gradient(180deg,#fbbf24,#d97706)", keywords: ["宁波", "宁银", "宁波银行"] },
  { name: "苏银理财", label: "苏", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["苏银", "江苏银行"] },
  { name: "杭银理财", label: "杭", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["杭银", "杭州银行"] },
  { name: "徽银理财", label: "徽", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["徽商", "徽银", "徽商银行"] },
  { name: "南银理财", label: "南", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["南银", "南京银行"] },
  { name: "上银理财", label: "上", bg: "#e6f0ff", color: "#1d4ed8", bar: "linear-gradient(180deg,#60a5fa,#1d4ed8)", keywords: ["上银", "上海银行"] },
  { name: "北银理财", label: "北", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["北银", "北京银行"] },
  { name: "青银理财", label: "青", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)", keywords: ["青银", "青岛银行"] },
  { name: "齐鲁银行", label: "齐", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)", keywords: ["齐鲁", "齐鲁银行"] },
  { name: "长沙银行", label: "长", bg: "#fff4e0", color: "#d97706", bar: "linear-gradient(180deg,#fbbf24,#d97706)", keywords: ["长沙银行", "长沙"] },
  { name: "成都银行", label: "成", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["成都银行", "成都"] },
  { name: "重庆银行", label: "重", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)", keywords: ["重庆银行", "重庆"] },
  { name: "贵阳银行", label: "贵", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["贵阳银行", "贵阳"] },
  { name: "苏州银行", label: "苏", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["苏州银行", "苏州"] },
  { name: "西安银行", label: "西", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["西安银行", "西安"] },
  { name: "郑州银行", label: "郑", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)", keywords: ["郑州银行", "郑州"] },
  { name: "大连银行", label: "连", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)", keywords: ["大连银行", "大连"] },
  { name: "哈尔滨银行", label: "哈", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)", keywords: ["哈尔滨银行", "哈尔滨"] },
  { name: "盛京银行", label: "盛", bg: "#fff0f0", color: "#dc2626", bar: "linear-gradient(180deg,#f87171,#dc2626)", keywords: ["盛京银行", "盛京"] },
  { name: "锦州银行", label: "锦", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["锦州银行", "锦州"] },
  { name: "天津银行", label: "天", bg: "#e6f0ff", color: "#1d4ed8", bar: "linear-gradient(180deg,#60a5fa,#1d4ed8)", keywords: ["天津银行", "天津"] },
  { name: "河北银行", label: "河", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["河北银行", "河北"] },
  { name: "温州银行", label: "温", bg: "#fff4e0", color: "#d97706", bar: "linear-gradient(180deg,#fbbf24,#d97706)", keywords: ["温州银行", "温州"] },
  { name: "台州银行", label: "台", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)", keywords: ["台州银行", "台州"] },
  { name: "稠州银行", label: "稠", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["稠州银行", "稠州"] },
  { name: "湖州银行", label: "湖", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)", keywords: ["湖州银行", "湖州"] },
  { name: "绍兴银行", label: "绍", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["绍兴银行", "绍兴"] },
  { name: "昆仑银行", label: "昆", bg: "#fff0f0", color: "#dc2626", bar: "linear-gradient(180deg,#f87171,#dc2626)", keywords: ["昆仑银行", "昆仑"] },
  { name: "宁夏银行", label: "宁", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)", keywords: ["宁夏银行", "宁夏"] },
  { name: "桂林银行", label: "桂", bg: "#e6f9ed", color: "#047857", bar: "linear-gradient(180deg,#34d399,#047857)", keywords: ["桂林银行", "桂林"] },
  { name: "北部湾银行", label: "湾", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)", keywords: ["北部湾", "广西北部湾银行"] },
  { name: "泉州银行", label: "泉", bg: "#fff4e0", color: "#d97706", bar: "linear-gradient(180deg,#fbbf24,#d97706)", keywords: ["泉州银行", "泉州"] },
  { name: "厦门银行", label: "厦", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["厦门银行", "厦门"] },
  { name: "赣州银行", label: "赣", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["赣州银行", "赣州"] },
  { name: "九江银行", label: "九", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["九江银行", "九江"] },
  { name: "江西银行", label: "江", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)", keywords: ["江西银行", "江西"] },

  // ========== 农商行 ==========
  { name: "渝农商理财", label: "渝", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)", keywords: ["渝农商", "重庆农商", "重庆农村商业银行"] },
  { name: "上海农商", label: "沪", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)", keywords: ["上海农商", "上海农村商业银行"] },
  { name: "广州农商", label: "穗", bg: "#fff0e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)", keywords: ["广州农商", "广州农村商业银行"] },
  { name: "东莞农商", label: "莞", bg: "#e6f9ed", color: "#047857", bar: "linear-gradient(180deg,#34d399,#047857)", keywords: ["东莞农商", "东莞农村商业银行"] },
  { name: "北京农商", label: "京", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["北京农商", "北京农村商业银行"] },
  { name: "天津农商", label: "津", bg: "#e6f0ff", color: "#1d4ed8", bar: "linear-gradient(180deg,#60a5fa,#1d4ed8)", keywords: ["天津农商", "天津农村商业银行"] },
  { name: "重庆农商", label: "渝", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)", keywords: ["重庆农商银行"] },
  { name: "成都农商", label: "蓉", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["成都农商", "成都农村商业银行"] },
  { name: "顺德农商", label: "顺", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["顺德农商", "顺德农村商业银行"] },
  { name: "江南农商", label: "江", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["江南农商", "江南农村商业银行"] },
  { name: "常熟农商", label: "熟", bg: "#fff4e0", color: "#d97706", bar: "linear-gradient(180deg,#fbbf24,#d97706)", keywords: ["常熟农商", "常熟农村商业银行"] },
  { name: "紫金农商", label: "紫", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)", keywords: ["紫金农商", "紫金农村商业银行"] },

  // ========== 合资理财公司 ==========
  { name: "汇华理财", label: "汇", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["汇华"] },
  { name: "贝莱德建信理财", label: "贝", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["贝莱德", "贝莱德建信"] },
  { name: "施罗德交银理财", label: "施", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)", keywords: ["施罗德"] },
  { name: "高盛工银理财", label: "高", bg: "#fff0f0", color: "#dc2626", bar: "linear-gradient(180deg,#f87171,#dc2626)", keywords: ["高盛"] },
  { name: "法巴农银理财", label: "法", bg: "#e6f9ed", color: "#047857", bar: "linear-gradient(180deg,#34d399,#047857)", keywords: ["法巴", "法国巴黎银行"] },

  // ========== 兜底 ==========
  { name: "其他", label: "?", bg: "#f1f3f7", color: "#64748b", bar: "linear-gradient(180deg,#cbd5e1,#94a3b8)", keywords: [] },
];

export function getBankInfo(bank?: string): BankInfo {
  if (!bank) return BANKS[BANKS.length - 1];
  const cleaned = bank.replace(/银行|理财|股份有限公司|有限责任公司/g, "").trim();
  for (const b of BANKS) {
    for (const kw of b.keywords) {
      if (cleaned.includes(kw) || bank.includes(kw)) return b;
    }
  }
  return { ...BANKS[BANKS.length - 1], label: cleaned.slice(0, 1) || "?" };
}

export function normalizeBank(raw?: string): string {
  if (!raw) return "其他";
  const cleaned = raw.replace(/股份有限公司|有限责任公司/g, "").trim();
  for (const b of BANKS) {
    for (const kw of b.keywords) {
      if (cleaned.includes(kw)) return b.name;
    }
  }
  return cleaned || "其他";
}