export type BankInfo = {
  name: string;
  label: string;
  bg: string;
  color: string;
  bar: string;
  keywords: string[];
};

export const BANKS: BankInfo[] = [
  { name: "中邮理财", label: "中", bg: "#fff0e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)", keywords: ["中邮"] },
  { name: "交银理财", label: "交", bg: "#e6f0ff", color: "#2563eb", bar: "linear-gradient(180deg,#60a5fa,#2563eb)", keywords: ["交银"] },
  { name: "招银理财", label: "招", bg: "#fff0f0", color: "#dc2626", bar: "linear-gradient(180deg,#f87171,#dc2626)", keywords: ["招银"] },
  { name: "工银理财", label: "工", bg: "#ffeaea", color: "#c81e1e", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["工银"] },
  { name: "建信理财", label: "建", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["建信"] },
  { name: "农银理财", label: "农", bg: "#e6f9ed", color: "#059669", bar: "linear-gradient(180deg,#34d399,#059669)", keywords: ["农银"] },
  { name: "中银理财", label: "中", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["中银"] },
  { name: "平安理财", label: "平", bg: "#fff4e6", color: "#ea580c", bar: "linear-gradient(180deg,#fb923c,#ea580c)", keywords: ["平安"] },
  { name: "兴银理财", label: "兴", bg: "#e6f0ff", color: "#1d4ed8", bar: "linear-gradient(180deg,#60a5fa,#1d4ed8)", keywords: ["兴银", "兴业"] },
  { name: "民生理财", label: "民", bg: "#e6f9ed", color: "#047857", bar: "linear-gradient(180deg,#34d399,#047857)", keywords: ["民生"] },
  { name: "光大理财", label: "光", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["光大"] },
  { name: "浦银理财", label: "浦", bg: "#e0f7fb", color: "#0e7490", bar: "linear-gradient(180deg,#22d3ee,#0e7490)", keywords: ["浦发", "浦银"] },
  { name: "信银理财", label: "信", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["信银", "中信"] },
  { name: "华夏理财", label: "华", bg: "#ffe4e8", color: "#be123c", bar: "linear-gradient(180deg,#fb7185,#be123c)", keywords: ["华夏"] },
  { name: "广银理财", label: "广", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["广发", "广银"] },
  { name: "苏银理财", label: "苏", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["苏银", "江苏银行"] },
  { name: "杭银理财", label: "杭", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["杭银", "杭州银行"] },
  { name: "徽银理财", label: "徽", bg: "#f3e8ff", color: "#6d28d9", bar: "linear-gradient(180deg,#a78bfa,#6d28d9)", keywords: ["徽商", "徽银"] },
  { name: "宁银理财", label: "宁", bg: "#fff4e0", color: "#d97706", bar: "linear-gradient(180deg,#fbbf24,#d97706)", keywords: ["宁波", "宁银"] },
  { name: "北京银行", label: "北", bg: "#fde8e8", color: "#b91c1c", bar: "linear-gradient(180deg,#f87171,#b91c1c)", keywords: ["北京银行"] },
  { name: "上海银行", label: "上", bg: "#e6f0ff", color: "#1d4ed8", bar: "linear-gradient(180deg,#60a5fa,#1d4ed8)", keywords: ["上海银行"] },
  { name: "南京银行", label: "南", bg: "#e8f4ff", color: "#0369a1", bar: "linear-gradient(180deg,#38bdf8,#0369a1)", keywords: ["南京银行"] },
  { name: "其他", label: "?", bg: "#f1f3f7", color: "#64748b", bar: "linear-gradient(180deg,#cbd5e1,#94a3b8)", keywords: [] },
];

export function getBankInfo(bank?: string): BankInfo {
  if (!bank) return BANKS[BANKS.length - 1];
  const cleaned = bank.replace(/银行|理财|股份有限公司|有限责任公司/g, "").trim();
  for (const b of BANKS) {
    for (const kw of b.keywords) {
      if (cleaned.includes(kw)) return b;
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