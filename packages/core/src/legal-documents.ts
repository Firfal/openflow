import type { Data } from "@puckeditor/core";
import { formatDate, today } from "./fields.js";
import { FORM_FIELDS_PROP } from "./forms.js";
import {
  type LegalBlock,
  type LegalDocument,
  type LegalDocuments,
  type LegalFacts,
  type LegalFactsInput,
  type LegalSection,
  type LegalText,
  legalSectionsOf,
  MESSAGE_RETENTION_YEARS,
  publisherOf,
} from "./legal.js";
import { slugToPath } from "./slug.js";
import { walkComponents } from "./walk.js";

/**
 * The texts of the legal pages (privacy policy, legal notice), in French or English, written from
 * the site's facts (`legalFacts`) at each publication and in the admin's editor.
 */

/** True when the page holds a form (a section with `formFields`). */
function hasForm(data: Data): boolean {
  let found = false;
  walkComponents(data, (item) => {
    const fields = (item.props as Record<string, unknown>)[FORM_FIELDS_PROP];
    if (Array.isArray(fields) && fields.length > 0) found = true;
  });
  return found;
}

export function legalFacts(input: LegalFactsInput): LegalFacts {
  const { site } = input;
  const published = input.pages.filter((p) => (p.status ?? "published") === "published");
  const pages: LegalFacts["pages"] = {};
  for (const page of published) {
    for (const kind of legalSectionsOf(page.data)) pages[kind] ??= slugToPath(page.slug);
  }
  const date = (input.date ?? today()).slice(0, 10);
  return {
    lang: site.lang || "fr",
    date,
    siteName: site.name,
    ...(site.url ? { url: site.url } : {}),
    ...(site.business ? { business: site.business } : {}),
    ...(site.legal ? { legal: site.legal } : {}),
    stats: site.stats !== "off",
    analytics: Boolean(site.gaMeasurementId),
    forms: published.some((page) => hasForm(page.data)),
    recaptcha: Boolean(input.integrations?.recaptchaSiteKey),
    mail: input.integrations?.mail === "resend",
    ...(input.integrations?.region ? { region: input.integrations.region } : {}),
    pages,
  };
}

interface Entity {
  name: string;
  address?: Record<Lang, string>;
  phone?: string;
}
type Lang = "fr" | "en";

/**
 * Google's contracting entity for Google Cloud (Firebase), by the business's country
 * (cloud.google.com/terms/google-entity): France, Italy and Poland have their own.
 */
function cloudEntity(country: string): Entity {
  if (country === "FR") {
    return {
      name: "Google Cloud France SARL",
      address: {
        fr: "8 rue de Londres, 75009 Paris, France",
        en: "8 rue de Londres, 75009 Paris, France",
      },
      phone: "+33 1 42 68 53 00",
    };
  }
  if (country === "IT") return { name: "Google Cloud Italy S.r.l." };
  if (country === "PL") return { name: "Google Cloud Poland Sp. z o.o." };
  if (country === "CA") return { name: "Google Cloud Canada Corporation" };
  if (AMERICAS_APAC.has(country)) return GOOGLE_LLC;
  return {
    name: "Google Cloud EMEA Limited",
    address: {
      fr: "70 Sir John Rogerson's Quay, Dublin 2, D02 R296, Irlande",
      en: "70 Sir John Rogerson's Quay, Dublin 2, D02 R296, Ireland",
    },
  };
}

const GOOGLE_LLC: Entity = {
  name: "Google LLC",
  address: {
    fr: "1600 Amphitheatre Parkway, Mountain View, CA 94043, États-Unis",
    en: "1600 Amphitheatre Parkway, Mountain View, CA 94043, United States",
  },
  phone: "+1 650 253 0000",
};

const AMERICAS_APAC = new Set([
  "US",
  "MX",
  "BR",
  "AR",
  "CL",
  "CO",
  "PE",
  "AU",
  "NZ",
  "JP",
  "KR",
  "CN",
  "HK",
  "SG",
  "IN",
  "ID",
  "TH",
  "VN",
  "MY",
  "PH",
  "TW",
]);

/** Where the Google Cloud region stores the data. */
const REGIONS: Record<string, { fr: string; en: string; eu: boolean }> = {
  "europe-west1": { fr: "en Belgique", en: "in Belgium", eu: true },
  "europe-west9": { fr: "en France (Paris)", en: "in France (Paris)", eu: true },
  "europe-west3": { fr: "en Allemagne (Francfort)", en: "in Germany (Frankfurt)", eu: true },
  "europe-west10": { fr: "en Allemagne (Berlin)", en: "in Germany (Berlin)", eu: true },
  "europe-west4": { fr: "aux Pays-Bas", en: "in the Netherlands", eu: true },
  "europe-west8": { fr: "en Italie (Milan)", en: "in Italy (Milan)", eu: true },
  "europe-west12": { fr: "en Italie (Turin)", en: "in Italy (Turin)", eu: true },
  "europe-southwest1": { fr: "en Espagne (Madrid)", en: "in Spain (Madrid)", eu: true },
  "europe-north1": { fr: "en Finlande", en: "in Finland", eu: true },
  "europe-north2": { fr: "en Suède (Stockholm)", en: "in Sweden (Stockholm)", eu: true },
  "europe-central2": { fr: "en Pologne (Varsovie)", en: "in Poland (Warsaw)", eu: true },
  eur3: { fr: "en Belgique et aux Pays-Bas", en: "in Belgium and the Netherlands", eu: true },
  "europe-west2": {
    fr: "au Royaume-Uni (Londres)",
    en: "in the United Kingdom (London)",
    eu: false,
  },
  "europe-west6": { fr: "en Suisse (Zurich)", en: "in Switzerland (Zurich)", eu: false },
};

/** Data protection authority to complain to, by the business's country. */
const AUTHORITIES: Record<string, { fr: string; en: string; href: string }> = {
  FR: { fr: "la CNIL", en: "the CNIL", href: "https://www.cnil.fr/fr/plaintes" },
  BE: {
    fr: "l'Autorité de protection des données",
    en: "the Data Protection Authority",
    href: "https://www.autoriteprotectiondonnees.be",
  },
  LU: {
    fr: "la Commission nationale pour la protection des données (CNPD)",
    en: "the National Commission for Data Protection (CNPD)",
    href: "https://cnpd.public.lu",
  },
  CH: {
    fr: "le Préposé fédéral à la protection des données et à la transparence (PFPDT)",
    en: "the Federal Data Protection and Information Commissioner (FDPIC)",
    href: "https://www.edoeb.admin.ch",
  },
  MC: {
    fr: "l'Autorité de protection des données personnelles (APDP)",
    en: "the Personal Data Protection Authority (APDP)",
    href: "https://www.apdp.mc",
  },
  CA: {
    fr: "le Commissariat à la protection de la vie privée du Canada",
    en: "the Office of the Privacy Commissioner of Canada",
    href: "https://www.priv.gc.ca",
  },
};

/**
 * French typography: no-break spaces before « : ; ! ? », inside guillemets, between a number and
 * its unit or its month, and between groups of thousands; typographic apostrophes.
 */
function frenchSpacing(text: string): string {
  return text
    .replace(/ ([:;!?\u00bb])/g, "\u00a0$1")
    .replace(/\u00ab /g, "\u00ab\u00a0")
    .replace(/(\d) (?=(?:h|jours|mois|ans|minutes)\b|%|\u20ac|\d{3}\b)/g, "$1\u00a0")
    .replace(
      /(\d) (?=(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b)/g,
      "$1\u00a0",
    )
    .replace(/(\p{L})'(?=\p{L})/gu, "$1\u2019");
}

const mailLink = (email: string): LegalText => ({ text: email, href: `mailto:${email}` });
const phoneLink = (phone: string): LegalText => ({
  text: phone,
  href: `tel:${phone.replace(/[^+\d]/g, "")}`,
});

/** Applies French spacing to every text of a document. */
function polish(document: LegalDocument): LegalDocument {
  const text = (run: LegalText): LegalText =>
    typeof run === "string" ? frenchSpacing(run) : { ...run, text: frenchSpacing(run.text) };
  const block = (b: LegalBlock): LegalBlock => {
    if (b.type === "p") return { ...b, text: b.text.map(text) };
    if (b.type === "list") return { ...b, items: b.items.map((item) => item.map(text)) };
    if (b.type === "consent") return { ...b, label: frenchSpacing(b.label) };
    return {
      ...b,
      counted: frenchSpacing(b.counted),
      excluded: frenchSpacing(b.excluded),
      refused: frenchSpacing(b.refused),
      stop: frenchSpacing(b.stop),
      resume: frenchSpacing(b.resume),
    };
  };
  return {
    ...document,
    title: frenchSpacing(document.title),
    lead: frenchSpacing(document.lead),
    sections: document.sections.map((s) => ({
      heading: frenchSpacing(s.heading),
      blocks: s.blocks.map(block),
    })),
  };
}

const p = (...text: LegalText[]): LegalBlock => ({ type: "p", text });
const list = (...items: LegalText[][]): LegalBlock => ({ type: "list", items });
const lines = (...items: LegalText[][]): LegalBlock => ({ type: "list", items, plain: true });

// ---------------------------------------------------------------------------------------------
// Privacy policy

function privacyFr(facts: LegalFacts): LegalDocument {
  const publisher = publisherOf(facts);
  const country = facts.business?.country ?? "FR";
  const cloud = cloudEntity(country);
  const region = facts.region ? REGIONS[facts.region] : undefined;
  const authority = AUTHORITIES[country];
  const gaEntity = AMERICAS_APAC.has(country) ? "Google LLC" : "Google Ireland Limited";
  const date = formatDate(facts.date, "fr");
  const sections: LegalSection[] = [];

  const contact: LegalText[] = publisher.email
    ? ["Pour toute question sur vos données : ", mailLink(publisher.email), "."]
    : ["Pour toute question sur vos données, contactez-nous par les moyens indiqués sur ce site."];
  sections.push({
    heading: "Responsable du traitement",
    blocks: [
      p(
        `Le responsable du traitement est ${publisher.name}${
          publisher.address ? `, ${publisher.address}` : ""
        }.`,
      ),
      p(...contact),
    ],
  });

  const summary: LegalText[][] = [
    ["Aucune publicité, aucune revente de vos données."],
    ...(facts.stats ? [["Les visites sont comptées sans cookie et sans vous identifier."]] : []),
    ...(facts.analytics
      ? [["Google Analytics ne mesure votre visite que si vous l'acceptez."]]
      : []),
    ...(facts.forms
      ? [["Les messages envoyés avec nos formulaires servent uniquement à vous répondre."]]
      : []),
  ];
  sections.push({ heading: "En bref", blocks: [list(...summary)] });

  sections.push({
    heading: "Consultation du site",
    blocks: [
      p(
        "Pour afficher les pages et protéger le service contre les abus, notre hébergeur (Google Cloud, service Firebase Hosting) traite votre adresse IP et les informations techniques envoyées par votre navigateur. Il les conserve dans son journal d'accès 60 jours au plus.",
      ),
      p("Base légale : notre intérêt légitime à faire fonctionner le site et à le sécuriser."),
    ],
  });

  if (facts.stats) {
    sections.push({
      heading: "Mesure d'audience sans cookie",
      blocks: [
        p(
          "Pour savoir quelles pages sont lues et comment le site est trouvé, chaque page vue envoie une mesure anonyme : l'adresse de la page, le site d'où vous venez (seulement son nom de domaine) ou la campagne qui vous amène, le type d'appareil (mobile, tablette ou ordinateur) déduit de la largeur de l'écran, et la vitesse d'affichage de la page.",
        ),
        p(
          "Aucun cookie n'est déposé et rien n'est enregistré dans votre navigateur. Votre adresse IP sert seulement, un court instant et sous une forme hachée, à limiter les envois abusifs : elle n'est pas conservée. Nous ne gardons que des totaux par jour, sans identifiant : il est impossible de reconnaître un visiteur ou de suivre son parcours.",
        ),
        p(
          `Ces totaux sont conservés 25 mois, puis effacés automatiquement. Base légale : notre intérêt légitime à mesurer l'audience du site.${
            country === "FR"
              ? " Cette mesure respecte les conditions de la CNIL qui la dispensent de consentement."
              : ""
          }`,
        ),
        p(
          "Vous pouvez vous y opposer : les navigateurs réglés pour demander à ne pas être suivis (Do Not Track, Global Privacy Control) ne sont jamais comptés, et le bouton ci-dessous arrête le comptage sur cet appareil.",
        ),
        {
          type: "stats-optout",
          counted: "Vos visites sont comptées de façon anonyme.",
          excluded: "Vos visites ne sont plus comptées sur cet appareil.",
          refused:
            "Votre navigateur demande à ne pas être suivi : vos visites ne sont pas comptées.",
          stop: "Ne plus compter mes visites",
          resume: "Compter à nouveau mes visites",
        },
      ],
    });
  }

  if (facts.analytics) {
    sections.push({
      heading: "Google Analytics, avec votre accord",
      blocks: [
        p(
          "Si vous l'acceptez dans le bandeau « Cookies », Google Analytics mesure votre visite pour nous donner des statistiques détaillées. Il dépose des cookies (_ga), conservés 13 mois au plus, et reçoit votre adresse IP et des informations sur votre navigation. Les fonctions publicitaires sont désactivées. Les données sont conservées 14 mois au plus dans Google Analytics.",
        ),
        p(
          `Base légale : votre consentement. Votre choix est mémorisé 6 mois ; vous pouvez le changer à tout moment avec le bouton « Cookies » en bas de l'écran ou ci-dessous. Google Analytics est fourni par ${gaEntity}, qui agit comme sous-traitant.`,
        ),
        { type: "consent", label: "Choisir pour les cookies" },
      ],
    });
  }

  if (facts.forms) {
    const blocks: LegalBlock[] = [
      p(
        "Quand vous nous écrivez avec un formulaire du site, nous recevons ce que vous y saisissez (par exemple votre nom, votre adresse e-mail et votre message), la page du formulaire et la date d'envoi. Les champs obligatoires sont signalés : sans eux, nous ne pourrions pas vous répondre. Si votre navigateur indique que le formulaire a été rempli par votre assistant IA, le message le mentionne.",
      ),
      p(
        "Ces données servent uniquement à répondre à votre demande. Base légale : notre intérêt légitime à répondre aux personnes qui nous contactent, ou les mesures précontractuelles que vous demandez (devis, réservation).",
      ),
      p(
        `Elles sont conservées ${MESSAGE_RETENTION_YEARS} ans au plus après leur réception, puis effacées automatiquement ; nous pouvons les effacer plus tôt, une fois votre demande traitée. Pour limiter les envois abusifs, votre adresse IP est utilisée sous une forme hachée dans un compteur effacé après 10 minutes.`,
      ),
    ];
    if (facts.recaptcha) {
      blocks.push(
        p(
          "Les formulaires sont protégés contre les robots par reCAPTCHA Enterprise (Google Cloud), chargé seulement quand vous commencez à en remplir un. Il analyse des informations techniques (adresse IP, navigateur, interactions avec la page) et peut déposer un cookie de sécurité (_GRECAPTCHA). Google agit comme sous-traitant, pour ce seul usage. Base légale : notre intérêt légitime à protéger le site contre les abus.",
        ),
      );
    }
    if (facts.mail) {
      blocks.push(
        p(
          "Chaque message nous est aussi transmis par e-mail, par l'intermédiaire du service Resend.",
        ),
      );
    }
    sections.push({ heading: "Formulaires de contact", blocks });
  }

  const processors: LegalText[][] = [
    [
      `${cloud.name} (Google Cloud) : hébergement du site et stockage des données${
        region ? `, dans ses centres de données ${region.fr}` : ""
      }.`,
    ],
    ...(facts.forms && facts.recaptcha
      ? [[`${cloud.name} : protection des formulaires contre les robots (reCAPTCHA Enterprise).`]]
      : []),
    ...(facts.analytics ? [[`${gaEntity} : Google Analytics, si vous l'acceptez.`]] : []),
    ...(facts.forms && facts.mail
      ? [["Resend, Inc. (États-Unis) : envoi des messages par e-mail."]]
      : []),
  ];
  const abroad = facts.analytics || (facts.forms && facts.mail) || (region && !region.eu);
  sections.push({
    heading: "Qui reçoit vos données",
    blocks: [
      p(
        `Vos données ne sont ni vendues ni louées. Elles ne sont accessibles qu'à ${publisher.name} et à ses sous-traitants techniques, tenus par contrat de les protéger et de ne pas s'en servir pour eux-mêmes :`,
      ),
      list(...processors),
      p(
        abroad
          ? "Certaines données peuvent être transférées hors de l'Union européenne, notamment aux États-Unis. Ces transferts sont encadrés par les clauses contractuelles types de la Commission européenne et, pour les entreprises certifiées, par le Data Privacy Framework."
          : "Google peut exceptionnellement accéder aux données depuis un pays hors de l'Union européenne (maintenance, sécurité). Ces accès sont encadrés par les clauses contractuelles types de la Commission européenne et le Data Privacy Framework.",
      ),
    ],
  });

  const stored: LegalText[][] = [
    ...(facts.analytics
      ? [
          [
            "Cookies de Google Analytics (_ga, _ga_…) : mesure d'audience, seulement avec votre accord, 13 mois au plus.",
          ],
          ["Votre choix sur les cookies : mémorisé 6 mois dans votre navigateur."],
        ]
      : []),
    ...(facts.forms && facts.recaptcha
      ? [["Cookie _GRECAPTCHA : protection des formulaires contre les robots, 6 mois."]]
      : []),
    ...(facts.stats
      ? [
          [
            "Votre refus de la mesure d'audience, si vous l'exprimez : mémorisé dans votre navigateur.",
          ],
        ]
      : []),
  ];
  sections.push({
    heading: "Cookies",
    blocks:
      facts.analytics || (facts.forms && facts.recaptcha)
        ? [p("Ce site n'utilise que les cookies et stockages suivants :"), list(...stored)]
        : [
            p(
              "Ce site ne dépose aucun cookie. Aucun bandeau n'est donc nécessaire.",
              ...(facts.stats
                ? [
                    " Seul votre refus de la mesure d'audience, si vous l'exprimez, est mémorisé dans votre navigateur.",
                  ]
                : []),
            ),
          ],
  });

  sections.push({
    heading: "Vos droits",
    blocks: [
      p(
        "Vous pouvez accéder à vos données, les faire corriger ou effacer, limiter leur utilisation, vous opposer à leur traitement et demander à les recevoir dans un format courant (portabilité). Vous pouvez retirer votre consentement à tout moment, et donner des directives sur le sort de vos données après votre décès.",
      ),
      p(
        ...(publisher.email
          ? ["Écrivez-nous à ", mailLink(publisher.email), " : nous répondons sous un mois."]
          : ["Contactez-nous par les moyens indiqués sur ce site : nous répondons sous un mois."]),
      ),
      p(
        "Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à ",
        authority
          ? { text: authority.fr, href: authority.href }
          : "l'autorité de protection des données de votre pays",
        ".",
      ),
      p("Aucune décision automatisée produisant des effets juridiques n'est prise à votre sujet."),
    ],
  });

  sections.push({
    heading: "Mise à jour",
    blocks: [
      p(
        "Cette politique est rédigée d'après le fonctionnement réel du site et mise à jour à chaque publication.",
        ...(facts.pages.notice
          ? [
              " L'éditeur et l'hébergeur sont présentés dans les ",
              { text: "mentions légales", href: facts.pages.notice },
              ".",
            ]
          : []),
      ),
    ],
  });

  return polish({
    kind: "privacy",
    title: "Politique de confidentialité",
    lead: `Cette page explique quelles données personnelles ce site traite, pourquoi, et comment exercer vos droits. Elle décrit le site tel qu'il est publié le ${date}.`,
    sections,
  });
}

function privacyEn(facts: LegalFacts): LegalDocument {
  const publisher = publisherOf(facts);
  const country = facts.business?.country ?? "FR";
  const cloud = cloudEntity(country);
  const region = facts.region ? REGIONS[facts.region] : undefined;
  const authority = AUTHORITIES[country];
  const gaEntity = AMERICAS_APAC.has(country) ? "Google LLC" : "Google Ireland Limited";
  const date = formatDate(facts.date, "en");
  const sections: LegalSection[] = [];

  sections.push({
    heading: "Data controller",
    blocks: [
      p(
        `The data controller is ${publisher.name}${publisher.address ? `, ${publisher.address}` : ""}.`,
      ),
      p(
        ...(publisher.email
          ? ["For any question about your data: ", mailLink(publisher.email), "."]
          : ["For any question about your data, contact us using the details on this site."]),
      ),
    ],
  });

  sections.push({
    heading: "In short",
    blocks: [
      list(
        ["No advertising, and your data is never sold."],
        ...(facts.stats
          ? [["Visits are counted without cookies and without identifying you."]]
          : []),
        ...(facts.analytics
          ? [["Google Analytics only measures your visit if you accept it."]]
          : []),
        ...(facts.forms ? [["Messages sent with our forms are only used to answer you."]] : []),
      ),
    ],
  });

  sections.push({
    heading: "Browsing the site",
    blocks: [
      p(
        "To display the pages and protect the service against abuse, our host (Google Cloud, Firebase Hosting) processes your IP address and the technical information sent by your browser. It keeps them in its access log for up to 60 days.",
      ),
      p("Legal basis: our legitimate interest in running and securing the site."),
    ],
  });

  if (facts.stats) {
    sections.push({
      heading: "Audience measurement without cookies",
      blocks: [
        p(
          "To know which pages are read and how the site is found, each page view sends an anonymous measure: the page address, the site you come from (its domain name only) or the campaign that brought you, the type of device (mobile, tablet or computer) deduced from the screen width, and how fast the page displayed.",
        ),
        p(
          "No cookie is set and nothing is stored in your browser. Your IP address is only used, briefly and in hashed form, to limit abusive sending: it is not kept. We only keep daily totals, without any identifier: a visitor cannot be recognised or followed.",
        ),
        p(
          "These totals are kept for 25 months, then erased automatically. Legal basis: our legitimate interest in measuring the site's audience.",
        ),
        p(
          "You can object: browsers set to ask not to be tracked (Do Not Track, Global Privacy Control) are never counted, and the button below stops the counting on this device.",
        ),
        {
          type: "stats-optout",
          counted: "Your visits are counted anonymously.",
          excluded: "Your visits are no longer counted on this device.",
          refused: "Your browser asks not to be tracked: your visits are not counted.",
          stop: "Stop counting my visits",
          resume: "Count my visits again",
        },
      ],
    });
  }

  if (facts.analytics) {
    sections.push({
      heading: "Google Analytics, with your consent",
      blocks: [
        p(
          "If you accept it in the “Cookies” banner, Google Analytics measures your visit to give us detailed statistics. It sets cookies (_ga), kept for up to 13 months, and receives your IP address and information about your browsing. Advertising features are turned off. The data is kept for up to 14 months in Google Analytics.",
        ),
        p(
          `Legal basis: your consent. Your choice is remembered for 6 months; you can change it at any time with the “Cookies” button at the bottom of the screen or below. Google Analytics is provided by ${gaEntity}, acting as a processor.`,
        ),
        { type: "consent", label: "Choose for cookies" },
      ],
    });
  }

  if (facts.forms) {
    const blocks: LegalBlock[] = [
      p(
        "When you write to us with a form of the site, we receive what you type (for instance your name, e-mail address and message), the page of the form and the date. Required fields are marked: without them we could not answer you. If your browser reports that the form was filled in by your AI assistant, the message says so.",
      ),
      p(
        "This data is only used to answer your request. Legal basis: our legitimate interest in answering the people who contact us, or the pre-contractual steps you ask for (quote, booking).",
      ),
      p(
        `It is kept for up to ${MESSAGE_RETENTION_YEARS} years after it arrives, then erased automatically; we may erase it sooner, once your request is handled. To limit abusive sending, your IP address is used in hashed form in a counter erased after 10 minutes.`,
      ),
    ];
    if (facts.recaptcha) {
      blocks.push(
        p(
          "The forms are protected against bots by reCAPTCHA Enterprise (Google Cloud), loaded only when you start filling one in. It analyses technical information (IP address, browser, interactions with the page) and may set a security cookie (_GRECAPTCHA). Google acts as a processor, for this sole purpose. Legal basis: our legitimate interest in protecting the site against abuse.",
        ),
      );
    }
    if (facts.mail) {
      blocks.push(p("Each message is also sent to us by e-mail, through the Resend service."));
    }
    sections.push({ heading: "Contact forms", blocks });
  }

  const abroad = facts.analytics || (facts.forms && facts.mail) || (region && !region.eu);
  sections.push({
    heading: "Who receives your data",
    blocks: [
      p(
        `Your data is neither sold nor rented. Only ${publisher.name} has access to it, with its technical processors, bound by contract to protect it and not to use it for themselves:`,
      ),
      list(
        [
          `${cloud.name} (Google Cloud): hosting of the site and storage of the data${
            region ? `, in its data centres ${region.en}` : ""
          }.`,
        ],
        ...(facts.forms && facts.recaptcha
          ? [[`${cloud.name}: protection of the forms against bots (reCAPTCHA Enterprise).`]]
          : []),
        ...(facts.analytics ? [[`${gaEntity}: Google Analytics, if you accept it.`]] : []),
        ...(facts.forms && facts.mail
          ? [["Resend, Inc. (United States): sending the messages by e-mail."]]
          : []),
      ),
      p(
        abroad
          ? "Some data may be transferred outside the European Union, notably to the United States. These transfers are covered by the European Commission's standard contractual clauses and, for certified companies, by the Data Privacy Framework."
          : "Google may exceptionally access the data from a country outside the European Union (maintenance, security). Such access is covered by the European Commission's standard contractual clauses and the Data Privacy Framework.",
      ),
    ],
  });

  sections.push({
    heading: "Cookies",
    blocks:
      facts.analytics || (facts.forms && facts.recaptcha)
        ? [
            p("This site only uses the following cookies and storage:"),
            list(
              ...(facts.analytics
                ? [
                    [
                      "Google Analytics cookies (_ga, _ga_…): audience measurement, only with your consent, up to 13 months.",
                    ],
                    ["Your cookie choice: remembered for 6 months in your browser."],
                  ]
                : []),
              ...(facts.forms && facts.recaptcha
                ? [["_GRECAPTCHA cookie: protection of the forms against bots, 6 months."]]
                : []),
              ...(facts.stats
                ? [
                    [
                      "Your refusal of the audience measurement, if you express it: remembered in your browser.",
                    ],
                  ]
                : []),
            ),
          ]
        : [
            p(
              "This site sets no cookie, so no banner is needed.",
              ...(facts.stats
                ? [
                    " Only your refusal of the audience measurement, if you express it, is remembered in your browser.",
                  ]
                : []),
            ),
          ],
  });

  sections.push({
    heading: "Your rights",
    blocks: [
      p(
        "You can access your data, have it corrected or erased, restrict its use, object to its processing and ask to receive it in a common format (portability). You can withdraw your consent at any time.",
      ),
      p(
        ...(publisher.email
          ? ["Write to us at ", mailLink(publisher.email), ": we answer within one month."]
          : ["Contact us using the details on this site: we answer within one month."]),
      ),
      p(
        "If you believe your rights are not respected, you can lodge a complaint with ",
        authority
          ? { text: authority.en, href: authority.href }
          : "the data protection authority of your country",
        ".",
      ),
      p("No automated decision with legal effects is made about you."),
    ],
  });

  sections.push({
    heading: "Updates",
    blocks: [
      p(
        "This policy is written from how the site actually works and updated at each publication.",
        ...(facts.pages.notice
          ? [
              " The publisher and the host are presented in the ",
              { text: "legal notice", href: facts.pages.notice },
              ".",
            ]
          : []),
      ),
    ],
  });

  return {
    kind: "privacy",
    title: "Privacy policy",
    lead: `This page explains which personal data this site processes, why, and how to exercise your rights. It describes the site as published on ${date}.`,
    sections,
  };
}

// ---------------------------------------------------------------------------------------------
// Legal notice

function noticeFr(facts: LegalFacts): LegalDocument {
  const publisher = publisherOf(facts);
  const { legal } = facts;
  const country = facts.business?.country ?? "FR";
  const cloud = cloudEntity(country);
  const identity: LegalText[][] = [
    [publisher.name],
    ...(legal?.legalForm ? [[legal.legalForm]] : []),
    ...(publisher.address ? [[`Adresse : ${publisher.address}`]] : []),
    ...(legal?.registration ? [[`Immatriculation : ${legal.registration}`]] : []),
    ...(legal?.vat ? [[`TVA intracommunautaire : ${legal.vat}`]] : []),
    ...(publisher.phone ? [["Téléphone : ", phoneLink(publisher.phone)]] : []),
    ...(facts.business?.email ? [["E-mail : ", mailLink(facts.business.email)]] : []),
    ...(legal?.director ? [[`Directeur de la publication : ${legal.director}`]] : []),
  ];
  const host: LegalText[][] = [
    [`${cloud.name} (Google Cloud, service Firebase Hosting)`],
    ...(cloud.address ? [[cloud.address.fr]] : []),
    ...(cloud.phone ? [["Téléphone : ", phoneLink(cloud.phone)]] : []),
  ];
  const sections: LegalSection[] = [
    { heading: "Éditeur du site", blocks: [lines(...identity)] },
    { heading: "Hébergement", blocks: [lines(...host)] },
  ];
  if (legal?.mediator) {
    sections.push({
      heading: "Médiation de la consommation",
      blocks: [
        p(
          `En cas de litige, après une réclamation écrite restée sans réponse satisfaisante, vous pouvez recourir gratuitement au médiateur de la consommation : ${legal.mediator}.`,
        ),
      ],
    });
  }
  sections.push({
    heading: "Propriété intellectuelle",
    blocks: [
      p(
        `Les textes, photos, logos et vidéos de ce site appartiennent à ${publisher.name} ou sont utilisés avec l'autorisation de leurs auteurs. Leur reproduction sans accord préalable est interdite.`,
      ),
    ],
  });
  sections.push({
    heading: "Données personnelles",
    blocks: [
      facts.pages.privacy
        ? p(
            "Les données traitées par ce site et vos droits sont décrits dans la ",
            { text: "politique de confidentialité", href: facts.pages.privacy },
            ".",
          )
        : p(
            ...(publisher.email
              ? [
                  "Pour toute question sur vos données personnelles : ",
                  mailLink(publisher.email),
                  ".",
                ]
              : ["Pour toute question sur vos données personnelles, contactez-nous."]),
          ),
    ],
  });
  return polish({
    kind: "notice",
    title: "Mentions légales",
    lead: `Informations sur l'éditeur et l'hébergeur de ce site, à jour au ${formatDate(facts.date, "fr")}.`,
    sections,
  });
}

function noticeEn(facts: LegalFacts): LegalDocument {
  const publisher = publisherOf(facts);
  const { legal } = facts;
  const cloud = cloudEntity(facts.business?.country ?? "FR");
  const sections: LegalSection[] = [
    {
      heading: "Publisher",
      blocks: [
        lines(
          [publisher.name],
          ...(legal?.legalForm ? [[legal.legalForm]] : []),
          ...(publisher.address ? [[`Address: ${publisher.address}`]] : []),
          ...(legal?.registration ? [[`Registration: ${legal.registration}`]] : []),
          ...(legal?.vat ? [[`VAT number: ${legal.vat}`]] : []),
          ...(publisher.phone ? [["Phone: ", phoneLink(publisher.phone)]] : []),
          ...(facts.business?.email ? [["E-mail: ", mailLink(facts.business.email)]] : []),
          ...(legal?.director ? [[`Director of publication: ${legal.director}`]] : []),
        ),
      ],
    },
    {
      heading: "Hosting",
      blocks: [
        lines(
          [`${cloud.name} (Google Cloud, Firebase Hosting)`],
          ...(cloud.address ? [[cloud.address.en]] : []),
          ...(cloud.phone ? [["Phone: ", phoneLink(cloud.phone)]] : []),
        ),
      ],
    },
  ];
  if (legal?.mediator) {
    sections.push({
      heading: "Consumer mediation",
      blocks: [
        p(
          `In case of a dispute, after a written complaint left without a satisfactory answer, you can turn to the consumer mediator free of charge: ${legal.mediator}.`,
        ),
      ],
    });
  }
  sections.push({
    heading: "Intellectual property",
    blocks: [
      p(
        `The texts, photos, logos and videos of this site belong to ${publisher.name} or are used with their authors' permission. They may not be reproduced without prior consent.`,
      ),
    ],
  });
  sections.push({
    heading: "Personal data",
    blocks: [
      facts.pages.privacy
        ? p(
            "The data processed by this site and your rights are described in the ",
            { text: "privacy policy", href: facts.pages.privacy },
            ".",
          )
        : p(
            ...(publisher.email
              ? ["For any question about your personal data: ", mailLink(publisher.email), "."]
              : ["For any question about your personal data, contact us."]),
          ),
    ],
  });
  return {
    kind: "notice",
    title: "Legal notice",
    lead: `Information about the publisher and the host of this site, up to date on ${formatDate(facts.date, "en")}.`,
    sections,
  };
}

/** Both documents, in the site's language (French, or English for any other language). */
export function legalDocuments(facts: LegalFacts): LegalDocuments {
  const french = facts.lang.toLowerCase().startsWith("fr");
  return french
    ? { privacy: privacyFr(facts), notice: noticeFr(facts) }
    : { privacy: privacyEn(facts), notice: noticeEn(facts) };
}

/** A document as plain text (llms-full.txt, AI tools). */
export function legalDocumentText(document: LegalDocument): string {
  const run = (text: LegalText[]) =>
    text.map((part) => (typeof part === "string" ? part : part.text)).join("");
  const lines = [document.title, "", document.lead];
  for (const section of document.sections) {
    lines.push("", section.heading);
    for (const block of section.blocks) {
      if (block.type === "p") lines.push(run(block.text));
      else if (block.type === "list") for (const item of block.items) lines.push(`- ${run(item)}`);
    }
  }
  return lines.join("\n");
}
