import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "./BottomNav";

export const metadata: Metadata = {
  title: "理财净值观察站",
  description: "个人理财持仓管理工具",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gray-50">
        <div className="pb-16">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}