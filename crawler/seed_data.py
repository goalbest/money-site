import os
import random
from datetime import datetime, timedelta
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ 没找到环境变量")
    exit()

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 22 家银行
BANKS = [
    "中邮理财", "农业银行", "上海银行", "招商银行", "工商银行",
    "建设银行", "中国银行", "交通银行", "民生银行", "兴业银行",
    "浦发银行", "中信银行", "光大银行", "平安银行", "华夏银行",
    "广发银行", "北京银行", "南京银行", "宁波银行", "杭州银行",
    "江苏银行", "上海农商行",
]

# 产品名称的常见组合
SERIES = ["鸿运", "稳健", "进取", "安心", "天天利", "朝招金", "慧财", "鑫添益", "增利", "鸿锦", "同心", "添利", "优选"]
TYPES = ["灵活", "封闭", "定期", "日开", "月开", "季开", "半年", "年开", "现金", "固收"]
SUFFIX = ["1号", "2号", "3号", "A款", "B款", "2026年第19期", "2026年第20期", "2026年第21期", "2027年第1期"]

def generate_product():
    bank = random.choice(BANKS)
    series = random.choice(SERIES)
    ptype = random.choice(TYPES)
    suffix = random.choice(SUFFIX)
    name = f"{bank}·{series}{ptype}{suffix}"
    
    unit_nav = round(random.uniform(1.0000, 1.1500), 4)
    annualized_1m = round(random.uniform(0.5, 5.5), 2)
    daily_return = round(random.uniform(0.3, 1.5), 2)
    
    # 净值日在最近 3 天内随机
    days_ago = random.randint(0, 3)
    nav_date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
    
    return {
        "name": name,
        "bank": bank,
        "unit_nav": unit_nav,
        "annualized_1m": annualized_1m,
        "daily_return": daily_return,
        "nav_date": nav_date,
    }

def seed(count=200):
    print(f"开始生成 {count} 条产品数据...")
    products = [generate_product() for _ in range(count)]
    
    # 分批插入，避免一次太多
    batch_size = 50
    inserted = 0
    for i in range(0, len(products), batch_size):
        batch = products[i:i+batch_size]
        try:
            supabase.table("products").insert(batch).execute()
            inserted += len(batch)
            print(f"✅ 已插入 {inserted}/{count} 条")
        except Exception as e:
            print(f"❌ 批次失败: {e}")
    
    print(f"🎉 完成！共插入 {inserted} 条产品数据")

if __name__ == "__main__":
    seed(200)