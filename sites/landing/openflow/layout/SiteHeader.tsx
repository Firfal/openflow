import { imageProps, linkProps } from "@openflow/core";
import { LogoMark } from "./Logo";
import type { SiteSettingsValues } from "./settings";

export function SiteHeader({
  settings,
  siteName,
}: {
  settings: SiteSettingsValues;
  siteName: string;
}) {
  const navigation = settings.navigation ?? [];
  const logo = imageProps(settings.logo);
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/85 text-white backdrop-blur-md">
      {settings.skipLinkLabel && (
        <a
          href="#contenu"
          className="sr-only rounded-md bg-cobalt px-3 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
        >
          {settings.skipLinkLabel}
        </a>
      )}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <a
          href="/"
          className="flex items-center gap-2.5 font-display text-lg font-bold"
          translate="no"
        >
          {logo ? <img {...logo} className="h-7 w-auto" /> : <LogoMark />}
          {siteName}
        </a>
        <nav className="hidden items-center gap-8 text-[15px] text-white/75 md:flex">
          {navigation.map((item, index) => (
            <a
              key={index}
              {...linkProps(item.link)}
              className="transition-colors duration-150 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {settings.headerCtaLabel && (
            <a
              {...linkProps(settings.headerCtaLink)}
              className="btn min-h-10 bg-white py-2 text-ink hover:bg-cobalt-soft"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              {settings.headerCtaLabel}
            </a>
          )}
          {navigation.length > 0 && (
            <details className="relative md:hidden">
              <summary
                aria-label="Menu"
                className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg ring-1 ring-white/25"
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
              <nav className="absolute right-0 mt-3 flex w-60 flex-col rounded-xl bg-ink-2 p-2 shadow-2xl ring-1 ring-white/10">
                {navigation.map((item, index) => (
                  <a
                    key={index}
                    {...linkProps(item.link)}
                    className="rounded-lg px-3 py-2.5 text-white/85 hover:bg-white/10"
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
