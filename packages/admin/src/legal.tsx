import {
  BOOKING_RETENTION_MONTHS,
  formatAddress,
  type IntegrationsDoc,
  LEGAL_DOCUMENT_PROP,
  LEGAL_LIMITS,
  type LegalDocumentKind,
  type LegalFacts,
  type LegalInfo,
  legalComponentOf,
  legalFacts,
  legalGaps,
  legalSectionsOf,
  MESSAGE_RETENTION_YEARS,
  sanitizeLegal,
} from "@openflow/core";
import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "./context.js";
import { createPage, type FullPage, getAllPages, getIntegrations, saveLegal } from "./data.js";
import { errorMessage } from "./firebase.js";
import { UnsavedNote, useUnsavedGuard } from "./form-guard.js";
import { Button, FormField, StatusChip } from "./ui.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where Google Cloud keeps the data, in the owner's words. */
const REGION_LABELS: Record<string, string> = {
  "europe-west1": "Belgique",
  "europe-west9": "France (Paris)",
  "europe-west3": "Allemagne (Francfort)",
  "europe-west4": "Pays-Bas",
  eur3: "Belgique et Pays-Bas",
};

/**
 * The facts the legal pages are written from (the site's pages and settings, its integrations),
 * loaded once when `enabled`. The same as at publication, drafts included.
 */
export function useLegalFacts(enabled = true): LegalFacts | undefined {
  const { config, services, settings } = useAdmin();
  const [loaded, setLoaded] = useState<{ pages: FullPage[]; integrations: IntegrationsDoc }>();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([getAllPages(services.db), getIntegrations(services.db).catch(() => ({}))]).then(
      ([pages, integrations]) => {
        if (!cancelled) setLoaded({ pages, integrations });
      },
      () => {
        if (!cancelled) setLoaded({ pages: [], integrations: {} });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, services.db]);
  return useMemo(
    () =>
      loaded &&
      legalFacts({
        site: { ...config.site, ...(settings?.site ?? {}) },
        pages: loaded.pages,
        integrations: loaded.integrations,
      }),
    [loaded, config.site, settings?.site],
  );
}

const DOCUMENTS: Array<{ kind: LegalDocumentKind; title: string; slug: string; about: string }> = [
  {
    kind: "notice",
    title: "Mentions légales",
    slug: "mentions-legales",
    about: "Qui publie le site et qui l'héberge. Obligatoires pour un site professionnel.",
  },
  {
    kind: "privacy",
    title: "Politique de confidentialité",
    slug: "confidentialite",
    about:
      "Les données que traite le site, pourquoi, combien de temps, et les droits des visiteurs.",
  },
];

/** Is this page one of the legal pages written by OpenFlow (its usual address, maybe numbered)? */
export function isLegalPageSlug(slug: string): boolean {
  return DOCUMENTS.some((document) => new RegExp(`^${document.slug}(-\\d+)?$`).test(slug));
}

/** The two legal pages: online, hidden, or to create. */
function LegalPages() {
  const { config, services, pages, user, notify, navigate } = useAdmin();
  const [full, setFull] = useState<FullPage[]>();
  const [busy, setBusy] = useState<LegalDocumentKind>();
  const component = legalComponentOf(config.components);

  useEffect(() => {
    let cancelled = false;
    getAllPages(services.db).then(
      (loaded) => !cancelled && setFull(loaded),
      () => !cancelled && setFull([]),
    );
    return () => {
      cancelled = true;
    };
  }, [services.db]);

  const create = async (kind: LegalDocumentKind, title: string, slug: string) => {
    if (!component) return;
    setBusy(kind);
    try {
      const taken = new Set(pages.map((p) => p.slug));
      let address = slug;
      for (let n = 2; taken.has(address); n++) address = `${slug}-${n}`;
      const id = await createPage(
        services.db,
        { title, slug: address, status: "published", seo: {} },
        user.email ?? undefined,
        {
          root: { props: {} },
          content: [
            {
              type: component,
              props: {
                id: `legal-${kind}`,
                ...(config.components[component]?.defaultProps ?? {}),
                [LEGAL_DOCUMENT_PROP]: kind,
              },
            },
          ],
        },
      );
      notify("success", `Page « ${title} » créée. Publiez le site pour la mettre en ligne.`);
      navigate({ view: "editor", pageId: id });
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section className="of-card" aria-labelledby="of-legal-pages">
      <div className="of-card__header">
        <div>
          <h2 id="of-legal-pages">Vos pages légales</h2>
          <p className="of-card__lead">
            Leur texte s'écrit tout seul d'après votre site et les informations ci-dessous, et se
            met à jour à chaque publication.
          </p>
        </div>
      </div>
      {!component ? (
        <p className="of-card__lead">
          Votre site n'a pas de section pour les pages légales : demandez-la à la personne qui l'a
          créé.
        </p>
      ) : (
        <ul className="of-list of-legal-pages">
          {DOCUMENTS.map(({ kind, title, slug, about }) => {
            const page = full?.find((p) => legalSectionsOf(p.data).includes(kind));
            return (
              <li key={kind} className="of-list__item">
                <div className="of-list__main">
                  <span className="of-list__title">{title}</span>
                  <span className="of-list__meta">{page ? `/${page.slug}/` : about}</span>
                </div>
                <div className="of-list__actions">
                  {!full ? null : page ? (
                    <>
                      <StatusChip tone={page.status === "published" ? "green" : "grey"}>
                        {page.status === "published" ? "Visible" : "Masquée"}
                      </StatusChip>
                      <Button
                        size="sm"
                        onClick={() => navigate({ view: "editor", pageId: page.id })}
                      >
                        Ouvrir
                      </Button>
                    </>
                  ) : (
                    <>
                      <StatusChip tone="orange">À créer</StatusChip>
                      <Button
                        size="sm"
                        variant="primary"
                        icon="plus"
                        busy={busy === kind}
                        onClick={() => void create(kind, title, slug)}
                      >
                        Créer la page
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** What the privacy policy says, from the site's own facts. */
function PolicyFacts() {
  const facts = useLegalFacts();
  if (!facts) return null;
  const region = facts.region ? (REGION_LABELS[facts.region] ?? facts.region) : undefined;
  const rows: Array<[string, boolean, string]> = [
    [
      "Mesure d'audience sans cookie",
      facts.stats,
      "Totaux par jour, sans identifiant, effacés après 25 mois.",
    ],
    ["Google Analytics", facts.analytics, "Seulement avec l'accord du visiteur (bandeau)."],
    [
      "Formulaires de contact",
      facts.forms,
      `Messages effacés automatiquement ${MESSAGE_RETENTION_YEARS} ans après leur réception.`,
    ],
    [
      "Prise de rendez-vous",
      facts.booking,
      `Rendez-vous effacés automatiquement ${BOOKING_RETENTION_MONTHS} mois après leur date.`,
    ],
    [
      "Protection anti-robots (reCAPTCHA)",
      (facts.forms || facts.booking) && facts.recaptcha,
      "Google Cloud.",
    ],
    [
      "Messages et rendez-vous transmis par e-mail",
      (facts.forms || facts.booking) && facts.mail,
      "Service Resend.",
    ],
  ];
  return (
    <section className="of-card" aria-labelledby="of-legal-facts">
      <h2 id="of-legal-facts">Ce que dit votre politique de confidentialité</h2>
      <p className="of-card__lead">
        D'après le fonctionnement réel de votre site
        {region ? ` (données stockées en ${region})` : ""}. Si vous activez Google Analytics ou
        ajoutez un formulaire, elle le dira à la prochaine publication.
      </p>
      <ul className="of-facts">
        {rows.map(([label, on, detail]) => (
          <li key={label}>
            <StatusChip tone={on ? "green" : "grey"}>{on ? "Oui" : "Non"}</StatusChip>
            <span>
              <strong>{label}</strong>
              {on && <span className="of-field__hint">{detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** « Informations légales »: the publisher, and the legal pages written from the site. */
export function LegalForm() {
  const { config, services, settings, user, notify } = useAdmin();
  const [legal, setLegal] = useState<LegalInfo>(() => settings?.site?.legal ?? {});
  const [busy, setBusy] = useState(false);
  const current = JSON.stringify(legal);
  const [saved, setSaved] = useState(current);
  const dirty = current !== saved;
  const business = settings?.site?.business;
  const siteName = settings?.site?.name ?? config.site.name;
  const set = (patch: Partial<LegalInfo>) => setLegal((l) => ({ ...l, ...patch }));
  const emailError =
    legal.privacyEmail && !EMAIL.test(legal.privacyEmail.trim())
      ? "Adresse e-mail attendue, ex. contact@monsite.fr"
      : undefined;
  const gaps = legalGaps({ legal: sanitizeLegal(legal), business, siteName });

  const submit = async () => {
    setBusy(true);
    try {
      await saveLegal(services.db, sanitizeLegal(legal) ?? null, user.email ?? undefined);
      setSaved(current);
      notify("success", "Informations enregistrées. Publiez pour mettre à jour les pages légales.");
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const guard = useUnsavedGuard(dirty && !busy, () => {
    if (!busy && !emailError) void submit();
  });

  const text = (key: keyof LegalInfo) => ({
    className: "of-input",
    maxLength: LEGAL_LIMITS[key],
    value: legal[key] ?? "",
    onChange: (e: { target: { value: string } }) => set({ [key]: e.target.value }),
  });

  return (
    <div className="of-form">
      <LegalPages />
      <form
        className="of-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <section className="of-card of-form" aria-labelledby="of-legal-publisher">
          <div>
            <h2 id="of-legal-publisher">Éditeur du site</h2>
            <p className="of-card__lead">
              Figurent dans les mentions légales. Le téléphone, l'e-mail et l'adresse viennent de la
              fiche Établissement.
            </p>
          </div>
          <FormField
            label="Nom ou raison sociale"
            hint="Le nom de votre société, ou vos nom et prénom si vous êtes entrepreneur individuel."
          >
            <input {...text("publisher")} placeholder={business?.name || siteName} />
          </FormField>
          <div className="of-grid-2">
            <FormField label="Forme juridique et capital">
              <input {...text("legalForm")} placeholder="SARL au capital de 10 000 €" />
            </FormField>
            <FormField label="Immatriculation">
              <input {...text("registration")} placeholder="RCS Lyon 123 456 789" />
            </FormField>
          </div>
          <div className="of-grid-2">
            <FormField label="Numéro de TVA intracommunautaire">
              <input {...text("vat")} placeholder="FR 12 123456789" />
            </FormField>
            <FormField label="Directeur de la publication" hint="La personne responsable du site.">
              <input {...text("director")} placeholder="Prénom Nom" />
            </FormField>
          </div>
          <FormField
            label="Adresse du siège"
            hint="Seulement si elle diffère de l'adresse de l'établissement."
          >
            <input {...text("address")} placeholder={formatAddress(business) || undefined} />
          </FormField>
        </section>

        <section className="of-card of-form" aria-labelledby="of-legal-privacy">
          <div>
            <h2 id="of-legal-privacy">Données personnelles et litiges</h2>
          </div>
          <FormField
            label="E-mail pour les questions sur les données personnelles"
            error={emailError}
            hint="Celui de l'établissement s'il est vide. Les visiteurs l'utilisent pour exercer leurs droits."
          >
            <input
              {...text("privacyEmail")}
              type="email"
              placeholder={business?.email || "contact@monsite.fr"}
            />
          </FormField>
          <FormField
            label="Médiateur de la consommation"
            hint="Obligatoire si vous vendez à des particuliers : son nom et son site."
          >
            <input {...text("mediator")} placeholder="CM2C, www.cm2c.net" />
          </FormField>
        </section>

        <div className="of-row of-form__actions of-row--spread">
          {gaps.length > 0 ? (
            <p className="of-legal-gaps">
              <StatusChip tone="orange">À compléter</StatusChip>
              <span>{gaps.join(", ")}</span>
            </p>
          ) : (
            <StatusChip tone="green">Mentions légales complètes</StatusChip>
          )}
          <span className="of-row">
            <UnsavedNote dirty={dirty && !busy} />
            <Button variant="primary" type="submit" busy={busy} disabled={Boolean(emailError)}>
              Enregistrer
            </Button>
          </span>
        </div>
        {guard}
      </form>
      <PolicyFacts />
    </div>
  );
}
