import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "FrameRally",
  description: "FrameRally creation studio",
  icons: {
    icon: [{ url: "/brand/mirora-mark.png", type: "image/png" }],
    apple: [{ url: "/brand/mirora-mark.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* Explicit favicon — file-based app/icon.png + public fallback */}
        <link rel="icon" href="/brand/mirora-mark.png" type="image/png" sizes="any" />
        <link rel="apple-touch-icon" href="/brand/mirora-mark.png" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
