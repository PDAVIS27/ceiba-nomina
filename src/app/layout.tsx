import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ceiba — Nómina para Nicaragua",
  description: "Plataforma de nómina para pequeños negocios en Nicaragua, calculada según la Ley 822.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-NI">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
