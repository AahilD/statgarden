// The site footer, the same on every page: logo, any outside links (lib/site.ts) and the data
// credit. The pages are in the header, so they aren't repeated here. Centred like the title cards.
import Link from "next/link";
import { Mark, Stripes, Wordmark } from "@/components/layout/Brand";
import { FOOTER_ELSEWHERE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-5 px-4 py-10 text-center">
        <Link href="/" className="flex items-center gap-2.5 text-[15px]" aria-label="StatGarden home">
          <Mark />
          <Wordmark />
        </Link>
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
