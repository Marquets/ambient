import type { Metadata, Viewport } from "next";
import { Anton, Space_Mono } from "next/font/google";
import "./globals.css";

const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", weight: ["400", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Le Ciel",
  description: "Un sinte generativo con un cielo de nubes que reacciona al sonido",
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${anton.variable} ${spaceMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-black font-sans text-line">
        <main>{children}</main>
      </body>
    </html>
  );
}
