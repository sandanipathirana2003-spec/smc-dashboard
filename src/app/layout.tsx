import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMC Terminal",
  description: "Trend + CHoCH/BOS + Order Block/FVG signal terminal for Binance USDT-M Futures",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full bg-zinc-950">{children}</body>
    </html>
  );
}
