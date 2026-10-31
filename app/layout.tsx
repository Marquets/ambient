import type { Metadata, Viewport } from "next";
import { Anton, Space_Mono } from "next/font/google";
import { Logo } from "./Logo";
import "./globals.css";

const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", weight: ["400", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ambient · Discos Madera",
  description: "Un sinte generativo con un cielo de nubes que reacciona al sonido",
};

export const viewport: Viewport = { themeColor: "#14110e" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${anton.variable} ${spaceMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-fondo font-sans text-line">
        {/* The logo's band: from hd up the panel moves into it, either side of the logo, so its
            height is what --chrome (globals.css) measures */}
        <header className="flex flex-col items-center gap-1 px-4 pb-6 pt-4 text-accent sm:px-8">
          <Logo className="h-14 w-auto sm:h-20" />
          <span className="font-mono text-xs uppercase tracking-[0.5em] sm:text-sm">Ambient</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
