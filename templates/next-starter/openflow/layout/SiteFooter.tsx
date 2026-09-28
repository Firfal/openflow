import {
  formatAddress,
  formatOpeningHours,
  type LayoutProps,
  linkProps,
  mapUrl,
} from "@openflow/core";
import type { SiteSettingsValues } from "./settings";

/**
 * Footer: the business profile (Réglages > Établissement: phone, e-mail, address, hours) next to the
 * common content (presentation, social links, legal line).
 */
export function SiteFooter({
  settings,
  site,
}: {
  settings: SiteSettingsValues;
  site: LayoutProps["site"];
}) {
  const year = new Date().getFullYear();
  const business = site.business;
  const address = formatAddress(business);
  const map = mapUrl(business);
  const hours = formatOpeningHours(business?.hours);
  return (
    <footer className="bg-stone-950 text-stone-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-3">
        <div>
          <p className="text-lg font-bold text-white">{business?.name || site.name}</p>
          {settings.footerText && <p className="mt-3 max-w-xs leading-7">{settings.footerText}</p>}
        </div>
        <div className="space-y-2">
          {business?.email && (
            <p>
              <a href={`mailto:${business.email}`} className="hover:text-white">
                {business.email}
              </a>
            </p>
          )}
          {business?.phone && (
            <p>
              <a href={`tel:${business.phone.replace(/[^+\d]/g, "")}`} className="hover:text-white">
                {business.phone}
              </a>
            </p>
          )}
          {address && (
            <p>
              {address}
              {map && settings.mapLabel && (
                <>
                  {" · "}
                  <a
                    href={map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-white"
                  >
                    {settings.mapLabel}
                  </a>
                </>
              )}
            </p>
          )}
          {hours.length > 0 && (
            <div className="pt-2">
              {settings.hoursLabel && (
                <p className="text-sm font-semibold text-white">{settings.hoursLabel}</p>
              )}
              <ul className="mt-1 space-y-0.5 text-sm">
                {hours.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {business?.hoursNote && <p className="mt-1 text-sm">{business.hoursNote}</p>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 md:justify-end">
          {(settings.socialLinks ?? []).map((item, index) => (
            <a key={index} {...linkProps(item.link)} className="hover:text-white">
              {item.label}
            </a>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 border-t border-white/10 px-6 py-6 text-center text-sm text-stone-400 md:flex-row md:justify-between md:text-left">
        <p>
          © {year} {business?.name || site.name}
          {settings.legalText ? ` · ${settings.legalText}` : ""}
        </p>
        {(settings.legalLinks ?? []).length > 0 && (
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {(settings.legalLinks ?? []).map((item, index) => (
              <li key={index}>
                <a
                  {...linkProps(item.link)}
                  className="underline-offset-4 hover:text-white hover:underline"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}
