import { NextRequest, NextResponse } from "next/server";

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY!;
const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    const productId = formData.get("productId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请上传图片" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/png";

    const prompt = `你是理财产品信息识别助手。分析截图，返回 JSON（字段名英文，值照抄原文，不要解释）。

    【返回格式】
    {
      "pageType": "transaction_detail",
      "productName": "产品名（去掉后面的括号代码）",
      "productCode": "产品代码",
      "purchaseDate": "YYYY-MM-DD",
      "purchaseAmount": "金额数字",
      "shares": "份额数字",
      "unitNav": "净值数字"
    }
    
    【重要：识别以下关键词对应的值】
    - 产品名：页面顶部或"产品名称"后面的文字
    - 产品代码：形如 2401NB006B / JY040232 的字母数字组合（"产品编号"或"产品代码"）
    - 购买日期：找"申请日期"或"购买日期"，格式 YYYY-MM-DD
    - 购买金额：找"金额 ¥10,000.00"或"购买金额"，去掉 ¥ 和逗号，返回数字
    - 份额：找"委托份额 9500.29份"或"确认份额"，去掉"份"字，返回数字（带小数）
    - 净值：找"确认净值 1.058800"或"单位净值"，返回数字（通常在 1.0~1.5 之间）
    
    【关键】
    1. shares 是带小数的数字（如 9500.29），不是年份
    2. 如果某个字段截图上没有，**不要返回该字段**（不要编造）
    3. 只返回 JSON，无其他文字
    
    【示例】
    截图内容：
      优盛·鸿锦最短持有7天6号ESG优选B(2401NB006B)
      ¥10,000.00 确认成功
      申请日期 2026-08-05
      资金扣款日 2026-08-06
      份额确认日 2026-08-10
      委托份额 9500.29份
      合同号 08060037075411
      产品编号 2401NB006B
    
    返回：
    {
      "pageType": "transaction_detail",
      "productName": "优盛·鸿锦最短持有7天6号ESG优选B",
      "productCode": "2401NB006B",
      "purchaseDate": "2026-08-05",
      "purchaseAmount": "10000.00",
      "shares": "9500.29"
    }`;

    const body = {
      model: "glm-4v-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      temperature: 0.1,
    };

    const resp = await fetch(ZHIPU_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZHIPU_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("智谱 API 返回错误:", err);
      return NextResponse.json({ error: `识别失败: ${resp.status}` }, { status: 500 });
    }

    const result = await resp.json();
    const text = result.choices?.[0]?.message?.content || "";
    console.log("🧠 智谱识别结果:", text);

    let parsed;
    try {
      const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return NextResponse.json({
        error: "识别成功，但无法解析返回数据。请确认截图清晰度。",
        raw: text,
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: parsed });
  } catch (e: any) {
    console.error("OCR 路由错误:", e);
    return NextResponse.json({ error: e.message || "服务器错误" }, { status: 500 });
  }
}