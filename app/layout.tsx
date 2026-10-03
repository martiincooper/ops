import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aether Ops",
  description: "Jornadas por objetivos, disponibilidad y compras por proyecto",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Aether Ops", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eeecfb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body className="min-h-dvh bg-fondo font-sans text-tinta antialiased">{children}</body>
    </html>
  );
}
