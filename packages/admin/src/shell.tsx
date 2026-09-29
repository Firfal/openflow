import { signOut } from "firebase/auth";
import { type ReactNode, useEffect, useMemo } from "react";
import { useAdmin } from "./context.js";
import { Icon, type IconName } from "./icons.js";
import { isCurrent, type NavEntry, type NavGroup, navEntries } from "./nav.js";
import { PublishControl } from "./publish.js";
import { Menu, MOD_KEY, SiteMark } from "./ui.js";
import { type UiTheme, useUiTheme } from "./ui-theme.js";

/** Opens the command palette (listened to by `CommandPalette`). */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent("openflow:palette"));
}

/** Title of the browser tab: the view, then the site (« Pages · Mon site »). */
export function useDocumentTitle(title: string | undefined) {
  const { config, settings } = useAdmin();
  const site = settings?.site?.name ?? config.site.name;
  useEffect(() => {
    if (title) document.title = `${title} · ${site}`;
  }, [title, site]);
}

/** Address of the live site: the admin is served by the site itself, at `/admin`. */
export function useSiteUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "/";
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

const GROUPS: NavGroup[] = ["Général", "Contenu", "Activité", "Réglages"];

/** What an entry shows after its label: unread messages, a connected AI. */
function useNavBadges(): (entry: NavEntry) => ReactNode {
  const { agents, messages } = useAdmin();
  const unread = messages.filter((m) => !m.read && !m.spam).length;
  return (entry) => {
    if (entry.id === "messages" && unread > 0) {
      return (
        <span className="of-nav__count">
          {unread}
          <span className="of-sr-only"> non lu{unread > 1 ? "s" : ""}</span>
        </span>
      );
    }
    if (entry.id === "assistant" && agents.length > 0) {
      return <span className="of-nav__dot" title="Une IA est connectée" aria-hidden />;
    }
    return null;
  };
}

/**
 * Left navigation of the dashboard: every place in three groups (their titles are plain text), the
 * settings as direct entries, and the owner menu. On a phone, a tab bar replaces it (`MobileTabs`).
 */
export function Sidebar() {
  const { route, navigate, settings, config } = useAdmin();
  const entries = useMemo(() => navEntries(config), [config]);
  const badge = useNavBadges();
  const siteName = settings?.site?.name ?? config.site.name;
  const siteUrl = useSiteUrl();
  const host = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <aside className="of-sidebar" aria-label="Administration">
      <div className="of-site">
        <SiteMark name={siteName} />
        <div className="of-site__text">
          <span className="of-site__name">{siteName}</span>
          <a className="of-site__url" href={siteUrl} target="_blank" rel="noreferrer">
            {host}
            <Icon name="externalLink" size={12} />
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
        {GROUPS.map((group) => (
          <div key={group} className="of-nav__group">
            {group !== "Général" && <p className="of-nav__title">{group}</p>}
            {entries
              .filter((entry) => entry.group === group)
              .map((entry) => (
                <NavItem
                  key={entry.id}
                  icon={entry.icon}
                  label={entry.label}
                  current={isCurrent(entry, route)}
                  onClick={() => navigate(entry.route)}
                >
                  {badge(entry)}
                </NavItem>
              ))}
          </div>
        ))}
      </nav>
      <div className="of-sidebar__footer">
        <UserMenu />
      </div>
    </aside>
  );
}

/** Tabs of a phone: the most used places with their names, and « Plus » for all the others. */
const MOBILE_TABS = ["home", "pages", "messages"];

export function MobileTabs() {
  const { route, navigate, config } = useAdmin();
  const entries = useMemo(() => navEntries(config), [config]);
  const badge = useNavBadges();
  const tabs = entries.filter((entry) => MOBILE_TABS.includes(entry.id));
  const others = entries.filter((entry) => !MOBILE_TABS.includes(entry.id));
  const inOthers = others.some((entry) => isCurrent(entry, route));
  return (
    <nav className="of-tabbar" aria-label="Onglets">
      {tabs.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="of-tabbar__item"
          aria-current={isCurrent(entry, route) ? "page" : undefined}
          onClick={() => navigate(entry.route)}
        >
          <Icon name={entry.icon} />
          <span>{entry.label}</span>
          {badge(entry)}
        </button>
      ))}
      <Menu
        label="Toutes les rubriques"
        direction="up"
        items={GROUPS.flatMap((group) => [
          ...(group === "Général" ? [] : [{ heading: group }]),
          ...entries
            .filter((entry) => entry.group === group)
            .map((entry) => ({
              label: entry.label,
              icon: entry.icon,
              checked: isCurrent(entry, route),
              onSelect: () => navigate(entry.route),
            })),
        ])}
        trigger={(props) => (
          <button
            type="button"
            className="of-tabbar__item"
            aria-current={inOthers ? "page" : undefined}
            {...props}
          >
            <Icon name="menu" />
            <span>Plus</span>
          </button>
        )}
      />
    </nav>
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
  useDocumentTitle(title);
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
