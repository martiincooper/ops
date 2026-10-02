import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aether Ops",
  description: "Bitácora diaria, ausencias y rendición de compras",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Aether Ops", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#090a0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
