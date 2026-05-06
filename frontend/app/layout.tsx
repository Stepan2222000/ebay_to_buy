import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ebay to buy",
  description: "Внутренний список закупки eBay для смарт-артикулов.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <div className="app-shell">
          <header className="app-header">
            <Link href="/" className="app-wordmark">ebay to buy.</Link>
            <nav className="app-nav">
              <Link href="/" className="app-nav-link">Все цели</Link>
              <Link href="/needed" className="app-nav-link">Нехватка</Link>
              <Link href="/targets/new" className="app-nav-link">Новая цель</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
