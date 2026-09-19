import os
import ssl
import urllib3
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from supabase import create_client
from dotenv import load_dotenv

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ 没找到环境变量")
    exit()

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ========== 降级 SSL 安全级别（专治老银行） ==========
class LegacySSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        # 关键 1：降低加密等级到 1
        ctx.set_ciphers('DEFAULT@SECLEVEL=1')
        # 关键 2：允许遗留重协商
        ctx.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

session = requests.Session()
session.mount('https://', LegacySSLAdapter())
# ===================================================

def fetch_psbc_data():
    url = "https://www.psbc-wm.com/upload/report/中邮理财同心2号·鸿锦封闭式2026年第19期A理财产品净值公告_20260901_1788261000736.htm"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    print("正在请求中邮理财官网...")
    try:
        response = session.get(url, headers=headers, timeout=15, verify=False)
        response.encoding = "utf-8"
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "lxml")
        table = soup.find("table")
        if not table:
            print("⚠️ 没有找到数据表格")
            return []
        
        rows = table.find_all("tr")
        products = []
        for row in rows[1:]:
            cols = [td.get_text(strip=True) for td in row.find_all("td")]
            if len(cols) < 8:
                continue
            try:
                products.append({
                    "name": cols[1],
                    "bank": "中邮理财",
                    "unit_nav": float(cols[6]),
                    "annualized_1m": 0,
                    "daily_return": 0,
                    "nav_date": cols[5]
                })
            except (ValueError, IndexError):
                continue
        
        print(f"✅ 解析到 {len(products)} 条产品数据")
        return products
    except Exception as e:
        print(f"❌ 请求失败：{e}")
        return []

def save_to_supabase(products):
    if not products:
        print("没有数据需要保存")
        return
    for p in products:
        existing = supabase.table("products").select("id").eq("name", p["name"]).eq("bank", p["bank"]).execute()
        if existing.data:
            print(f"⏭️ 已存在，跳过：{p['name']}")
            continue
        supabase.table("products").insert(p).execute()
        print(f"✅ 成功插入：{p['name']} | 净值: {p['unit_nav']}")

if __name__ == "__main__":
    print("=== 开始抓取中邮理财数据 ===")
    data = fetch_psbc_data()
    save_to_supabase(data)
    print("🎉 任务完成！")