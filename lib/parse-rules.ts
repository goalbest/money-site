// lib/parse-rules.ts

export type TradingRules = {
  redeem_arrival_days: number | null;      // 到账 T+N
  redeem_confirm_days: number | null;      // 确认 T+N
  redeem_cutoff_time: string | null;       // 截止时间 "17:00"
  risk_level: string | null;               // "R2" / "PR2"
};

/**
 * 从任意文本解析交易规则
 */
export function parseTradingRules(text: string): TradingRules {
  if (!text) return { redeem_arrival_days: null, redeem_confirm_days: null, redeem_cutoff_time: null, risk_level: null };

  const rules: TradingRules = {
    redeem_arrival_days: null,
    redeem_confirm_days: null,
    redeem_cutoff_time: null,
    risk_level: null,
  };

  // ① 风险等级：PR2 / R2 / 中低风险
  const riskMatch = text.match(/(?:P?R)(\d)/i);
  if (riskMatch) rules.risk_level = `R${riskMatch[1]}`;

  // ② 到账 T+N
  const arrivalT = text.match(/(?:本金|资金|预计|最快)?\s*T\+?(\d+)\s*(?:个?交易日?)?\s*(?:内|到账|日)/);
  if (arrivalT) rules.redeem_arrival_days = parseInt(arrivalT[1], 10);

  // ③ "N个工作日内" 到账
  if (rules.redeem_arrival_days === null) {
    const arrivalWork = text.match(/赎回日[^\d]*?(\d+)\s*个工作日内/);
    if (arrivalWork) rules.redeem_arrival_days = parseInt(arrivalWork[1], 10);
  }

  // ④ 确认 T+N
  const confirmT = text.match(/T\+?(\d+)\s*(?:个?交易日?)?\s*(?:确认|内确认)/);
  if (confirmT) rules.redeem_confirm_days = parseInt(confirmT[1], 10);

  // ⑤ 截止时间（15:00 / 17:00）—— 找 "XX:XX前" 且紧邻"赎回"
  const cutoffRe = /(\d{1,2}):(\d{2})\s*(?:前|之前)/g;
  let cutoffMatch;
  while ((cutoffMatch = cutoffRe.exec(text)) !== null) {
    const before = text.slice(Math.max(0, cutoffMatch.index - 30), cutoffMatch.index);
    if (before.includes('赎回') || before.includes('申请') || before.includes('提交')) {
      const h = cutoffMatch[1].padStart(2, '0');
      const m = cutoffMatch[2];
      rules.redeem_cutoff_time = `${h}:${m}`;
      break;
    }
  }
  // 兜底：任意 "XX:XX前"
  if (!rules.redeem_cutoff_time) {
    const anyCutoff = text.match(/(\d{1,2}):(\d{2})\s*(?:前|之前)/);
    if (anyCutoff) {
      rules.redeem_cutoff_time = `${anyCutoff[1].padStart(2, '0')}:${anyCutoff[2]}`;
    }
  }

  return rules;
}