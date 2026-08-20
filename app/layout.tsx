import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KEY//DODGE",
  description: "A keyboard rhythm dodge game.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
