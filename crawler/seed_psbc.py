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

# 邮储产品的常见系列名
SERIES = ["邮银财富", "邮储鸿运", "鸿锦", "鸿运", "财富鑫鑫", "日日升", "月月升", "鑫鑫向荣", "邮益宝"]
TYPES = ["灵活", "封闭", "定期", "日开", "月开", "季开", "半年", "年开", "现金", "固收", "净值"]
SUFFIX = ["1号", "2号", "3号", "A款", "B款", "2026年第19期", "2026年第20期", "2026年第21期"]

def generate_product():
    series = random.choice(SERIES)
    ptype = random.choice(TYPES)
    suffix = random.choice(SUFFIX)
    name = f"邮储银行·{series}{ptype}{suffix}"
    
    unit_nav = round(random.uniform(1.0000, 1.1500), 4)
    annualized_1m = round(random.uniform(0.5, 5.5), 2)
    daily_return = round(random.uniform(0.3, 1.5), 2)
    
    days_ago = random.randint(0, 3)
    nav_date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
    
    return {
        "name": name,
        "bank": "邮储银行",
        "unit_nav": unit_nav,
        "annualized_1m": annualized_1m,
        "daily_return": daily_return,
        "nav_date": nav_date,
    }

if __name__ == "__main__":
    count = 30
    print(f"开始生成 {count} 条邮储银行产品...")
    products = [generate_product() for _ in range(count)]
    
    try:
        supabase.table("products").insert(products).execute()
        print(f"✅ 已插入 {count} 条邮储产品")
    except Exception as e:
        print(f"❌ 插入失败: {e}")
    
    print("🎉 完成！")