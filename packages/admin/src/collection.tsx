import { collectionEntry, formatDate, sortEntries } from "@openflow/core";
import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "./context.js";
import { deletePage, duplicatePage, type PageEntry } from "./data.js";
import { errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { PageDialog, pageStatus } from "./pages.js";
import { PageHead } from "./shell.js";
import { Button, Dialog, EmptyState, Menu, StatusChip, timeAgo } from "./ui.js";

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Filter = "all" | "published" | "draft";

/**
 * Items of a collection (articles, projects…), as Webflow's CMS lists them: the newest first, with
 * their image, date and state. Each item opens in the editor like a page.
 */
export function CollectionView({ name }: { name: string }) {
  const { config, pages, releases, services, user, notify, navigate, settings } = useAdmin();
  const collection = config.collections?.[name];
  const [dialog, setDialog] = useState<PageEntry | "new" | null>(null);
  const [toDelete, setToDelete] = useState<PageEntry | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const lastLive = releases.find((release) => release.status === "live");
  const lang = settings?.site?.lang ?? config.site.lang ?? "fr";

  // « Nouvel article » from the command palette (`requestNewItem`).
  useEffect(() => {
    const open = () => setDialog("new");
    window.addEventListener("openflow:new-item", open);
    return () => window.removeEventListener("openflow:new-item", open);
  }, []);

  const items = useMemo(() => {
    if (!collection) return [];
    const own = pages.filter((page) => page.collection === name);
    const byId = new Map(own.map((page) => [page.id, page]));
    const entries = own.map((page) => collectionEntry(page, collection, config));
    return sortEntries(entries, collection).map((entry) => ({
      entry,
      page: byId.get(entry.id) as PageEntry,
    }));
  }, [pages, name, collection, config]);

  if (!collection) {
    return (
      <section className="of-view of-view--narrow" style={{ paddingTop: 64 }}>
        <EmptyState icon="layers" title="Cette collection n'existe pas">
          <p>Elle a peut-être été retirée du site.</p>
          <Button icon="arrowLeft" onClick={() => navigate({ view: "pages" })}>
            Retour aux pages
          </Button>
        </EmptyState>
      </section>
    );
  }

  const addLabel = collection.addLabel ?? "Nouvel élément";
  const visibleCount = items.filter(({ page }) => page.status === "published").length;
  const needle = fold(query.trim());
  const shown = items.filter(
    ({ page, entry }) =>
      (filter === "all" || page.status === filter) &&
      (!needle || fold(`${entry.title} ${entry.slug}`).includes(needle)),
  );

  const duplicate = async (page: PageEntry) => {
    try {
      const slugs = new Set(pages.map((p) => p.slug));
      await duplicatePage(services.db, page, slugs, user.email ?? undefined);
      notify(
        "success",
        `« ${page.title} » dupliqué (masqué tant que vous ne le rendez pas visible).`,
      );
    } catch (error) {
      notify("error", errorMessage(error));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deletePage(services.db, toDelete.id);
      notify("success", `« ${toDelete.title} » supprimé. Publiez pour le retirer du site.`);
    } catch (error) {
      notify("error", errorMessage(error));
    }
    setToDelete(null);
  };

  const icon = collection.icon ?? "layers";
  return (
    <>
      <PageHead
        title={collection.label}
        description={
          <>
            Chaque élément a sa page, à l'adresse{" "}
            <span className="of-mono">/{collection.path}/…</span>
          </>
        }
        actions={
          <Button icon="plus" onClick={() => setDialog("new")}>
            {addLabel}
          </Button>
        }
      />
      <section className="of-view">
        {items.length === 0 ? (
          <EmptyState icon={icon} title="Aucun élément pour l'instant">
            <p>
              Ajoutez le premier : il aura sa propre page, et les sections qui affichent «{" "}
              {collection.label} » le montreront automatiquement.
            </p>
            <Button variant="primary" icon="plus" onClick={() => setDialog("new")}>
              {addLabel}
            </Button>
          </EmptyState>
        ) : (
          <>
            <div className="of-toolbar">
              <fieldset className="of-segmented">
                <legend className="of-sr-only">Afficher</legend>
                {(
                  [
                    ["all", `Tous (${items.length})`],
                    ["published", `Visibles (${visibleCount})`],
                    ["draft", `Masqués (${items.length - visibleCount})`],
                  ] as Array<[Filter, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    className={filter === value ? "is-active" : ""}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
              <div className="of-search of-toolbar__search">
                <Icon name="search" size={14} className="of-search__icon" />
                <input
                  className="of-input"
                  type="search"
                  aria-label={`Rechercher dans ${collection.label}`}
                  placeholder="Rechercher par titre…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="of-subtle">
                Aucun élément ne correspond{needle ? ` à « ${query.trim()} »` : ""}.
              </p>
            ) : (
              <ul className="of-list" aria-label={collection.label}>
                {shown.map(({ page, entry }) => {
                  const status = pageStatus(page, lastLive);
                  const open = () => navigate({ view: "editor", pageId: page.id });
                  const image = entry.image?.src;
                  return (
                    <li key={page.id} className="of-list__item">
                      {image ? (
                        <img className="of-list__thumb" src={image} alt="" loading="lazy" />
                      ) : (
                        <span className="of-list__icon" aria-hidden>
                          <Icon name={icon} />
                        </span>
                      )}
                      <div className="of-list__main">
                        <button type="button" className="of-link-btn of-list__title" onClick={open}>
                          {page.title}
                        </button>
                        <span className="of-list__meta">
                          {entry.date && (
                            <time dateTime={entry.date}>{formatDate(entry.date, lang)}</time>
                          )}
                          <span className="of-mono">{entry.href}</span>
                          <span>Modifié {timeAgo(page.updatedAt)}</span>
                        </span>
                      </div>
                      <span title={status.title}>
                        <StatusChip tone={status.tone}>{itemStatusLabel(status.label)}</StatusChip>
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
                            {
                              label: "Dupliquer",
                              icon: "copy",
                              onSelect: () => void duplicate(page),
                            },
                            {
                              label: "Voir en ligne",
                              icon: "externalLink",
                              disabled: page.status !== "published" || !lastLive,
                              onSelect: () => window.open(entry.href, "_blank", "noopener"),
                            },
                            "separator",
                            {
                              label: "Supprimer",
                              icon: "trash",
                              danger: true,
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
          </>
        )}
      </section>
      <PageDialog page={dialog} collection={name} onClose={() => setDialog(null)} />
      <Dialog
        open={Boolean(toDelete)}
        title="Supprimer cet élément ?"
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
          « {toDelete?.title} » sera supprimé de l'admin. Il restera en ligne jusqu'à la prochaine
          publication, puis disparaîtra des listes du site.
        </p>
      </Dialog>
    </>
  );
}

/** Page statuses are feminine (« Masquée ») ; items are named without gender. */
function itemStatusLabel(label: string): string {
  return label === "Masquée" ? "Masqué" : label === "Jamais publiée" ? "Jamais publié" : label;
}
