import requests
import json

url = "https://xinxipilu.chinawealth.com.cn/lcxp-platService/product/getProductList"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/json;charset=UTF-8",
    "Origin": "https://xinxipilu.chinawealth.com.cn",
    "Referer": "https://xinxipilu.chinawealth.com.cn/queryMenu/prodType",
    "Accept": "application/json, text/plain, */*",
}

payload_plain = {
    "pageNum": 1,
    "pageSize": 20,
    "prodType": "",
}

print("Test 1: plain JSON")
try:
    r = requests.post(url, json=payload_plain, headers=headers, timeout=15)
    print("Status:", r.status_code)
    print("Response:", r.text[:500])
except Exception as e:
    print("Failed:", e)

print("\n" + "="*50 + "\n")

print("Test 2: empty JSON")
try:
    r = requests.post(url, json={}, headers=headers, timeout=15)
    print("Status:", r.status_code)
    print("Response:", r.text[:500])
except Exception as e:
    print("Failed:", e)