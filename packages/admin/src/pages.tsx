import {
  isValidSlug,
  normalizeSlug,
  type PageSeo,
  type PageStatus,
  slugify,
  slugToPath,
} from "@openflow/core";
import { useEffect, useState } from "react";
import { useAdmin } from "./context.js";
import {
  createPage,
  deletePage,
  getPage,
  type PageEntry,
  type ReleaseEntry,
  updatePageMeta,
} from "./data.js";
import { errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { PageHead, useSiteUrl } from "./shell.js";
import { Button, Dialog, EmptyState, FormField, Menu, MOD_KEY, StatusChip, timeAgo } from "./ui.js";

interface PageForm {
  title: string;
  slug: string;
  status: PageStatus;
  seo: PageSeo;
}

export function PageDialog({
  page,
  onClose,
}: {
  page: PageEntry | "new" | null;
  onClose: () => void;
}) {
  return page ? (
    <PageDialogInner key={page === "new" ? page : page.id} page={page} onClose={onClose} />
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

function PageDialogInner({ page, onClose }: { page: PageEntry | "new"; onClose: () => void }) {
  const { services, pages, user, notify, navigate, settings } = useAdmin();
  const isNew = page === "new";
  const existing = isNew ? undefined : page;
  const isHome = existing?.slug === "";
  const [form, setForm] = useState<PageForm>({
    title: existing?.title ?? "",
    slug: existing?.slug ?? "",
    status: existing?.status ?? "published",
    seo: existing?.seo ?? {},
  });
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);

  const slug = isHome ? "" : form.slug;
  const duplicate = pages.find((p) => p.slug === slug && p.id !== existing?.id);
  const slugError =
    !isHome && !slug
      ? "Adresse obligatoire"
      : !isValidSlug(slug)
        ? "Minuscules, chiffres et tirets uniquement"
        : duplicate
          ? `Déjà utilisée par « ${duplicate.title} »`
          : undefined;
  const canSave = form.title.trim() && !slugError;

  const save = async () => {
    setBusy(true);
    try {
      const meta = { title: form.title.trim(), slug, status: form.status, seo: form.seo };
      if (existing) {
        await updatePageMeta(services.db, existing.id, meta, user.email ?? undefined);
        notify("success", "Paramètres de la page enregistrés.");
        onClose();
      } else {
        const id = await createPage(services.db, meta, user.email ?? undefined);
        onClose();
        navigate({ view: "editor", pageId: id });
      }
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const seo = form.seo;
  return (
    <Dialog
      open
      title={isNew ? "Nouvelle page" : `Paramètres — ${existing?.title}`}
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
      <FormField label="Titre de la page">
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
        error={slugError}
        hint={
          isHome
            ? "La page d'accueil est toujours à la racine du site."
            : `Le site affichera cette page à ${slugToPath(slug)}`
        }
      >
        <div className="of-prefixed">
          <span>/</span>
          <input
            className="of-input"
            value={slug}
            disabled={isHome}
            onChange={(e) => {
              setSlugTouched(true);
              setForm((f) => ({
                ...f,
                slug: normalizeSlug(e.target.value) || e.target.value.toLowerCase(),
              }));
            }}
          />
        </div>
      </FormField>
      <label className="of-checkbox">
        <input
          type="checkbox"
          checked={form.status === "published"}
          onChange={(e) =>
            setForm((f) => ({ ...f, status: e.target.checked ? "published" : "draft" }))
          }
        />
        Visible sur le site (à la prochaine publication)
      </label>
      <fieldset className="of-fieldset">
        <legend>Référencement (Google)</legend>
        <SearchPreview
          title={seo.title || form.title || "Titre de la page"}
          path={slugToPath(slug)}
          description={
            seo.description || settings?.site?.description || "Ajoutez une description ci-dessous."
          }
        />
        <FormField
          label="Titre affiché dans Google"
          hint={`${(seo.title ?? "").length}/60 caractères. Laissez vide pour utiliser le titre de la page.`}
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
          Masquer cette page des moteurs de recherche
        </label>
      </fieldset>
    </Dialog>
  );
}

/** Publication state of a page, as one status (Webflow's CMS vocabulary, simplified). */
function pageStatus(page: PageEntry, lastLive: ReleaseEntry | undefined) {
  if (page.status !== "published") {
    return { tone: "grey" as const, label: "Masquée", title: "N'apparaît pas sur le site" };
  }
  if (!lastLive) {
    return {
      tone: "orange" as const,
      label: "Jamais publiée",
      title: "Publiez pour la mettre en ligne",
    };
  }
  if (page.updatedAt > lastLive.createdAt) {
    return {
      tone: "orange" as const,
      label: "Modifications non publiées",
      title: "Publiez pour mettre ces modifications en ligne",
    };
  }
  return { tone: "green" as const, label: "En ligne", title: "À jour sur le site" };
}

/** Is the live site up to date? (last publication, pending changes). */
function SiteStatus() {
  const { pages, releases, settings } = useAdmin();
  const siteUrl = useSiteUrl();
  const lastLive = releases.find((release) => release.status === "live");
  const running = releases.find((r) => r.status === "queued" || r.status === "building");
  const changed = pages.filter((page) => !lastLive || page.updatedAt > lastLive.createdAt).length;
  const settingsChanged = Boolean(
    lastLive && settings?.updatedAt && settings.updatedAt > lastLive.createdAt,
  );
  const host = siteUrl.replace(/^https?:\/\//, "");
  let text: string;
  let tone: "green" | "orange" | "blue";
  if (running) {
    text = "Publication en cours…";
    tone = "blue";
  } else if (!lastLive) {
    text = "Le site n'a pas encore été publié depuis l'admin.";
    tone = "orange";
  } else if (changed > 0 || settingsChanged) {
    const parts = [
      changed > 0
        ? `${changed} page${changed > 1 ? "s" : ""} modifiée${changed > 1 ? "s" : ""}`
        : "",
      settingsChanged ? "réglages modifiés" : "",
    ].filter(Boolean);
    text = `${parts.join(" et ")} depuis la dernière publication (${timeAgo(lastLive.createdAt)}).`;
    tone = "orange";
  } else {
    text = `Tout est en ligne. Dernière publication ${timeAgo(lastLive.createdAt)}.`;
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

export function PagesView() {
  const { pages, releases, services, user, notify, navigate } = useAdmin();
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
      const full = await getPage(services.db, page.id);
      if (!full) return;
      let n = 2;
      while (pages.some((p) => p.slug === `${page.slug || "accueil"}-copie${n > 2 ? `-${n}` : ""}`))
        n++;
      const slug = `${page.slug || "accueil"}-copie${n > 2 ? `-${n}` : ""}`;
      await createPage(
        services.db,
        { title: `${page.title} (copie)`, slug, status: "draft", seo: full.seo },
        user.email ?? undefined,
        full.data,
      );
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

  // Home first, then by title: the order owners expect in a site map.
  const sorted = [...pages].sort((a, b) =>
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
        {pages.length === 0 ? (
          <EmptyState icon="fileText" title="Aucune page pour l'instant">
            <p>Créez la première page de votre site.</p>
            <Button variant="primary" icon="plus" onClick={() => setDialog("new")}>
              Nouvelle page
            </Button>
          </EmptyState>
        ) : (
          <ul className="of-list" aria-label="Pages du site">
            {sorted.map((page) => {
              const status = pageStatus(page, lastLive);
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
        <p className="of-subtle" style={{ fontSize: 12.5 }}>
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
