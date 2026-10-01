import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AudioRoot } from "@/components/AudioControls";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Взрывные котята — Онлайн-игра",
  description: "Играй во «Взрывных котят» с 2–6 друзьями, против бота или в турнире.",
  icons: { icon: "/exploding-kitten-logo.png", apple: "/exploding-kitten-logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#211d30",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <AudioRoot />
        {children}
      </body>
    </html>
  );
}
