import { imageProps, linkProps } from "@openflow/core";
import { LogoMark } from "./Logo";
import type { SiteSettingsValues } from "./settings";

export function SiteFooter({
  settings,
  siteName,
}: {
  settings: SiteSettingsValues;
  siteName: string;
}) {
  const logo = imageProps(settings.logo);
  return (
    <footer className="bg-plan text-white/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-[1.2fr_1fr]">
        <div className="max-w-sm">
          <p
            className="flex items-center gap-2.5 font-display text-xl font-bold text-white"
            translate="no"
          >
            {logo ? <img {...logo} className="h-7 w-auto" /> : <LogoMark />}
            {siteName}
          </p>
          {settings.footerText && <p className="mt-4 leading-7">{settings.footerText}</p>}
        </div>
        <nav className="flex flex-wrap content-start gap-x-8 gap-y-3 md:justify-end">
          {(settings.footerLinks ?? []).map((item, index) => (
            <a
              key={index}
              {...linkProps(item.link)}
              className="transition-colors duration-150 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
      {settings.legalText && (
        <div className="border-t border-white/10 px-5 py-6 text-center text-sm text-white/50">
          {settings.legalText}
        </div>
      )}
    </footer>
  );
}
