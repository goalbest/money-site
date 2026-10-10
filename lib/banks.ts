// lib/banks.ts

export type BankInfo = {
  name: string;
  label: string;
  bg: string;
  color: string;
  bar: string;
  keywords: string[];
  pinyin: string[];    // 全拼
  initials: string[];  // 首字母
};

export const BANKS: BankInfo[] = [
  // ========== 国有 6 大行 ==========
  { name: "工银理财", label: "工", bg: "#ffeaea", color: "#c81e1e", bar: "linear-gradient(180deg,#f87171,#b91c1c)",
    keywords: ["工银", "工商银行", "工行", "icbc"],
    pinyin: ["gongyin", "gongyinlicai", "gongshangyinhang", "gonghang"],
    initials: ["gy", "gylc", "gsyh", "gh", "icbc"] },
  { name: "农银理财", label: "农", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)",
    keywords: ["农银", "农业银行", "农行", "abc"],
    pinyin: ["nongyin", "nongyinlicai", "nongyeyinhang", "nonghang"],
    initials: ["ny", "nylc", "nyyh", "nh", "abc"] },
  { name: "中银理财", label: "中", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)",
    keywords: ["中银", "中国银行", "中行", "boc"],
    pinyin: ["zhongyin", "zhongyinlicai", "zhongguoyinhang", "zhonghang"],
    initials: ["zy", "zylc", "zgyh", "zh", "boc"] },
  { name: "建信理财", label: "建", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)",
    keywords: ["建信", "建设银行", "建行", "ccb"],
    pinyin: ["jianxin", "jianxinlicai", "jiansheyinhang", "jianhang"],
    initials: ["jx", "jxlc", "jsyh", "jh", "ccb"] },
  { name: "交银理财", label: "交", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)",
    keywords: ["交银", "交通银行", "交行", "bocom"],
    pinyin: ["jiaoyin", "jiaoyinlicai", "jiaotongyinhang", "jiaohang"],
    initials: ["jy", "jylc", "jtyh", "jh", "bocom"] },
  { name: "中邮理财", label: "邮", bg: "#fff0e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)",
    keywords: ["中邮", "邮储", "邮储银行", "邮政储蓄", "邮政储蓄银行", "中国邮政", "psbc", "youshu", "youzheng"],
    pinyin: ["zhongyou", "zhongyoulicai", "youshuyinhang", "youzhengchuxu", "zhongguoyouzheng"],
    initials: ["zy", "zylc", "ysyh", "yz", "psbc", "ycs"] },

  // ========== 股份制 ==========
  { name: "招银理财", label: "招", bg: "#fff0f0", color: "#dc2626", bar: "linear-gradient(180deg,#f87171,#dc2626)",
    keywords: ["招银", "招商银行", "招行", "cmb"],
    pinyin: ["zhaoyin", "zhaoyinlicai", "zhaoshangyinhang", "zhaohang"],
    initials: ["zy", "zylc", "zsyh", "zh", "cmb"] },
  { name: "兴银理财", label: "兴", bg: "#e6f0ff", color: "#1d4ed8", bar: "linear-gradient(180deg,#60a5fa,#1d4ed8)",
    keywords: ["兴银", "兴业银行", "兴业", "cib"],
    pinyin: ["xingyin", "xingyinlicai", "xingyeyinhang", "xingye"],
    initials: ["xy", "xylc", "xyyh", "cib"] },
  { name: "浦银理财", label: "浦", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)",
    keywords: ["浦银", "浦发", "浦发银行", "spdb"],
    pinyin: ["puyin", "puyinlicai", "pufayinhang", "pufa"],
    initials: ["py", "pylc", "pfyh", "spdb"] },
  { name: "信银理财", label: "信", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)",
    keywords: ["信银", "中信", "中信银行", "cncb"],
    pinyin: ["xinyin", "xinyinlicai", "zhongxinyinhang", "zhongxin"],
    initials: ["xy", "xylc", "zxyh", "zx", "cncb"] },
  { name: "光大理财", label: "光", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)",
    keywords: ["光大", "光大银行", "ceb"],
    pinyin: ["guangda", "guangdalicai", "guangdayinhang"],
    initials: ["gd", "gdlc", "gdyh", "ceb"] },
  { name: "民生理财", label: "民", bg: "#e6f9ed", color: "#047857", bar: "linear-gradient(180deg,#34d399,#047857)",
    keywords: ["民生", "民生银行", "cmbc"],
    pinyin: ["minsheng", "minshenglicai", "minshengyinhang"],
    initials: ["ms", "mslc", "msyh", "cmbc"] },
  { name: "华夏理财", label: "华", bg: "#ffe4e8", color: "#be123c", bar: "linear-gradient(180deg,#fb7185,#be123c)",
    keywords: ["华夏", "华夏银行", "hxb"],
    pinyin: ["huaxia", "huaxialicai", "huaxiayinhang"],
    initials: ["hx", "hxlc", "hxyh", "hxb"] },
  { name: "广银理财", label: "广", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)",
    keywords: ["广银", "广发", "广发银行", "cgb"],
    pinyin: ["guangyin", "guangyinlicai", "guangfayinhang", "guangfa"],
    initials: ["gy", "gylc", "gfyh", "gf", "cgb"] },
  { name: "平安理财", label: "平", bg: "#fff4e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)",
    keywords: ["平安", "平安银行", "pab"],
    pinyin: ["pingan", "pinganlicai", "pinganyinhang"],
    initials: ["pa", "palc", "payh", "pab"] },
  { name: "浙银理财", label: "浙", bg: "#fff0f0", color: "#dc2626", bar: "linear-gradient(180deg,#f87171,#dc2626)",
    keywords: ["浙银", "浙商", "浙商银行", "czb"],
    pinyin: ["zheyin", "zheyinlicai", "zheshangyinhang", "zheshang"],
    initials: ["zy", "zylc", "zsyh", "zs", "czb"] },
  { name: "渤银理财", label: "渤", bg: "#fff0e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)",
    keywords: ["渤银", "渤海", "渤海银行", "bob"],
    pinyin: ["boyin", "boyinlicai", "bohaiyinhang", "bohai"],
    initials: ["by", "bylc", "bhyh", "bh"] },
  { name: "恒丰理财", label: "恒", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)",
    keywords: ["恒丰", "恒丰银行"],
    pinyin: ["hengfeng", "hengfenglicai", "hengfengyinhang"],
    initials: ["hf", "hflc", "hfyh"] },

  // ========== 民营 ==========
  { name: "微众银行", label: "微", bg: "#e8f4ff", color: "#0066ff", bar: "linear-gradient(180deg,#4a9eff,#0066ff)",
    keywords: ["微众", "微众银行", "webank"],
    pinyin: ["weizhong", "weizhongyinhang"],
    initials: ["wz", "wzyh", "webank"] },
  { name: "网商银行", label: "网", bg: "#e6f0ff", color: "#1677ff", bar: "linear-gradient(180deg,#4d94ff,#1677ff)",
    keywords: ["网商", "网商银行", "mybank"],
    pinyin: ["wangshang", "wangshangyinhang"],
    initials: ["ws", "wsyh", "mybank"] },

  // ========== 城商行 ==========
  { name: "宁银理财", label: "宁", bg: "#fff4e0", color: "#d97706", bar: "linear-gradient(180deg,#fbbf24,#d97706)",
    keywords: ["宁银", "宁波银行", "宁波"],
    pinyin: ["ningyin", "ningyinlicai", "ningboyinhang", "ningbo"],
    initials: ["ny", "nylc", "nbyh", "nb"] },
  { name: "苏银理财", label: "苏", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)",
    keywords: ["苏银", "江苏银行", "江苏"],
    pinyin: ["suyin", "suyinlicai", "jiangsuyinhang", "jiangsu"],
    initials: ["sy", "sylc", "jsyh", "js"] },
  { name: "杭银理财", label: "杭", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)",
    keywords: ["杭银", "杭州银行", "杭州"],
    pinyin: ["hangyin", "hangyinlicai", "hangzhouyinhang", "hangzhou"],
    initials: ["hy", "hylc", "hzyh", "hz"] },
  { name: "徽银理财", label: "徽", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)",
    keywords: ["徽银", "徽商", "徽商银行", "徽商"],
    pinyin: ["huiyin", "huiyinlicai", "huishangyinhang", "huishang"],
    initials: ["hy", "hylc", "hsyh", "hs"] },
  { name: "南银理财", label: "南", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)",
    keywords: ["南银", "南京银行", "南京"],
    pinyin: ["nanyin", "nanyinlicai", "nanjingyinhang", "nanjing"],
    initials: ["ny", "nylc", "njyh", "nj"] },
  { name: "上银理财", label: "上", bg: "#e6f0ff", color: "#1d4ed8", bar: "linear-gradient(180deg,#60a5fa,#1d4ed8)",
    keywords: ["上银", "上海银行", "上海"],
    pinyin: ["shangyin", "shangyinlicai", "shanghaiyinhang", "shanghai"],
    initials: ["sy", "sylc", "shyh", "sh"] },
  { name: "北银理财", label: "北", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)",
    keywords: ["北银", "北京银行", "北京"],
    pinyin: ["beiyin", "beiyinlicai", "beijingyinhang", "beijing"],
    initials: ["by", "bylc", "bjyh", "bj"] },
  { name: "青银理财", label: "青", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)",
    keywords: ["青银", "青岛银行", "青岛"],
    pinyin: ["qingyin", "qingyinlicai", "qingdaoyinhang", "qingdao"],
    initials: ["qy", "qylc", "qdyh", "qd"] },

  // ========== 合资 ==========
  { name: "汇华理财", label: "汇", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)",
    keywords: ["汇华", "汇华理财"],
    pinyin: ["huihua", "huihualicai"],
    initials: ["hh", "hhlc"] },
  { name: "贝莱德建信理财", label: "贝", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)",
    keywords: ["贝莱德", "贝莱德建信"],
    pinyin: ["beilaide", "beilaidejianxin", "beilaidejianxinlicai"],
    initials: ["bld", "bl", "bldjx", "bljx"] },
  { name: "施罗德交银理财", label: "施", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)",
    keywords: ["施罗德", "施罗德交银"],
    pinyin: ["shiluode", "shiluodejiaoyin", "shiluodejiaoyinlicai"],
    initials: ["sld", "sldjy", "sldjylc"] },
  { name: "高盛工银理财", label: "高", bg: "#fff0f0", color: "#dc2626", bar: "linear-gradient(180deg,#f87171,#dc2626)",
    keywords: ["高盛", "高盛工银"],
    pinyin: ["gaosheng", "gaoshenggongyin", "gaoshenggongyinlicai"],
    initials: ["gs", "gsgy", "gsgylc"] },
  { name: "法巴农银理财", label: "法", bg: "#e6f9ed", color: "#047857", bar: "linear-gradient(180deg,#34d399,#047857)",
    keywords: ["法巴", "法巴农银", "法国巴黎银行"],
    pinyin: ["faba", "fabanongyin", "fabanongyinlicai"],
    initials: ["fb", "fbny", "fbnylc"] },

  // ========== 兜底 ==========
  { name: "其他", label: "?", bg: "#f1f3f7", color: "#64748b", bar: "linear-gradient(180deg,#cbd5e1,#94a3b8)",
    keywords: [],
    pinyin: [],
    initials: [] },
];

/**
 * 模糊匹配银行（支持中文、拼音、首字母）
 * 返回按分数排序的候选列表
 */
export function matchBanks(input: string): BankInfo[] {
  const raw = (input || "").trim();
  if (!raw) return BANKS;

  const q = raw.toLowerCase();
  const scored: { bank: BankInfo; score: number }[] = [];

  for (const b of BANKS) {
    if (b.name === "其他") continue; // 兜底不参与搜索
    let score = 0;

    // 中文完全匹配：100
    if (b.name === raw) score = 100;
    // 中文包含：80
    else if (b.name.includes(raw)) score = 80;
    // 关键词完全匹配：90
    else if (b.keywords.some(k => k === raw)) score = 90;
    // 关键词包含：70
    else if (b.keywords.some(k => k.toLowerCase().includes(q))) score = 70;
    // 全拼完全匹配：85
    else if (b.pinyin.some(p => p === q)) score = 85;
    // 首字母完全匹配：75
    else if (b.initials.some(i => i === q)) score = 75;
    // 全拼前缀：60
    else if (b.pinyin.some(p => p.startsWith(q))) score = 60;
    // 首字母前缀：50
    else if (b.initials.some(i => i.startsWith(q))) score = 50;

    if (score > 0) scored.push({ bank: b, score });
  }

  return scored.sort((a, b) => b.score - a.score).map(x => x.bank);
}

/**
 * 取单个最匹配的银行（用于旧代码兼容）
 */
export function normalizeBank(raw?: string): string {
  if (!raw) return "其他";
  const matches = matchBanks(raw);
  if (matches.length > 0) return matches[0].name;

  // 兜底：清理后返回
  const cleaned = raw.replace(/股份有限公司|有限责任公司/g, "").trim();
  return cleaned || "其他";
}

/**
 * 取银行样式信息（用于头像显示）
 */
export function getBankInfo(bank?: string): BankInfo {
  if (!bank) return BANKS[BANKS.length - 1];
  // 先精确匹配
  const exact = BANKS.find(b => b.name === bank);
  if (exact) return exact;
  // 再模糊匹配
  const matches = matchBanks(bank);
  if (matches.length > 0) return matches[0];
  return { ...BANKS[BANKS.length - 1], label: bank.slice(0, 1) || "?" };
}