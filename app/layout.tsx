import type { Metadata } from "next";
import "./globals.css";
import "./theme-system.css";

const pagesBaseUrl =
  process.env.GITHUB_PAGES === "true"
    ? process.env.PAGES_BASE_URL?.replace(/\/$/, "") ||
      "https://fiso-maker.github.io/keyboard-dodge"
    : "";
const faviconPath = pagesBaseUrl
  ? `${pagesBaseUrl}/favicon.svg`
  : "/favicon.svg";

export const metadata: Metadata = {
  title: "KEY//DODGE",
  description: "A keyboard rhythm dodge game.",
  icons: {
    icon: faviconPath,
    shortcut: faviconPath,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-theme="polar-white">
      <body>{children}</body>
    </html>
  );
}
