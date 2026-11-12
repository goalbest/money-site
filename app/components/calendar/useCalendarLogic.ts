import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { monthEnd, prevMonthLastDay } from "./utils";

const CACHE_KEY = "cache_calendar_logic_v1";

export function useCalendarLogic(month: string) {
  // ================= 1. 缓存初始化 =================
  const [holdings, setHoldings] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const c = localStorage.getItem(CACHE_KEY);
      if (c) return JSON.parse(c).holdings || [];
    }
    return [];
  });
  
  const [transactions, setTransactions] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const c = localStorage.getItem(CACHE_KEY);
      if (c) return JSON.parse(c).transactions || [];
    }
    return [];
  });

  const [navCache, setNavCache] = useState<Record<string, any[]>>(() => {
    if (typeof window !== "undefined") {
      const c = localStorage.getItem(CACHE_KEY);
      if (c) return JSON.parse(c).navCache || {};
    }
    return {};
  });

  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") return !localStorage.getItem(CACHE_KEY);
    return true;
  });
  
  const [holdingsLoaded, setHoldingsLoaded] = useState(() => {
    if (typeof window !== "undefined") return !!localStorage.getItem(CACHE_KEY);
    return false;
  });

  const [navRows, setNavRows] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const c = localStorage.getItem(CACHE_KEY);
      if (c) {
        const navC = JSON.parse(c).navCache || {};
        if (navC[month]) return navC[month];
      }
    }
    return [];
  });

  const [navLoading, setNavLoading] = useState(false);

  // ================= 2. 初次拉取（全量或增量） =================
  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) { setLoading(false); setHoldingsLoaded(true); return; }

    (async () => {
      try {
        const { data: hd } = await supabase
          .from("user_holdings")
          .select("id, product_id, shares, holding_amount, hold_date, products(id, name, bank, daily_return)")
          .eq("user_id", userId)
          .eq("status", "active");
        
        const { data: txs } = await supabase
          .from("transactions")
          .select("product_id, type, shares, trade_date")
          .eq("user_id", userId)
          .order("trade_date", { ascending: true });

        setHoldings(hd || []);
        setTransactions(txs || []);
        setHoldingsLoaded(true);
        
        if (!hd || hd.length === 0) setLoading(false);

        const currentCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"navCache":{}}');
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          holdings: hd || [],
          transactions: txs || [],
          navCache: currentCache.navCache || {}
        }));
      } catch (err) {
        setHoldingsLoaded(true);
        setLoading(false);
      }
    })();
  }, []);

  // ================= 3. 监听当前月份的净值加载 =================
  useEffect(() => {
    if (!holdingsLoaded) return;
    if (holdings.length === 0) { setLoading(false); return; }

    // 如果缓存里有，直接瞬显
    if (navCache[month]) {
      setNavRows(navCache[month]);
      setLoading(false);
      setNavLoading(false);
      return;
    }

    setNavLoading(true);
    (async () => {
      try {
        const productIds = holdings.map((h: any) => h.product_id);
        const start = prevMonthLastDay(month);
        const end = monthEnd(month);
        
        const { data: navs } = await supabase
          .from("nav_history")
          .select("product_id, nav_date, unit_nav")
          .in("product_id", productIds)
          .gte("nav_date", start)
          .lte("nav_date", end)
          .order("nav_date", { ascending: true });

        const rows = navs || [];
        setNavRows(rows);
        
        setNavCache(prev => {
          const next = { ...prev, [month]: rows };
          const currentCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"holdings":[],"transactions":[]}');
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            holdings: currentCache.holdings || [],
            transactions: currentCache.transactions || [],
            navCache: next
          }));
          return next;
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setNavLoading(false);
      }
    })();
  }, [month, holdingsLoaded, holdings.length]);

  // ================= 4. 核心：Realtime 实时监听只更新变动部分 =================
  useEffect(() => {
    if (!holdingsLoaded || holdings.length === 0) return;
    const productIds = holdings.map((h: any) => h.product_id);

    // 监听 transactions 表的变化（有人买卖了）
    const txChannel = supabase
      .channel("calendar_tx_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, async () => {
        // 交易变了，说明持仓可能变了，静默拉取一次持仓和交易，不转圈
        const userId = localStorage.getItem("user_id");
        if (!userId) return;
        const { data: txs } = await supabase.from("transactions").select("*").eq("user_id", userId);
        const { data: hd } = await supabase.from("user_holdings").select("*").eq("user_id", userId).eq("status", "active");
        if (txs) setTransactions(txs);
        if (hd) setHoldings(hd);
      })
      .subscribe();

    // 监听 nav_history 表的变化（有了新净值）
    const navChannel = supabase
      .channel("calendar_nav_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "nav_history" }, (payload) => {
        const newNav = payload.new;
        // 如果新净值属于当前查看的月份，且是持有的产品，直接拼接到数组里，0网络请求！
        if (newNav && productIds.includes(newNav.product_id)) {
          const navMonth = newNav.nav_date.slice(0, 7);
          
          // 更新本地 navCache 和 navRows
          setNavCache(prev => {
            const monthData = prev[navMonth] ? [...prev[navMonth]] : [];
            // 避免重复添加
            if (!monthData.some(d => d.product_id === newNav.product_id && d.nav_date === newNav.nav_date)) {
              monthData.push({ product_id: newNav.product_id, nav_date: newNav.nav_date, unit_nav: newNav.unit_nav });
              // 排序
              monthData.sort((a, b) => a.nav_date.localeCompare(b.nav_date));
            }
            const next = { ...prev, [navMonth]: monthData };
            
            // 如果当前就在看这个月，顺便更新视图
            if (navMonth === month) setNavRows(monthData);
            
            // 写入本地缓存
            const currentCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"holdings":[],"transactions":[]}');
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              ...currentCache,
              navCache: next
            }));
            return next;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(txChannel);
      supabase.removeChannel(navChannel);
    };
  }, [holdingsLoaded, holdings.length, month]);

  // ----- 计算逻辑保持不变 -----
  const {
    dayMap, productDayMap, productMonthlyMap, productZeroDaysMap, totalProfit, tradedDays
  } = useMemo(() => {
    const navByProduct: Record<number, { date: string; nav: number }[]> = {};
    navRows.forEach((r: any) => {
      if (!navByProduct[r.product_id]) navByProduct[r.product_id] = [];
      navByProduct[r.product_id].push({ date: r.nav_date, nav: Number(r.unit_nav) });
    });

    const sharesByDay: Record<number, Record<string, number>> = {};
    holdings.forEach(h => {
      const pid = h.product_id;
      sharesByDay[pid] = {};
      let currentShares = 0;
      const pTxs = transactions.filter(t => t.product_id === pid);
      const navList = navByProduct[pid] || [];
      if (navList.length === 0) return;

      let txIdx = 0;
      for (const n of navList) {
        while (txIdx < pTxs.length && pTxs[txIdx].trade_date <= n.date) {
          const tx = pTxs[txIdx];
          if (tx.type === "buy") currentShares += Number(tx.shares);
          else if (tx.type === "sell" || tx.type === "close") currentShares -= Number(tx.shares);
          txIdx++;
        }
        sharesByDay[pid][n.date] = currentShares;
      }
    });

    const dayMap: Record<string, number> = {};
    const productDayMap: Record<string, Record<number, number>> = {};
    const productMonthlyMap: Record<number, number> = {};
    const productZeroDaysMap: Record<number, number> = {};
    const mStart = `${month}-01`;
    const mEnd = monthEnd(month);

    Object.entries(navByProduct).forEach(([pidStr, list]) => {
      const pid = Number(pidStr);
      for (let i = 1; i < list.length; i++) {
        const t = list[i];
        const p = list[i - 1];
        if (t.date < mStart || t.date > mEnd) continue;

        const realShares = sharesByDay[pid]?.[t.date] ?? 0;
        let profit = realShares > 0 ? realShares * (t.nav - p.nav) : 0;

        dayMap[t.date] = (dayMap[t.date] || 0) + profit;
        if (!productDayMap[t.date]) productDayMap[t.date] = {};
        productDayMap[t.date][pid] = profit;
        productMonthlyMap[pid] = (productMonthlyMap[pid] || 0) + profit;
        if (profit <= 0) productZeroDaysMap[pid] = (productZeroDaysMap[pid] || 0) + 1;
      }
    });

    const values = Object.values(dayMap);
    return {
      dayMap, productDayMap, productMonthlyMap, productZeroDaysMap,
      totalProfit: values.reduce((a, b) => a + b, 0),
      tradedDays: values.length,
    };
  }, [holdings, navRows, transactions, month]);

  return {
    holdings, transactions, navRows, loading, navLoading,
    dayMap, productDayMap, productMonthlyMap, productZeroDaysMap, totalProfit, tradedDays
  };
}