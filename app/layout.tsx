import type { Metadata, Viewport } from "next";
import { Anton, Space_Mono } from "next/font/google";
import "./globals.css";

const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", weight: ["400", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Le Ciel",
  description: "A generative synth under a sky of clouds that answers the sound",
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${anton.variable} ${spaceMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-black font-sans text-line">
        <main>{children}</main>
      </body>
    </html>
  );
}
