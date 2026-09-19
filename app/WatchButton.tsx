"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function WatchButton({ productId }: { productId: number }) {
  const [isWatched, setIsWatched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // 组件挂载时，读 user_id 并检查是否已加入自选
  useEffect(() => {
    const id = localStorage.getItem("user_id");
    setUserId(id);
    if (!id) return;

    async function check() {
      const { data } = await supabase
        .from("user_watchlist")
        .select("id")
        .eq("user_id", id)
        .eq("product_id", productId)
        .maybeSingle();
      if (data) setIsWatched(true);
    }
    check();
  }, [productId]);

  async function toggle() {
    if (!userId) {
      alert("请先登录后再加自选");
      return;
    }
    setLoading(true);
    if (isWatched) {
      await supabase
        .from("user_watchlist")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", productId);
      setIsWatched(false);
    } else {
      await supabase
        .from("user_watchlist")
        .insert({ user_id: userId, product_id: productId });
      setIsWatched(true);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-lg transition ${
        isWatched ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"
      }`}
      title={isWatched ? "取消自选" : "加自选"}
    >
      {isWatched ? "★" : "☆"}
    </button>
  );
}