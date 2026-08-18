import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maderoom AI Studio",
  description: "Generador web de videos Maderoom con Supabase y Veo Lite",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
