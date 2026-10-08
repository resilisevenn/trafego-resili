import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tráfego — Resili Sevenn",
  description: "Métricas, saldo e relatório de tráfego dos clientes",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
