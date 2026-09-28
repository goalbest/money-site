import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "./BottomNav";

export const metadata: Metadata = {
  title: "理财净值观察站",
  description: "个人理财持仓管理工具",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // 原来是 #0a0a1a（深色遗留），改成与页面背景一致
  themeColor: "#f5f6fa",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      {/* 删掉 text-white（与浅色背景冲突）；antialiased 由 globals.css 的 html/body 接管 */}
      <body>
        {/* 为底部导航预留空间；页面内部不要再叠加 pb-*} */}
        <div className="pb-20">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}