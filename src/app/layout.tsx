import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AudioRoot } from "@/components/AudioControls";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Взрывные котята — Дуэль онлайн",
  description: "Играй во «Взрывных котят» (дуэль на 2 игрока) с друзьями по ссылке или против бота.",
  icons: { icon: "/images/kittens-logo.png", apple: "/images/kittens-logo.png" },
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
