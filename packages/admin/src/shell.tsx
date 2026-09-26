import { signOut } from "firebase/auth";
import type { ReactNode } from "react";
import { type SettingsTab, useAdmin } from "./context.js";
import { Icon, type IconName } from "./icons.js";
import { PublishControl } from "./publish.js";
import { Menu, MOD_KEY } from "./ui.js";
import { type UiTheme, useUiTheme } from "./ui-theme.js";

/** Opens the command palette (listened to by `CommandPalette`). */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent("openflow:palette"));
}

/** Address of the live site: the admin is served by the site itself, at `/admin`. */
export function useSiteUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "/";
}

export function SiteMark({ name }: { name: string }) {
  return (
    <span className="of-site__mark" aria-hidden>
      {(name.trim()[0] ?? "S").toUpperCase()}
    </span>
  );
}

const THEMES: Array<[UiTheme, string, IconName]> = [
  ["system", "Comme le système", "monitor"],
  ["light", "Clair", "sun"],
  ["dark", "Sombre", "moon"],
];

/** Owner menu: appearance of the admin and sign-out. */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, services } = useAdmin();
  const [theme, setTheme] = useUiTheme();
  const email = user.email ?? "";
  return (
    <Menu
      label="Compte"
      align="left"
      direction={compact ? "down" : "up"}
      items={[
        { heading: "Apparence de l'admin" },
        ...THEMES.map(([value, label, icon]) => ({
          label,
          icon,
          checked: theme === value,
          onSelect: () => setTheme(value),
        })),
        "separator",
        {
          label: "Se déconnecter",
          icon: "logOut" as const,
          onSelect: () => void signOut(services.auth),
        },
      ]}
      trigger={(props) => (
        <button
          type="button"
          className="of-user"
          title={email}
          aria-label={`Compte : ${email}`}
          {...props}
        >
          <span className="of-avatar" aria-hidden>
            {email[0] ?? "?"}
          </span>
          {!compact && (
            <span className="of-user__text">
              <strong>Propriétaire</strong>
              <span>{email}</span>
            </span>
          )}
        </button>
      )}
    />
  );
}

const SETTINGS: Array<[SettingsTab, string]> = [
  ["global", "Contenu commun"],
  ["theme", "Thème"],
  ["site", "Site et référencement"],
  ["assistant", "Assistant IA"],
];

function NavItem({
  icon,
  label,
  current,
  onClick,
  children,
}: {
  icon?: IconName;
  label: string;
  current: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className="of-nav__item"
      aria-current={current ? "page" : undefined}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      <span className="of-nav__label">{label}</span>
      {children}
    </button>
  );
}

/** Left navigation of the dashboard (pages, media, settings, history) and the owner menu. */
export function Sidebar() {
  const { route, navigate, settings, config } = useAdmin();
  const siteName = settings?.site?.name ?? config.site.name;
  const siteUrl = useSiteUrl();
  const host = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const inSettings = route.view === "settings";
  const tab = inSettings ? (route.tab ?? "global") : undefined;
  return (
    <aside className="of-sidebar" aria-label="Administration">
      <div className="of-site">
        <SiteMark name={siteName} />
        <div className="of-site__text">
          <span className="of-site__name">{siteName}</span>
          <a className="of-site__url" href={siteUrl} target="_blank" rel="noreferrer">
            {host}
            <Icon name="externalLink" size={11} />
          </a>
        </div>
      </div>
      <nav className="of-nav" aria-label="Navigation">
        <button type="button" className="of-nav__item" onClick={openCommandPalette}>
          <Icon name="search" />
          <span className="of-nav__label">Rechercher</span>
          <span className="of-kbd" style={{ marginLeft: "auto" }} aria-hidden>
            {MOD_KEY} K
          </span>
        </button>
        <p className="of-nav__title">Site</p>
        <NavItem
          icon="fileText"
          label="Pages"
          current={route.view === "pages"}
          onClick={() => navigate({ view: "pages" })}
        />
        <NavItem
          icon="image"
          label="Médias"
          current={route.view === "media"}
          onClick={() => navigate({ view: "media" })}
        />
        <NavItem
          icon="settings"
          label="Réglages"
          current={inSettings && !route.tab}
          onClick={() => navigate({ view: "settings" })}
        />
        {inSettings && (
          <div className="of-nav__sub">
            {SETTINGS.filter(([value]) => value !== "theme" || config.theme).map(
              ([value, label]) => (
                <NavItem
                  key={value}
                  label={label}
                  current={tab === value}
                  onClick={() => navigate({ view: "settings", tab: value })}
                />
              ),
            )}
          </div>
        )}
        <NavItem
          icon="history"
          label="Historique"
          current={route.view === "history"}
          onClick={() => navigate({ view: "history" })}
        />
      </nav>
      <div className="of-sidebar__footer">
        <UserMenu />
      </div>
    </aside>
  );
}

/** Sticky header of a dashboard view: title, optional description, and the site actions. */
export function PageHead({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const siteUrl = useSiteUrl();
  return (
    <header className="of-pagehead">
      <div className="of-pagehead__title">
        <h1>{title}</h1>
        {description && <p className="of-subtle">{description}</p>}
      </div>
      <div className="of-pagehead__actions">
        {actions}
        <a
          className="of-btn of-btn--ghost"
          href={siteUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Voir le site"
        >
          <Icon name="externalLink" />
          <span className="of-hide-sm">Voir le site</span>
        </a>
        <PublishControl />
      </div>
    </header>
  );
}
