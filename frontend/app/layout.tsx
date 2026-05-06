import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ThemeToggle } from "./_components/ThemeToggle";

// Inline-скрипт: ставит data-theme до первой отрисовки, чтобы избежать FOUC.
const themeBootstrap = `(() => {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") { document.documentElement.dataset.theme = t; return; }
    document.documentElement.dataset.theme =
      window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch { document.documentElement.dataset.theme = "dark"; }
})();`;

// Fraunces поддерживает cyrillic в Google Fonts, но TS-типы next/font
// перечисляют только latin/latin-ext/vietnamese. Латиницы достаточно —
// для русских заголовков сработает fallback Georgia (тоже serif).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
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
    <html
      lang="ru"
      className={`${fraunces.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <div className="app-shell">
          <header className="app-header">
            <Link href="/" className="app-wordmark">ebay to buy.</Link>
            <nav className="app-nav">
              <Link href="/" className="app-nav-link">Все цели</Link>
              <Link href="/targets/new" className="app-nav-link">Новая цель</Link>
              <ThemeToggle />
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
