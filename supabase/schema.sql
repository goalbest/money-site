-- ══════════════════════════════════════════════════════════════
-- 理财净值观察站 · 数据库 schema
-- 更新日期：2026-10-01（v4.0.0）
-- 幂等：可重复执行，不会破坏已有数据
-- ══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────
-- ① products：产品主表
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                bigserial PRIMARY KEY,
  name              text NOT NULL,
  bank              text,
  code              text,                          -- 登记编码（如 Z70019...）
  bank_code         text,                          -- 银行销售代码（如 2401NB006B / JY040232）
  sale_code         text,
  unit_nav          numeric,
  accum_nav         numeric,
  annualized_1m     numeric,                       -- 近 1 月年化
  daily_return      numeric,                       -- 万份收益
  annual_7d_yield   numeric,                       -- 7 日年化（现金管理类）
  daily_income      numeric,                       -- 万份收益（现金管理类）
  nav_date          date,
  risk_level        text,                          -- PR1 ~ PR5
  category          text,                          -- 固收类 / 混合类 等
  operate_mode      text,                          -- 开放式 / 封闭式 等
  t_plus_days       integer,                       -- T+N 到账
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_bank_code ON products(bank_code);
CREATE INDEX IF NOT EXISTS idx_products_name      ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_bank      ON products(bank);

-- bank_code 唯一（防重复入库）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_bank_code_key'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_bank_code_key UNIQUE (bank_code);
  END IF;
END $$;

-- ────────────────────────────────────────────
-- ② nav_history：净值历史
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nav_history (
  id          bigserial PRIMARY KEY,
  product_id  bigint REFERENCES products(id) ON DELETE CASCADE,
  nav_date    date NOT NULL,
  unit_nav    numeric NOT NULL,
  accum_nav   numeric,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nav_history_product_date ON nav_history(product_id, nav_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nav_history_product_date_key'
  ) THEN
    ALTER TABLE nav_history ADD CONSTRAINT nav_history_product_date_key UNIQUE (product_id, nav_date);
  END IF;
END $$;

-- ────────────────────────────────────────────
-- ③ user_holdings：用户持仓
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_holdings (
  id                bigserial PRIMARY KEY,
  user_id           bigint NOT NULL,
  product_id        bigint REFERENCES products(id) ON DELETE CASCADE,
  holding_amount    numeric DEFAULT 0,              -- 当前持仓金额
  in_transit_amount numeric DEFAULT 0,              -- 在途金额
  purchase_amount   numeric DEFAULT 0,              -- 累计买入金额
  shares            numeric DEFAULT 0,              -- 持有份额
  hold_date         date,
  status            text DEFAULT 'active',          -- active / closed
  closed_at         timestamptz,
  closed_amount     numeric,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_holdings_user_status ON user_holdings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_holdings_product    ON user_holdings(product_id);

-- ────────────────────────────────────────────
-- ④ transactions：交易记录
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL,
  product_id  bigint REFERENCES products(id) ON DELETE CASCADE,
  type        text NOT NULL,                        -- buy / sell / dividend
  amount      numeric,
  shares      numeric,
  price       numeric,                              -- 交易时净值
  trade_date  date,
  note        text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_product   ON transactions(product_id);

-- ────────────────────────────────────────────
-- ⑤ watch_rules：净值监控规则
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watch_rules (
  id              bigserial PRIMARY KEY,
  user_id         bigint NOT NULL,
  product_id      bigint REFERENCES products(id) ON DELETE CASCADE,
  conditions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  condition_logic text DEFAULT 'AND',               -- AND / OR
  enabled         boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watch_rules_user    ON watch_rules(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_watch_rules_product ON watch_rules(product_id);

-- ────────────────────────────────────────────
-- ⑥ search_logs：搜索日志
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_logs (
  id          bigserial PRIMARY KEY,
  keyword     text NOT NULL,
  user_id     bigint,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_keyword ON search_logs(keyword);
CREATE INDEX IF NOT EXISTS idx_search_logs_date    ON search_logs(created_at DESC);

-- ────────────────────────────────────────────
-- ⑦ product_sources：产品抓取源（v4.0 新增）
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_sources (
  id            bigserial PRIMARY KEY,
  product_id    bigint REFERENCES products(id) ON DELETE CASCADE,
  source_type   text NOT NULL,                      -- psbc / zywm / cmb / boc
  source_url    text,                               -- 用户粘贴的原始链接
  params        jsonb NOT NULL DEFAULT '{}'::jsonb, -- 抓取参数
  enabled       boolean DEFAULT true,
  last_fetch_at timestamptz,
  last_error    text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_sources_type ON product_sources(source_type, enabled);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_sources_product_id_key'
  ) THEN
    ALTER TABLE product_sources ADD CONSTRAINT product_sources_product_id_key UNIQUE (product_id);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- ⑧ RLS 策略：全开读写（个人自用）
-- ══════════════════════════════════════════════════════════════
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_holdings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sources  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'nav_history', 'user_holdings', 'transactions', 'watch_rules', 'search_logs', 'product_sources']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_all" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════
-- 完成
-- ══════════════════════════════════════════════════════════════