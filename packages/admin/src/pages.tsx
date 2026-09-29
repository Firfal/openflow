import {
  collectionEntry,
  formatScheduled,
  formatTime,
  isValidPublishAt,
  isValidSlug,
  languageName,
  normalizeSlug,
  type PageSeo,
  type PageStatus,
  pageChanged,
  publishedAt,
  SCHEDULE_STEP_MINUTES,
  siteLocales,
  slugify,
  slugToPath,
  today,
} from "@openflow/core";
import { useEffect, useState } from "react";
import { AiPromo } from "./assistant.js";
import { useAdmin } from "./context.js";
import {
  createItem,
  createPage,
  deletePage,
  duplicatePage,
  type PageEntry,
  type ReleaseEntry,
  renameItem,
  subscribeTranslations,
  updatePageMeta,
} from "./data.js";
import { errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { PageHead, useSiteUrl } from "./shell.js";
import { describeChanges, pendingChanges } from "./status.js";
import { Button, Dialog, EmptyState, FormField, Menu, MOD_KEY, StatusChip, timeAgo } from "./ui.js";

type Visibility = PageStatus | "scheduled";

interface PageForm {
  title: string;
  /** The address, after the collection's path for an item. */
  slug: string;
  visibility: Visibility;
  /** Scheduled time, as the owner's clock shows it (`datetime-local`: `2026-10-01T09:00`). */
  publishAt: string;
  seo: PageSeo;
  /** Publication date of a new item (collections with a `dateField`). */
  date: string;
}

/**
 * Settings of a page (title, address, visibility, SEO), or creation of a page. With `collection`
 * (or for an existing item), the same for an item: its address stays under the collection's.
 */
export function PageDialog({
  page,
  onClose,
  collection,
}: {
  page: PageEntry | "new" | null;
  onClose: () => void;
  collection?: string;
}) {
  return page ? (
    <PageDialogInner
      key={page === "new" ? page : page.id}
      page={page}
      onClose={onClose}
      collection={page === "new" ? collection : page.collection}
    />
  ) : null;
}

/** How the page may appear in Google's results (title, address, description). */
function SearchPreview({
  title,
  path,
  description,
}: {
  title: string;
  path: string;
  description: string;
}) {
  const host = typeof window !== "undefined" ? window.location.host : "";
  return (
    <div className="of-serp">
      <span className="of-sr-only">Aperçu dans Google :</span>
      <span className="of-serp__url">
        {host}
        {path === "/" ? "" : path.replace(/\/$/, "").replaceAll("/", " › ")}
      </span>
      <span className="of-serp__title">{title}</span>
      <span className="of-serp__text">{description}</span>
    </div>
  );
}

function PageDialogInner({
  page,
  onClose,
  collection: name,
}: {
  page: PageEntry | "new";
  onClose: () => void;
  collection?: string;
}) {
  const { config, services, pages, user, notify, navigate, settings } = useAdmin();
  const isNew = page === "new";
  const existing = isNew ? undefined : page;
  const isHome = existing?.slug === "" && !name;
  const collection = name ? config.collections?.[name] : undefined;
  const prefix = collection ? `${collection.path}/` : "";
  const [form, setForm] = useState<PageForm>({
    title: existing?.title ?? "",
    slug: existing
      ? existing.slug.startsWith(prefix)
        ? existing.slug.slice(prefix.length)
        : (existing.slug.split("/").pop() ?? "")
      : "",
    visibility: existing?.publishAt ? "scheduled" : (existing?.status ?? "published"),
    publishAt: existing?.publishAt ? localTime(existing.publishAt) : "",
    seo: existing?.seo ?? {},
    date: today(),
  });
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);

  const slug = isHome ? "" : `${prefix}${form.slug}`;
  const duplicate = pages.find((p) => p.slug === slug && p.id !== existing?.id);
  const slugError =
    !isHome && !form.slug
      ? "Adresse obligatoire"
      : !isValidSlug(slug)
        ? "Minuscules, chiffres et tirets uniquement"
        : duplicate
          ? `Déjà utilisée par « ${duplicate.title} »`
          : undefined;
  const scheduled = form.visibility === "scheduled";
  const publishAt = scheduled && form.publishAt ? new Date(form.publishAt).toISOString() : "";
  const publishAtError =
    scheduled && !isValidPublishAt(publishAt)
      ? "Choisissez une date et une heure à venir (moins d'un an)."
      : undefined;
  const canSave = form.title.trim() && !slugError && !publishAtError;
  // No error before the owner has typed anything (the address follows the title).
  const showSlugError = slugTouched || form.title.trim() !== "";

  const save = async () => {
    setBusy(true);
    try {
      const title = form.title.trim();
      const status: PageStatus = form.visibility === "published" ? "published" : "draft";
      const meta: Pick<PageEntry, "title" | "slug" | "status" | "seo"> & {
        publishAt?: string | null;
      } = {
        title,
        slug,
        status,
        seo: form.seo,
        // A visibility chosen by hand replaces the scheduled one.
        ...(scheduled ? { publishAt } : existing?.publishAt ? { publishAt: null } : {}),
      };
      const by = user.email ?? undefined;
      if (existing) {
        // An item's title is its section's title field: both change together.
        if (collection && title !== existing.title) {
          await renameItem(services.db, config, existing.id, title, by);
        }
        await updatePageMeta(services.db, existing.id, meta, by);
        notify("success", "Paramètres enregistrés.");
        onClose();
      } else {
        const id =
          name && collection
            ? await createItem(
                services.db,
                config,
                name,
                { ...meta, publishAt: meta.publishAt ?? undefined, date: form.date },
                by,
              )
            : await createPage(
                services.db,
                { ...meta, publishAt: meta.publishAt ?? undefined },
                by,
              );
        onClose();
        navigate({ view: "editor", pageId: id });
      }
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const itemDescription =
    existing && collection ? collectionEntry(existing, collection, config).description : undefined;
  const seo = form.seo;
  return (
    <Dialog
      open
      title={
        isNew
          ? collection
            ? (collection.addLabel ?? "Nouvel élément")
            : "Nouvelle page"
          : `Paramètres — ${existing?.title}`
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" busy={busy} disabled={!canSave} onClick={save}>
            {isNew ? "Créer et modifier" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <FormField
        label={collection ? "Titre" : "Titre de la page"}
        hint={collection && !isNew ? "Il se modifie aussi directement sur la page." : undefined}
      >
        <input
          className="of-input"
          value={form.title}
          autoFocus
          onChange={(e) => {
            const title = e.target.value;
            setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
          }}
        />
      </FormField>
      <FormField
        label="Adresse"
        error={showSlugError ? slugError : undefined}
        hint={
          isHome
            ? "La page d'accueil est toujours à la racine du site."
            : form.slug
              ? `Le site affichera cette page à ${slugToPath(slug)}`
              : "Elle se remplit avec le titre."
        }
      >
        <div className="of-prefixed">
          <span>/{prefix}</span>
          <input
            className="of-input"
            value={isHome ? "" : form.slug}
            disabled={isHome}
            onChange={(e) => {
              setSlugTouched(true);
              const typed = e.target.value;
              // An item's address is one segment under its collection's.
              const clean = collection ? slugify(typed) : normalizeSlug(typed);
              setForm((f) => ({ ...f, slug: clean || typed.toLowerCase() }));
            }}
          />
        </div>
      </FormField>
      {isNew && collection?.dateField && (
        <FormField
          label={collection.kind === "event" ? "Date de l'événement" : "Date de publication"}
          hint={
            collection.kind === "event"
              ? "Les prochains événements sont affichés en premier."
              : "Les éléments les plus récents sont affichés en premier."
          }
        >
          <input
            className="of-input"
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </FormField>
      )}
      <fieldset className="of-choices">
        <legend className="of-field__label">Visibilité</legend>
        <label className="of-checkbox">
          <input
            type="radio"
            name="visibility"
            checked={form.visibility === "published"}
            onChange={() => setForm((f) => ({ ...f, visibility: "published" }))}
          />
          <span>
            Visible sur le site
            <span className="of-field__hint">À la prochaine publication.</span>
          </span>
        </label>
        <label className="of-checkbox">
          <input
            type="radio"
            name="visibility"
            checked={form.visibility === "draft"}
            onChange={() => setForm((f) => ({ ...f, visibility: "draft" }))}
          />
          <span>
            Masquée
            <span className="of-field__hint">N'apparaît pas sur le site.</span>
          </span>
        </label>
        <label className="of-checkbox">
          <input
            type="radio"
            name="visibility"
            checked={scheduled}
            onChange={() =>
              setForm((f) => ({
                ...f,
                visibility: "scheduled",
                publishAt: f.publishAt || localTime(tomorrowAtNine()),
              }))
            }
          />
          <span>
            Mise en ligne programmée
            <span className="of-field__hint">
              Masquée jusqu'à la date choisie, puis mise en ligne toute seule (dans le quart
              d'heure), sans publier vos autres modifications.
            </span>
          </span>
        </label>
        {scheduled && (
          <div className="of-choices__detail">
            <FormField label="Date et heure de mise en ligne" error={publishAtError}>
              <input
                className="of-input"
                type="datetime-local"
                step={SCHEDULE_STEP_MINUTES * 60}
                min={localTime(new Date().toISOString())}
                value={form.publishAt}
                onChange={(e) => setForm((f) => ({ ...f, publishAt: e.target.value }))}
              />
            </FormField>
          </div>
        )}
      </fieldset>
      <fieldset className="of-fieldset">
        <legend>Référencement (Google)</legend>
        <SearchPreview
          title={seo.title || form.title || "Titre de la page"}
          path={slugToPath(slug)}
          description={
            seo.description ||
            itemDescription ||
            settings?.site?.description ||
            "Ajoutez une description ci-dessous."
          }
        />
        <FormField
          label="Titre affiché dans Google"
          hint={`${(seo.title ?? "").length}/60 caractères. Laissez vide pour utiliser le titre${collection ? "" : " de la page"}.`}
        >
          <input
            className="of-input"
            value={seo.title ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, seo: { ...f.seo, title: e.target.value } }))}
          />
        </FormField>
        <FormField
          label="Description"
          hint={`${(seo.description ?? "").length}/160 caractères recommandés.`}
        >
          <textarea
            className="of-input"
            rows={3}
            value={seo.description ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, seo: { ...f.seo, description: e.target.value } }))
            }
          />
        </FormField>
        <label className="of-checkbox">
          <input
            type="checkbox"
            checked={Boolean(seo.noindex)}
            onChange={(e) =>
              setForm((f) => ({ ...f, seo: { ...f.seo, noindex: e.target.checked } }))
            }
          />
          Masquer {collection ? "cet élément" : "cette page"} des moteurs de recherche
        </label>
      </fieldset>
    </Dialog>
  );
}

/** An ISO time as the owner's clock shows it, for `datetime-local` (`2026-10-01T09:00`). */
function localTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tomorrowAtNine(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

/** Publication state of a page, as one status (Webflow's CMS vocabulary, simplified). */
export function pageStatus(page: PageEntry, releases: ReleaseEntry[]) {
  if (page.publishAt) {
    return {
      tone: "blue" as const,
      label: `Programmée le ${shortTime(page.publishAt)}`,
      title: `Mise en ligne toute seule le ${formatScheduled(page.publishAt)}`,
    };
  }
  if (page.status !== "published") {
    return { tone: "grey" as const, label: "Masquée", title: "N'apparaît pas sur le site" };
  }
  if (
    releases.some(
      (r) =>
        (r.status === "queued" || r.status === "building") && r.scheduledPages?.includes(page.id),
    )
  ) {
    return {
      tone: "blue" as const,
      label: "Mise en ligne…",
      title: "Publication programmée en cours",
    };
  }
  // Nothing online yet: the site status says it once, the rows stay quiet.
  if (!releases.some((release) => release.status === "live")) {
    return {
      tone: "grey" as const,
      label: "Brouillon",
      title: "Pas encore en ligne : publiez le site pour la mettre en ligne",
    };
  }
  if (pageChanged(page, releases)) {
    return {
      tone: "orange" as const,
      label: "Modifications non publiées",
      title: "Publiez pour mettre ces modifications en ligne",
    };
  }
  return { tone: "green" as const, label: "En ligne", title: "À jour sur le site" };
}

/** « 1 oct. à 9 h » (the year when it is not this one). */
function shortTime(iso: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
  return `${day} à ${formatTime(`${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`)}`;
}

/** Is the live site up to date? (last publication, pending changes). */
function SiteStatus() {
  const { pages, releases, settings } = useAdmin();
  const siteUrl = useSiteUrl();
  const lastLive = releases.find((release) => release.status === "live");
  const running = releases.find((r) => r.status === "queued" || r.status === "building");
  const pending = pendingChanges(pages, releases, settings);
  const host = siteUrl.replace(/^https?:\/\//, "");
  let text: string;
  let tone: "green" | "orange" | "blue";
  if (running) {
    text = "Publication en cours…";
    tone = "blue";
  } else if (!lastLive) {
    text = "Rien n'est encore en ligne : publiez le site pour mettre vos pages en ligne.";
    tone = "orange";
  } else if (pending.total > 0) {
    const list = describeChanges(pending);
    text = `${list.charAt(0).toUpperCase()}${list.slice(1)} depuis la dernière publication (${timeAgo(publishedAt(lastLive))}).`;
    tone = "orange";
  } else {
    text = `Tout est en ligne. Dernière publication ${timeAgo(publishedAt(lastLive))}.`;
    tone = "green";
  }
  return (
    <section className="of-status" aria-label="État du site">
      <span className="of-status__icon">
        <Icon name="globe" size={18} />
      </span>
      <div className="of-status__main">
        <a className="of-link" href={siteUrl} target="_blank" rel="noreferrer">
          {host}
        </a>
        <span className="of-status__text">{text}</span>
      </div>
      <StatusChip tone={tone}>
        {tone === "green" ? "À jour" : tone === "blue" ? "En cours" : "À publier"}
      </StatusChip>
    </section>
  );
}

/**
 * One button per other language of the site: the page's translation (the translation editor),
 * or « Traduire » when it has none yet.
 */
export function LanguageButtons({
  page,
  locales,
  translated,
}: {
  page: PageEntry;
  locales: string[];
  translated: Set<string>;
}) {
  const { navigate } = useAdmin();
  if (locales.length === 0) return null;
  return (
    <span className="of-langs">
      {locales.map((locale) => {
        const done = translated.has(`${page.id}__${locale}`);
        return (
          <button
            key={locale}
            type="button"
            className={`of-langs__item${done ? " is-done" : ""}`}
            aria-label={
              done
                ? `Version en ${languageName(locale)} : ${page.title}`
                : `Traduire en ${languageName(locale)} : ${page.title}`
            }
            title={done ? `Modifier la version en ${languageName(locale)}` : "Pas encore traduite"}
            onClick={() => navigate({ view: "editor", pageId: page.id, locale })}
          >
            {locale.toUpperCase()}
          </button>
        );
      })}
    </span>
  );
}

/** Which pages are translated into which language (`pageId__locale`), live. */
export function useTranslated(enabled: boolean): Set<string> {
  const { services } = useAdmin();
  const [translated, setTranslated] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!enabled) return;
    return subscribeTranslations(
      services.db,
      (list) => setTranslated(new Set(list.map((t) => `${t.page}__${t.locale}`))),
      () => setTranslated(new Set()),
    );
  }, [enabled, services.db]);
  return translated;
}

export function PagesView() {
  const { pages, releases, services, user, notify, navigate, settings, config } = useAdmin();
  const locales = siteLocales({
    lang: settings?.site?.lang || config.site.lang,
    locales: settings?.site?.locales,
  });
  const translated = useTranslated(locales.length > 0);
  const [dialog, setDialog] = useState<PageEntry | "new" | null>(null);
  const [toDelete, setToDelete] = useState<PageEntry | null>(null);
  const lastLive = releases.find((release) => release.status === "live");

  // « Nouvelle page » from the command palette.
  useEffect(() => {
    const open = () => setDialog("new");
    window.addEventListener("openflow:new-page", open);
    return () => window.removeEventListener("openflow:new-page", open);
  }, []);

  const duplicate = async (page: PageEntry) => {
    try {
      const slugs = new Set(pages.map((p) => p.slug));
      await duplicatePage(services.db, page, slugs, user.email ?? undefined);
      notify(
        "success",
        `« ${page.title} » dupliquée (masquée tant que vous ne la rendez pas visible).`,
      );
    } catch (error) {
      notify("error", errorMessage(error));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deletePage(services.db, toDelete.id);
      notify("success", `« ${toDelete.title} » supprimée. Publiez pour la retirer du site.`);
    } catch (error) {
      notify("error", errorMessage(error));
    }
    setToDelete(null);
  };

  // Home first, then by title: the order owners expect in a site map. Items have their own view.
  const sitePages = pages.filter((page) => !page.collection);
  const sorted = [...sitePages].sort((a, b) =>
    a.slug === "" ? -1 : b.slug === "" ? 1 : a.title.localeCompare(b.title, "fr"),
  );

  return (
    <>
      <PageHead
        title="Pages"
        actions={
          <Button icon="plus" onClick={() => setDialog("new")}>
            Nouvelle page
          </Button>
        }
      />
      <section className="of-view">
        <SiteStatus />
        <AiPromo />
        {sitePages.length === 0 ? (
          <EmptyState icon="fileText" title="Aucune page pour l'instant">
            <p>Créez la première page de votre site.</p>
            <Button variant="primary" icon="plus" onClick={() => setDialog("new")}>
              Nouvelle page
            </Button>
          </EmptyState>
        ) : (
          <ul className="of-list" aria-label="Pages du site">
            {sorted.map((page) => {
              const status = pageStatus(page, releases);
              const path = slugToPath(page.slug);
              const open = () => navigate({ view: "editor", pageId: page.id });
              return (
                <li key={page.id} className="of-list__item">
                  <span className="of-list__icon" aria-hidden>
                    <Icon name={page.slug === "" ? "home" : "fileText"} />
                  </span>
                  <div className="of-list__main">
                    <button type="button" className="of-link-btn of-list__title" onClick={open}>
                      {page.title}
                    </button>
                    <span className="of-list__meta">
                      <span className="of-mono">{path}</span>
                      <span>Modifiée {timeAgo(page.updatedAt)}</span>
                    </span>
                  </div>
                  <span title={status.title}>
                    <StatusChip tone={status.tone}>{status.label}</StatusChip>
                  </span>
                  <LanguageButtons page={page} locales={locales} translated={translated} />
                  <div className="of-list__actions">
                    <Button size="sm" icon="pencil" onClick={open}>
                      Modifier
                    </Button>
                    <Menu
                      label={`Actions : ${page.title}`}
                      items={[
                        {
                          label: "Paramètres et référencement",
                          icon: "settings",
                          onSelect: () => setDialog(page),
                        },
                        { label: "Dupliquer", icon: "copy", onSelect: () => void duplicate(page) },
                        {
                          label: "Voir en ligne",
                          icon: "externalLink",
                          disabled: page.status !== "published" || !lastLive,
                          onSelect: () => window.open(path, "_blank", "noopener"),
                        },
                        "separator",
                        {
                          label: "Supprimer",
                          icon: "trash",
                          danger: true,
                          disabled: page.slug === "",
                          title:
                            page.slug === ""
                              ? "La page d'accueil ne peut pas être supprimée"
                              : undefined,
                          onSelect: () => setToDelete(page),
                        },
                      ]}
                      trigger={(props) => (
                        <button
                          type="button"
                          className="of-icon-btn"
                          aria-label={`Plus d'actions : ${page.title}`}
                          title="Plus d'actions"
                          {...props}
                        >
                          <Icon name="more" />
                        </button>
                      )}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="of-subtle of-small">
          Astuce : <kbd className="of-kbd">{MOD_KEY}</kbd> <kbd className="of-kbd">K</kbd> pour
          ouvrir une page ou un réglage au clavier.
        </p>
      </section>
      <PageDialog page={dialog} onClose={() => setDialog(null)} />
      <Dialog
        open={Boolean(toDelete)}
        title="Supprimer la page ?"
        onClose={() => setToDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={remove}>
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <p>
          « {toDelete?.title} » sera supprimée de l'admin. Elle restera en ligne jusqu'à la
          prochaine publication. Les liens vers cette page devront être mis à jour.
        </p>
      </Dialog>
    </>
  );
}
