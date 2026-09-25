import { linkProps } from "@openflow/core";
import type { SiteSettingsValues } from "./settings";

export function SiteFooter({
  settings,
  siteName,
}: {
  settings: SiteSettingsValues;
  siteName: string;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-stone-950 text-stone-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-3">
        <div>
          <p className="text-lg font-bold text-white">{siteName}</p>
          {settings.footerText && <p className="mt-3 max-w-xs leading-7">{settings.footerText}</p>}
        </div>
        <div className="space-y-2">
          {settings.contactEmail && (
            <p>
              <a href={`mailto:${settings.contactEmail}`} className="hover:text-white">
                {settings.contactEmail}
              </a>
            </p>
          )}
          {settings.contactPhone && (
            <p>
              <a
                href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`}
                className="hover:text-white"
              >
                {settings.contactPhone}
              </a>
            </p>
          )}
          {settings.address && <p className="whitespace-pre-line">{settings.address}</p>}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 md:justify-end">
          {(settings.socialLinks ?? []).map((item, index) => (
            <a key={index} {...linkProps(item.link)} className="hover:text-white">
              {item.label}
            </a>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10 py-6 text-center text-sm text-stone-500">
        © {year} {siteName}
        {settings.legalText ? ` · ${settings.legalText}` : ""}
      </div>
    </footer>
  );
}
