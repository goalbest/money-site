import os
import ssl
import urllib3
import requests
from bs4 import BeautifulSoup
from supabase import create_client
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ 没找到环境变量")
    exit()

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 破解老旧服务器 SSL 问题
class LegacySSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers('DEFAULT@SECLEVEL=1')
        ctx.options |= 0x4
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

session = requests.Session()
session.mount('https://', LegacySSLAdapter())

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

def fetch_product_list():
    """抓取中邮理财官网产品列表页（第一页）"""
    # 中邮理财官网的产品列表页
    url = "https://www.psbc-wm.com/psbcwm/cn/tzzgx/cpgg/index.html"
    
    print(f"正在请求: {url}")
    try:
        resp = session.get(url, headers=HEADERS, timeout=15, verify=False)
        resp.encoding = "utf-8"
        print(f"状态码: {resp.status_code}, 长度: {len(resp.text)}")
        
        soup = BeautifulSoup(resp.text, "lxml")
        
        # 尝试提取所有产品公告链接
        links = []
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            text = a.get_text(strip=True)
            # 筛选产品公告类的链接
            if ("cpgg" in href or "product" in href.lower() or "chanpin" in href.lower()) and text and len(text) > 4:
                if href.startswith("/"):
                    href = "https://www.psbc-wm.com" + href
                elif not href.startswith("http"):
                    href = "https://www.psbc-wm.com/" + href
                links.append({"url": href, "title": text})
        
        # 去重
        seen = set()
        unique_links = []
        for l in links:
            if l["url"] not in seen:
                seen.add(l["url"])
                unique_links.append(l)
        
        print(f"找到 {len(unique_links)} 个候选链接")
        for l in unique_links[:10]:
            print(f"  - {l['title'][:40]}: {l['url']}")
        
        return unique_links
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return []

def fetch_detail(url):
    """从单个公告页提取产品数据"""
    try:
        resp = session.get(url, headers=HEADERS, timeout=15, verify=False)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")
        
        table = soup.find("table")
        if not table:
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
                    "bank": "邮储银行",
                    "unit_nav": float(cols[6]),
                    "annualized_1m": 0,
                    "daily_return": 0,
                    "nav_date": cols[5],
                })
            except (ValueError, IndexError):
                continue
        return products
    except Exception as e:
        print(f"  ⚠️ 详情页失败: {e}")
        return []

if __name__ == "__main__":
    print("=== 尝试抓取中邮理财全量产品 ===")
    links = fetch_product_list()
    
    if not links:
        print("❌ 未找到链接，网站可能改版或需要 JS 渲染")
        exit()
    
    all_products = []
    # 只尝试前 5 个链接，避免请求过多
    for link in links[:5]:
        print(f"\n抓取: {link['title'][:30]}")
        products = fetch_detail(link["url"])
        all_products.extend(products)
        print(f"  得到 {len(products)} 条产品")
    
    if not all_products:
        print("\n⚠️ 没有抓到任何产品数据")
        exit()
    
    # 按名称去重
    seen = set()
    unique = []
    for p in all_products:
        if p["name"] not in seen:
            seen.add(p["name"])
            unique.append(p)
    
    print(f"\n去重后共 {len(unique)} 条产品")
    
    # 分批插入
    inserted = 0
    for i in range(0, len(unique), 50):
        batch = unique[i:i+50]
        try:
            supabase.table("products").insert(batch).execute()
            inserted += len(batch)
            print(f"✅ 已插入 {inserted}/{len(unique)}")
        except Exception as e:
            print(f"❌ 批次失败: {e}")
    
    print(f"🎉 完成！共插入 {inserted} 条")