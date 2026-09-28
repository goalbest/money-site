/**
 * 银行 APP URL Scheme 映射
 * 
 * ⚠️ URL Scheme 由各银行自行定义，可能随时间调整。若某个跳转失败，
 *    请更新此处的 scheme 值。常见调试方法：
 *    1. 在手机上手动访问 scheme（如 cmbmobilebank://）
 *    2. 打开 APP 后用 Charles / Fiddler 抓包
 *    3. 查官方开放平台文档
 */
export const BANK_APPS: Record<string, {
  name: string;
  scheme: string;
}> = {
  // key 对应 products.bank 的值
  "中邮":   { name: "邮储银行",   scheme: "psbc://" },
  "交银":   { name: "交通银行",   scheme: "bocom://" },
  "招银":   { name: "招商银行",   scheme: "cmbmobilebank://" },
  "工银":   { name: "工商银行",   scheme: "icbc://" },
  "工商":   { name: "工商银行",   scheme: "icbc://" },
  "建信":   { name: "建设银行",   scheme: "ccb://" },
  "农银":   { name: "农业银行",   scheme: "abc://" },
  "中银":   { name: "中国银行",   scheme: "boc://" },
  "宁波":   { name: "宁波银行",   scheme: "nbbank://" },
};

/**
 * 尝试打开对应银行的 APP
 * 
 * 行为：
 * 1. 复制产品名到剪贴板（方便用户在银行 APP 里搜索产品）
 * 2. 尝试用 URL Scheme 唤起 APP
 * 3. 1.5 秒后如果页面仍然可见（说明没跳走），提示用户未安装
 */
export function openBankApp(bankName: string, productName?: string) {
  const info = BANK_APPS[bankName];
  if (!info) {
    alert(`请打开"${bankName}"APP 进行赎回操作`);
    return;
  }

  // 复制产品名到剪贴板，方便用户在银行 APP 里粘贴搜索
  if (productName && typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(productName).catch(() => {});
  }

  // 尝试唤起 APP
  const before = Date.now();
  window.location.href = info.scheme;

  // 1.5 秒后检测是否跳走
  setTimeout(() => {
    // 如果页面还可见，说明 APP 没被唤起（未安装或被拦截）
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      Date.now() - before < 2000
    ) {
      alert(
        `未检测到"${info.name}"APP\n` +
        (productName ? `产品名已复制到剪贴板，可到 APP 中搜索\n` : "") +
        `或手动打开银行 APP 操作`
      );
    }
  }, 1500);
}