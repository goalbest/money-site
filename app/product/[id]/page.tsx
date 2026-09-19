import { supabase } from "../../../lib/supabase";
import NavChart from "./NavChart";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 15 中 params 是异步的，需要 await
  const { id } = await params;

  // 从数据库查这个产品
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  // 从数据库查这个产品的历史净值
  const { data: history } = await supabase
    .from("nav_history")
    .select("*")
    .eq("product_id", id)
    .order("nav_date", { ascending: true });

  if (!product) return <div className="p-8 text-center text-gray-500">没有找到该产品</div>;

  return (
    <main className="container mx-auto p-6 max-w-4xl">
      <a href="/" className="text-blue-600 text-sm hover:underline mb-4 inline-block">← 返回首页</a>

      <h1 className="text-2xl font-bold">{product.name}</h1>
      <p className="text-gray-500 mt-1 mb-6">
        {product.bank} · 单位净值 {Number(product.unit_nav).toFixed(4)} · 净值日 {product.nav_date}
      </p>

      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <h2 className="text-lg font-semibold mb-4">历史净值走势</h2>
        <NavChart data={history || []} />
      </div>
    </main>
  );
}