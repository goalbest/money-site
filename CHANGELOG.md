# 更新日志

## v4.0.0 - 2026-10-01

### 🎉 新增
- 数据导出：持仓 CSV / 交易 CSV / 完整 JSON 备份（`/export`）
- 持仓页新增"自选" Tab（4 个 Tab：持仓 / 自选 / 已清仓 / 监控）
- 首页搜索框旁新增"发现"入口
- 交易记录页按日期分组显示
- 持仓页 Hero 卡"收益"标签显示净值日期（数据陈旧时琥珀色提醒）
- 粘贴链接自动添加产品（支持邮储 / 招行 / 交银 / 中国银行）
- 手动添加邮储/中邮产品时自动补全 `bank_code` 并复用已有产品

### 🔧 重构
- 产品页 = 持仓页合并（/holdings/[id] 重定向到 /product/[id]）
- 产品信息卡合并"我的持仓"数据
- 编辑持仓改用弹窗（EditHoldingModal），不再跳页
- 长按标题直接进入拖动态（一步到位）
- BankSelect 支持搜索 + 常用大行分组 + 按字母 A-Z 分组
- 交易编辑支持改金额 / 份额 / 净值，三字段联动

### 🎨 UI 统一
- 全站卡片、按钮、Tab、输入框对齐紫粉规范
- 涨红跌绿：rose-500 / emerald-500
- 所有数字用等宽字体 .tabular
- 登录页 / 自选页 / 交易页 全新重构
- 空状态统一用紫粉渐变图标

### 🤖 抓取系统
- **招行/交银**：Playwright + 翻页，抓全部历史（从成立日到最新），每 4 小时更新
- **中国银行**：Playwright 抓页面，每 4 小时更新
- **邮储/中邮**：从全量 400 页改为**按需抓**（只抓库里产品，10 秒完成）
- 三个 workflow 统一频率：**北京时间 6/10/14/18/22 点**
- 新增 `PSBC History Backfill`（一次性补全历史）

### 🐛 修复
- 日历页删除"今天回退"逻辑，避免显示假数据
- useMemo / useCountUp 等 hook import 修复
- 表单、弹窗 z-index 层级修复
- 手动添加产品时复用已有 id，避免唯一约束冲突

### 🗑️ 清理
- 删除孤儿组件：Portal / BackButton / FetchNoticeButton / WatchButton
- 删除 /holdings/[id] 和 /monitor 目录（改为重定向）

### ⚠️ 数据库变更

#### 新增表
- **`product_sources`** — 记录产品抓取源（支持"粘贴链接添加 + 定时自动更新"）
  - 字段：`id`, `product_id`, `source_type`（psbc/zywm/cmb/boc）, `source_url`, `params` (jsonb), `enabled`, `created_at`, `last_fetch_at`, `last_error`

#### 新增字段
- **`products.annual_7d_yield`** (numeric) — 7 日年化收益率（现金管理类产品）
- **`products.daily_income`** (numeric) — 万份收益

#### 新增约束
- **`products_bank_code_key`** — `products.bank_code` 唯一（防止同产品重复入库）
- **`product_sources_product_id_key`** — `product_sources.product_id` 唯一（一产品一来源）

#### 新增索引
- `idx_products_bank_code` / `idx_products_name` / `idx_products_bank`（加速搜索）
- `idx_product_sources_type`（按银行类型快速读源）

#### RLS 策略（三表全开读写）
- `products_all` / `nav_history_all` / `product_sources_all`

#### 备份表（一次性，可保留）
- `products_backup_20261001` — 清理前 4067 条快照
- `nav_history_backup_20261001` — 清理前 5222 条快照

#### 数据清理
- 产品库 **4067 → 21 条**（只保留：用户持仓 / 自选 / 监控 / 交易 / 手动添加的产品）
- `nav_history` **5222 → ~2054 条**
- 合并重复产品：`955 → 960`（招银招睿添金 14 天持有）

#### 数据回填
- 招行 3 个产品：从最新 30 条 → **136/146/137 条**（从成立日至今）
- 邮储/中邮 16 个产品：从最新 1 条 → **每条 300+ 条**

---

## v3.2.0（示例）
（你之前的记录保留在这里）