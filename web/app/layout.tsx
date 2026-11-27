import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Jost, Roboto, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Nav, NavLinks } from "@/components/layout/Nav";
import { Search } from "@/components/layout/Search";
import { Mark, Stripes, Wordmark } from "@/components/layout/Brand";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

const jost = Jost({ variable: "--font-jost", subsets: ["latin"], weight: ["500", "600"] });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  // previews need full URLs; set STATGARDEN_SITE_URL to the real address when deployed
  metadataBase: new URL(process.env.STATGARDEN_SITE_URL ?? "http://localhost:3000"),
  title: { default: "StatGarden", template: "%s · StatGarden" },
  description: "NBA stats you can pivot, chart and share.",
  openGraph: { siteName: "StatGarden", images: [{ url: "/og", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image" },
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
              <Link href="/" className="flex shrink-0 items-center gap-2.5 text-[15px]" aria-label="StatGarden home">
                <Mark />
                <Wordmark />
              </Link>
              <div className="flex items-center gap-1 sm:gap-3">
                <Search />
                {/* the nav reads the URL, which only exists per request; until then it shows without a current link */}
                <Suspense fallback={<NavLinks path={null} />}>
                  <Nav />
                </Suspense>
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
