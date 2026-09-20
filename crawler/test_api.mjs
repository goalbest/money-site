const url = "https://xinxipilu.chinawealth.com.cn/lcxp-platService/product/getProductList";

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Content-Type": "application/json;charset=UTF-8",
  "Origin": "https://xinxipilu.chinawealth.com.cn",
  "Referer": "https://xinxipilu.chinawealth.com.cn/queryMenu/prodType",
  "Accept": "application/json, text/plain, */*",
};

async function test() {
  console.log("Test 1: plain JSON");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ pageNum: 1, pageSize: 20 }),
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text.slice(0, 600));
  } catch (e) {
    console.log("Failed:", e.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  console.log("Test 2: empty JSON");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text.slice(0, 600));
  } catch (e) {
    console.log("Failed:", e.message);
  }
}

test();