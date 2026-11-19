import type { Metadata } from "next";
import Link from "next/link";
import { Jost, Roboto, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Nav } from "@/components/layout/Nav";
import { Mark, Stripes, Wordmark } from "@/components/layout/Brand";
import "./globals.css";

const jost = Jost({ variable: "--font-jost", subsets: ["latin"], weight: ["500", "600"] });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "StatGarden", template: "%s · StatGarden" },
  description: "NBA stats you can pivot, chart and share.",
};

// Sets the saved theme before first paint, so light-mode users don't see a dark flash.
const themeScript = `try{var t=localStorage.getItem("sg-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${jost.variable} ${roboto.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-md">
            <Stripes />
            <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2.5 text-[15px]" aria-label="StatGarden home">
                <Mark />
                <Wordmark />
              </Link>
              <Nav />
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="mt-16 border-t border-line">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-5">
              <span className="flex items-center gap-2.5 text-[13px]">
                <Mark size={14} />
                <Wordmark />
              </span>
              <span className="label-mono">Data: NBA.com via nba_api · not affiliated with the NBA</span>
            </div>
            <Stripes />
          </footer>
        </Providers>
      </body>
    </html>
  );
}
