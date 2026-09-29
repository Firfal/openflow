import {
  BUSINESS_TYPES,
  type BusinessInfo,
  businessLines,
  type Closure,
  type TimeRange,
  today,
  WEEKDAYS,
  type Weekday,
} from "@openflow/core";
import { useState } from "react";
import { useAdmin } from "./context.js";
import { saveBusiness } from "./data.js";
import { errorMessage } from "./firebase.js";
import { UnsavedNote, useUnsavedGuard } from "./form-guard.js";
import { Icon } from "./icons.js";
import { Button, FormField, IconButton, StatusChip } from "./ui.js";

const DAY_LABELS: Record<Weekday, string> = {
  mo: "Lundi",
  tu: "Mardi",
  we: "Mercredi",
  th: "Jeudi",
  fr: "Vendredi",
  sa: "Samedi",
  su: "Dimanche",
};

const COUNTRIES = [
  ["FR", "France"],
  ["BE", "Belgique"],
  ["CH", "Suisse"],
  ["LU", "Luxembourg"],
  ["MC", "Monaco"],
  ["CA", "Canada"],
] as const;

const PRICE_RANGES = ["€", "€€", "€€€", "€€€€"] as const;

/** Monday to Friday, 9 h – 18 h: a starting point the owner adjusts. */
const DEFAULT_HOURS: NonNullable<BusinessInfo["hours"]> = {
  mo: [{ opens: "09:00", closes: "18:00" }],
  tu: [{ opens: "09:00", closes: "18:00" }],
  we: [{ opens: "09:00", closes: "18:00" }],
  th: [{ opens: "09:00", closes: "18:00" }],
  fr: [{ opens: "09:00", closes: "18:00" }],
  sa: [],
  su: [],
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims the texts and drops what is empty, so the stored profile stays clean. */
function clean(business: BusinessInfo, links: string): BusinessInfo {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(business)) {
    if (typeof value === "string") {
      if (value.trim()) out[key] = value.trim();
    } else if (value !== undefined && value !== null) out[key] = value;
  }
  const list = links
    .split(/\s+/)
    .map((link) => link.trim())
    .filter((link) => /^https:\/\/\S+$/i.test(link));
  if (list.length > 0) out.links = list;
  else delete out.links;
  if (Array.isArray(out.closures)) {
    const closures = (out.closures as Closure[])
      .filter((c) => c.from)
      .map((c) => ({
        from: c.from,
        ...(c.to && c.to !== c.from ? { to: c.to } : {}),
        ...(c.label?.trim() ? { label: c.label.trim() } : {}),
      }));
    if (closures.length > 0) out.closures = closures;
    else delete out.closures;
  }
  return out as BusinessInfo;
}

function DayHours({
  day,
  ranges,
  onChange,
  onCopy,
}: {
  day: Weekday;
  ranges: TimeRange[];
  onChange: (ranges: TimeRange[]) => void;
  onCopy: () => void;
}) {
  const label = DAY_LABELS[day];
  const open = ranges.length > 0;
  const update = (index: number, patch: Partial<TimeRange>) =>
    onChange(ranges.map((range, n) => (n === index ? { ...range, ...patch } : range)));
  return (
    <div className="of-hours__row">
      <label className="of-checkbox of-hours__day">
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => onChange(e.target.checked ? [{ opens: "09:00", closes: "18:00" }] : [])}
        />
        {label}
      </label>
      {open ? (
        <div className="of-hours__ranges">
          {ranges.map((range, index) => {
            const invalid = range.opens >= range.closes;
            return (
              <div key={index} className="of-hours__range">
                <input
                  className="of-input"
                  type="time"
                  aria-label={`${label}, ouverture${ranges.length > 1 ? ` (plage ${index + 1})` : ""}`}
                  aria-invalid={invalid || undefined}
                  value={range.opens}
                  onChange={(e) => update(index, { opens: e.target.value })}
                />
                <span aria-hidden>–</span>
                <input
                  className="of-input"
                  type="time"
                  aria-label={`${label}, fermeture${ranges.length > 1 ? ` (plage ${index + 1})` : ""}`}
                  aria-invalid={invalid || undefined}
                  value={range.closes}
                  onChange={(e) => update(index, { closes: e.target.value })}
                />
                {ranges.length > 1 && (
                  <IconButton
                    icon="x"
                    size="sm"
                    label={`Retirer la plage ${index + 1} du ${label.toLowerCase()}`}
                    onClick={() => onChange(ranges.filter((_, n) => n !== index))}
                  />
                )}
              </div>
            );
          })}
          {ranges.length < 3 && (
            <button
              type="button"
              className="of-link-btn of-hours__add"
              onClick={() => {
                const last = ranges.at(-1);
                onChange([...ranges, { opens: last?.closes ?? "14:00", closes: "19:00" }]);
              }}
            >
              <Icon name="plus" size={13} /> Ajouter une plage (pause de midi…)
            </button>
          )}
        </div>
      ) : (
        <span className="of-hours__closed">Fermé</span>
      )}
      <IconButton
        icon="copy"
        size="sm"
        label={`Appliquer les horaires du ${label.toLowerCase()} aux autres jours ouverts`}
        disabled={!open}
        onClick={onCopy}
      />
    </div>
  );
}

/**
 * « Établissement »: the business profile read by Google, AI assistants and the site —
 * activity, contact, address, weekly hours, exceptional closures, profiles elsewhere.
 */
export function BusinessForm() {
  const { config, services, settings, user, notify } = useAdmin();
  const [business, setBusiness] = useState<BusinessInfo>(() => settings?.site?.business ?? {});
  const [links, setLinks] = useState(() => (settings?.site?.business?.links ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const current = JSON.stringify({ business, links });
  const [saved, setSaved] = useState(current);
  const dirty = current !== saved;
  const set = (patch: Partial<BusinessInfo>) => setBusiness((b) => ({ ...b, ...patch }));
  const siteName = settings?.site?.name ?? config.site.name;
  const now = today();

  const emailError =
    business.email && !EMAIL.test(business.email.trim())
      ? "Adresse e-mail attendue, ex. bonjour@monsite.fr"
      : undefined;
  const hoursError = WEEKDAYS.some((day) =>
    (business.hours?.[day] ?? []).some((r) => !r.opens || !r.closes || r.opens >= r.closes),
  )
    ? "Une plage horaire se termine avant de commencer : corrigez les heures en rouge."
    : undefined;
  const badLinks = links
    .split(/\s+/)
    .filter(Boolean)
    .filter((link) => !/^https:\/\/\S+$/i.test(link));
  const linksError =
    badLinks.length > 0
      ? `Adresse complète attendue (https://…) : ${badLinks.slice(0, 2).join(", ")}`
      : undefined;
  const closures = business.closures ?? [];

  const setDay = (day: Weekday, ranges: TimeRange[]) =>
    set({ hours: { ...(business.hours ?? {}), [day]: ranges } });
  const copyDay = (day: Weekday) => {
    const ranges = business.hours?.[day] ?? [];
    const hours = { ...(business.hours ?? {}) };
    for (const other of WEEKDAYS) {
      if ((hours[other] ?? []).length > 0) hours[other] = ranges.map((r) => ({ ...r }));
    }
    set({ hours });
  };
  const setClosure = (index: number, patch: Partial<Closure>) =>
    set({ closures: closures.map((c, n) => (n === index ? { ...c, ...patch } : c)) });

  const submit = async () => {
    setBusy(true);
    try {
      const value = clean(business, links);
      await saveBusiness(
        services.db,
        Object.keys(value).length > 0 ? value : null,
        user.email ?? undefined,
      );
      setSaved(current);
      notify("success", "Fiche enregistrée. Publiez pour la mettre en ligne.");
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const guard = useUnsavedGuard(dirty && !busy, () => {
    if (!busy && !emailError && !hoursError && !linksError) void submit();
  });

  const preview = businessLines({ name: siteName, business: clean(business, links) }, now);

  return (
    <form
      className="of-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <section className="of-card of-form" aria-labelledby="of-business-contact">
        <div>
          <h2 id="of-business-contact">Activité et coordonnées</h2>
          <p className="of-card__lead">
            Google, les moteurs IA (ChatGPT, Claude, Gemini…) et votre site affichent ces
            informations quand on cherche à vous joindre.
          </p>
        </div>
        <FormField label="Activité">
          <select
            className="of-input"
            value={business.type ?? "LocalBusiness"}
            onChange={(e) => set({ type: e.target.value })}
          >
            {BUSINESS_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Nom de l'établissement" hint="Laissez vide pour utiliser le nom du site.">
          <input
            className="of-input"
            value={business.name ?? ""}
            placeholder={siteName}
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <div className="of-grid-2">
          <FormField label="Téléphone">
            <input
              className="of-input"
              type="tel"
              autoComplete="tel"
              value={business.phone ?? ""}
              placeholder="01 23 45 67 89"
              onChange={(e) => set({ phone: e.target.value })}
            />
          </FormField>
          <FormField label="E-mail" error={emailError}>
            <input
              className="of-input"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={business.email ?? ""}
              placeholder="bonjour@monsite.fr"
              onChange={(e) => set({ email: e.target.value })}
            />
          </FormField>
        </div>
        <FormField label="Adresse (numéro et rue)">
          <input
            className="of-input"
            autoComplete="street-address"
            value={business.street ?? ""}
            placeholder="12 rue du Four"
            onChange={(e) => set({ street: e.target.value })}
          />
        </FormField>
        <div className="of-grid-address">
          <FormField label="Code postal">
            <input
              className="of-input"
              autoComplete="postal-code"
              inputMode="numeric"
              value={business.postalCode ?? ""}
              onChange={(e) => set({ postalCode: e.target.value })}
            />
          </FormField>
          <FormField label="Ville">
            <input
              className="of-input"
              autoComplete="address-level2"
              value={business.city ?? ""}
              onChange={(e) => set({ city: e.target.value })}
            />
          </FormField>
          <FormField label="Pays">
            <select
              className="of-input"
              value={business.country ?? "FR"}
              onChange={(e) => set({ country: e.target.value })}
            >
              {COUNTRIES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="of-grid-2">
          <FormField
            label="Zone desservie"
            hint="Si vous vous déplacez chez vos clients : « Lyon et 30 km alentour »."
          >
            <input
              className="of-input"
              value={business.areaServed ?? ""}
              onChange={(e) => set({ areaServed: e.target.value })}
            />
          </FormField>
          <FormField label="Gamme de prix">
            <select
              className="of-input"
              value={business.priceRange ?? ""}
              onChange={(e) =>
                set({ priceRange: (e.target.value || undefined) as BusinessInfo["priceRange"] })
              }
            >
              <option value="">Non précisée</option>
              {PRICE_RANGES.map((range) => (
                <option key={range} value={range}>
                  {range}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      <section className="of-card of-form" aria-labelledby="of-business-hours">
        <div>
          <h2 id="of-business-hours">Horaires d'ouverture</h2>
          <p className="of-card__lead">
            « Êtes-vous ouvert le samedi ? » : Google et les moteurs IA répondent avec ces horaires.
          </p>
        </div>
        {business.hours ? (
          <>
            <fieldset className="of-hours">
              <legend className="of-sr-only">Horaires de la semaine</legend>
              {WEEKDAYS.map((day) => (
                <DayHours
                  key={day}
                  day={day}
                  ranges={business.hours?.[day] ?? []}
                  onChange={(ranges) => setDay(day, ranges)}
                  onCopy={() => copyDay(day)}
                />
              ))}
            </fieldset>
            {hoursError && <p className="of-field__error">{hoursError}</p>}
            <FormField
              label="Précision sur les horaires"
              hint="Facultatif : « Sur rendez-vous le lundi », « Fermé les jours fériés »."
            >
              <input
                className="of-input"
                value={business.hoursNote ?? ""}
                onChange={(e) => set({ hoursNote: e.target.value })}
              />
            </FormField>
            <div className="of-row">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set({ hours: undefined, hoursNote: undefined })}
              >
                Ne pas indiquer d'horaires
              </Button>
            </div>
          </>
        ) : (
          <div className="of-row">
            <p className="of-subtle" style={{ flex: "1 1 240px" }}>
              Pas d'horaires indiqués : Google et les moteurs IA ne pourront pas dire si vous êtes
              ouvert.
            </p>
            <Button icon="plus" onClick={() => set({ hours: structuredClone(DEFAULT_HOURS) })}>
              Indiquer les horaires
            </Button>
          </div>
        )}
      </section>

      <section className="of-card of-form" aria-labelledby="of-business-closures">
        <div>
          <h2 id="of-business-closures">Fermetures exceptionnelles</h2>
          <p className="of-card__lead">
            Congés, travaux, jours fériés : ils s'ajoutent aux horaires et disparaissent une fois
            passés.
          </p>
        </div>
        {closures.length > 0 && (
          <ul className="of-closures" aria-label="Fermetures exceptionnelles">
            {closures.map((closure, index) => {
              const past = (closure.to || closure.from) < now;
              return (
                <li key={index} className="of-closures__row">
                  <FormField label="Du">
                    <input
                      className="of-input"
                      type="date"
                      value={closure.from}
                      onChange={(e) => setClosure(index, { from: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Au (inclus)">
                    <input
                      className="of-input"
                      type="date"
                      value={closure.to ?? closure.from}
                      min={closure.from}
                      onChange={(e) => setClosure(index, { to: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Motif (facultatif)">
                    <input
                      className="of-input"
                      value={closure.label ?? ""}
                      placeholder="Congés d'été"
                      onChange={(e) => setClosure(index, { label: e.target.value })}
                    />
                  </FormField>
                  <div className="of-closures__end">
                    {past && <StatusChip tone="grey">Passée</StatusChip>}
                    <IconButton
                      icon="trash"
                      size="sm"
                      label={`Retirer la fermeture du ${closure.from}`}
                      onClick={() => set({ closures: closures.filter((_, n) => n !== index) })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="of-row">
          <Button
            icon="plus"
            size="sm"
            onClick={() => set({ closures: [...closures, { from: now, to: now }] })}
          >
            Ajouter une fermeture
          </Button>
        </div>
      </section>

      <section className="of-card of-form" aria-labelledby="of-business-links">
        <div>
          <h2 id="of-business-links">Présence en ligne</h2>
          <p className="of-card__lead">
            Votre fiche Google (Google Business Profile), vos réseaux sociaux, vos pages sur les
            annuaires : ces liens aident Google et les IA à reconnaître votre établissement.
          </p>
        </div>
        <FormField label="Liens (un par ligne)" error={linksError}>
          <textarea
            className="of-input of-mono"
            rows={3}
            spellCheck={false}
            value={links}
            placeholder={"https://maps.app.goo.gl/…\nhttps://www.instagram.com/…"}
            onChange={(e) => setLinks(e.target.value)}
          />
        </FormField>
      </section>

      {preview.length > 0 && (
        <section className="of-card" aria-labelledby="of-business-preview">
          <h2 id="of-business-preview">Ce que liront Google et les moteurs IA</h2>
          <ul className="of-business-preview">
            {preview.map((line, index) => (
              <li key={index} className={line.startsWith("  ") ? "is-nested" : undefined}>
                {line.replace(/^\s*- /, "")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="of-row of-form__actions">
        <UnsavedNote dirty={dirty && !busy} />
        <Button
          variant="primary"
          type="submit"
          busy={busy}
          disabled={Boolean(emailError || hoursError || linksError)}
        >
          Enregistrer la fiche
        </Button>
      </div>
      {guard}
    </form>
  );
}
