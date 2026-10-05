import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KARIER | Kas Rutin Irene Residence",
  description: "Kas Rutin Irene Residence: pencatatan iuran warga, pinjaman, dan laporan kas.",
  icons: {
    icon: "/karier-logo.svg",
    shortcut: "/karier-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
