import { imageProps, type LayoutProps, linkProps } from "@openflow/core";
import type { SiteSettingsValues } from "./settings";

type Languages = NonNullable<LayoutProps["languages"]>;

/** The site's languages (only when it has several), each in its own name. */
function LanguageLinks({ languages, className }: { languages: Languages; className: string }) {
  return (
    <ul className={className}>
      {languages.map((language) => (
        <li key={language.lang}>
          <a
            href={language.href}
            hrefLang={language.lang}
            lang={language.lang}
            aria-current={language.current ? "true" : undefined}
            className="rounded-md px-2 py-1 aria-[current=true]:font-semibold aria-[current=true]:text-stone-900 hover:text-accent"
          >
            {language.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function SiteHeader({
  settings,
  siteName,
  languages,
  homeHref,
}: {
  settings: SiteSettingsValues;
  siteName: string;
  languages: Languages;
  homeHref: string;
}) {
  const logo = imageProps(settings.logo);
  const navigation = settings.navigation ?? [];
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <a
          href={homeHref}
          className="flex items-center gap-3 font-bold tracking-tight text-stone-900"
        >
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
          {languages.length > 1 && (
            <LanguageLinks
              languages={languages}
              className="hidden items-center gap-1 text-sm text-stone-600 md:flex"
            />
          )}
          {settings.headerCtaLabel && (
            <a
              {...linkProps(settings.headerCtaLink)}
              className="hidden rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 sm:inline-flex"
            >
              {settings.headerCtaLabel}
            </a>
          )}
          {(navigation.length > 0 || languages.length > 1) && (
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
                {languages.length > 1 && (
                  <LanguageLinks
                    languages={languages}
                    className="mt-2 flex flex-wrap gap-1 border-t border-stone-200 pt-2 text-sm text-stone-600"
                  />
                )}
              </nav>
            </details>
          )}
        </div>
      </div>
    </header>
  );
}
