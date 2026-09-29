"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function HoldingRedirect() {
  const params = useParams();
  const router = useRouter();
  const holdingId = params.id as string;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_holdings")
        .select("product_id")
        .eq("id", Number(holdingId))
        .maybeSingle();

      if (data?.product_id) {
        router.replace(`/product/${data.product_id}`);
      } else {
        router.replace("/holdings");
      }
    })();
  }, [holdingId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-slate-400 text-sm">正在打开产品详情...</div>
    </div>
  );
}