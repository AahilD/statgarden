// Links in the footer. Edit these lists; the footer lays itself out.
import type { Tone } from "./tones";

/** Pages on the site. */
export const FOOTER_PAGES: { label: string; href: string; tone: Tone }[] = [
  { label: "Lab", href: "/lab", tone: "orange" },
  { label: "Teams", href: "/teams", tone: "blue" },
  { label: "Glossary", href: "/glossary", tone: "green" },
];

/**
 * Places elsewhere (X, Bluesky, GitHub…), shown as round icon buttons under the pages.
 * `icon` is an image in web/public (e.g. "/social/x.svg"). It's drawn in the text colour, so
 * use a one-colour logo on a transparent background and it works in light and dark mode.
 * Set `ownColours: true` to show the image as it is instead.
 */
export const FOOTER_ELSEWHERE: { label: string; href: string; icon: string; ownColours?: boolean }[] = [
  // { label: "StatGarden on X", href: "https://x.com/…", icon: "/social/x.svg" },
];
