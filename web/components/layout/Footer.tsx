// The site footer, the same on every page: centred like the title cards, so it lines up the
// same whether the page above is the full-width Lab or a narrower player page.
import Link from "next/link";
import { Mark, Stripes, Wordmark } from "@/components/layout/Brand";
import { FOOTER_ELSEWHERE, FOOTER_PAGES } from "@/lib/site";
import { TONE } from "@/lib/tones";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-5 px-4 py-10 text-center">
        <Link href="/" className="flex items-center gap-2.5 text-[15px]" aria-label="StatGarden home">
          <Mark />
          <Wordmark />
        </Link>
        <p className="max-w-[420px] text-sm text-ink-2">NBA stats you can pivot, chart and share.</p>

        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-2">
          {FOOTER_PAGES.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="lift inline-flex items-center gap-2 rounded-btn border border-line bg-surface px-3.5 py-2 text-sm hover:border-line-strong"
            >
              <i aria-hidden className={`h-2.5 w-2.5 rounded-[2px] ${TONE[l.tone].block}`} />
              {l.label}
            </Link>
          ))}
        </nav>

        {FOOTER_ELSEWHERE.length > 0 && (
          <ul aria-label="Elsewhere" className="flex flex-wrap justify-center gap-2">
            {FOOTER_ELSEWHERE.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={l.label}
                  className="lift grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  <span className="sr-only">{l.label}</span>
                  {l.ownColours ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small fixed-size logo, no optimising needed
                    <img src={l.icon} alt="" width={18} height={18} />
                  ) : (
                    // the logo's shape, filled with the text colour (so it follows the theme)
                    <i
                      aria-hidden
                      className="block h-[18px] w-[18px] bg-current"
                      style={{ mask: `url("${l.icon}") center / contain no-repeat`, WebkitMask: `url("${l.icon}") center / contain no-repeat` }}
                    />
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}

        <p className="label-mono">Data: NBA.com via nba_api · not affiliated with the NBA</p>
      </div>
      <Stripes />
    </footer>
  );
}
