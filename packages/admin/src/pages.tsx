import {
  isValidSlug,
  normalizeSlug,
  type PageSeo,
  type PageStatus,
  slugify,
  slugToPath,
} from "@openflow/core";
import { useState } from "react";
import { useAdmin } from "./context.js";
import { createPage, deletePage, getPage, type PageEntry, updatePageMeta } from "./data.js";
import { errorMessage } from "./firebase.js";
import { Button, Dialog, FormField, StatusChip, timeAgo } from "./ui.js";

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

function PageDialogInner({ page, onClose }: { page: PageEntry | "new"; onClose: () => void }) {
  const { services, pages, user, notify, navigate } = useAdmin();
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
        <FormField
          label="Titre affiché dans Google"
          hint={`${(seo.title ?? "").length}/60 caractères — laissez vide pour utiliser le titre de la page.`}
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

export function PagesView() {
  const { pages, releases, services, user, notify, navigate } = useAdmin();
  const [dialog, setDialog] = useState<PageEntry | "new" | null>(null);
  const [toDelete, setToDelete] = useState<PageEntry | null>(null);
  const lastLive = releases.find((release) => release.status === "live");

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

  return (
    <section className="of-view">
      <header className="of-view__header">
        <div>
          <h1>Pages</h1>
          <p className="of-muted">
            Cliquez sur « Modifier » pour éditer une page directement, puis sur « Publier ».
          </p>
        </div>
        <Button variant="primary" onClick={() => setDialog("new")}>
          Nouvelle page
        </Button>
      </header>
      {pages.length === 0 ? (
        <p className="of-empty">Aucune page pour l'instant.</p>
      ) : (
        <ul className="of-list">
          {pages.map((page) => {
            const unpublished = !lastLive || page.updatedAt > lastLive.createdAt;
            return (
              <li key={page.id} className="of-list__item">
                <div className="of-list__main">
                  <button
                    type="button"
                    className="of-link-btn"
                    onClick={() => navigate({ view: "editor", pageId: page.id })}
                  >
                    {page.title}
                  </button>
                  <span className="of-muted">
                    {slugToPath(page.slug)} · modifiée {timeAgo(page.updatedAt)}
                  </span>
                </div>
                <div className="of-row">
                  {page.status === "published" ? (
                    <StatusChip tone="green">Visible</StatusChip>
                  ) : (
                    <StatusChip tone="grey">Masquée</StatusChip>
                  )}
                  {unpublished && <StatusChip tone="orange">Non publiée</StatusChip>}
                  <Button onClick={() => navigate({ view: "editor", pageId: page.id })}>
                    Modifier
                  </Button>
                  <Button variant="ghost" onClick={() => setDialog(page)}>
                    Paramètres
                  </Button>
                  <Button variant="ghost" onClick={() => duplicate(page)}>
                    Dupliquer
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={page.slug === ""}
                    title={
                      page.slug === "" ? "La page d'accueil ne peut pas être supprimée" : undefined
                    }
                    onClick={() => setToDelete(page)}
                  >
                    Supprimer
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
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
    </section>
  );
}
