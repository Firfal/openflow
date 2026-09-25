import { imageProps, linkProps } from "@openflow/core";
import type { SiteSettingsValues } from "./settings";

export function SiteHeader({
  settings,
  siteName,
}: {
  settings: SiteSettingsValues;
  siteName: string;
}) {
  const logo = imageProps(settings.logo);
  const navigation = settings.navigation ?? [];
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <a href="/" className="flex items-center gap-3 font-bold tracking-tight text-stone-900">
          {logo ? <img {...logo} className="h-9 w-auto" /> : siteName}
        </a>
        <nav className="hidden items-center gap-8 text-sm font-medium text-stone-700 md:flex">
          {navigation.map((item, index) => (
            <a key={index} {...linkProps(item.link)} className="hover:text-accent">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {settings.headerCtaLabel && (
            <a
              {...linkProps(settings.headerCtaLink)}
              className="hidden rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 sm:inline-flex"
            >
              {settings.headerCtaLabel}
            </a>
          )}
          {navigation.length > 0 && (
            <details className="relative md:hidden">
              <summary
                aria-label="Menu"
                className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full ring-1 ring-stone-300"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </summary>
              <nav className="absolute right-0 mt-3 flex w-56 flex-col rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5">
                {navigation.map((item, index) => (
                  <a
                    key={index}
                    {...linkProps(item.link)}
                    className="rounded-lg px-3 py-2 text-stone-800 hover:bg-stone-100"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </details>
          )}
        </div>
      </div>
    </header>
  );
}
