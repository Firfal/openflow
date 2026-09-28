import {
  type AgentTokenDoc,
  type BusinessInfo,
  COLLECTIONS,
  type CollectionConfig,
  DOCS,
  estimateSize,
  type IntegrationsDoc,
  type ItemMetaPatch,
  itemMeta,
  joinPage,
  type LegalInfo,
  type MediaDoc,
  type MessageDoc,
  newItemData,
  type OpenFlowConfig,
  PAGE_SIZE_WARNING_BYTES,
  type PageContentDoc,
  type PageDoc,
  type PageMetaDoc,
  type PageTranslation,
  type PageTranslationDoc,
  type ReleaseDoc,
  type SettingsDoc,
  type SettingsTranslation,
  STORAGE_PATHS,
  setItemTitle,
  slugify,
  translationId,
} from "@openflow/core";
import type { Data } from "@puckeditor/core";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  type Firestore,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import type { Services } from "./firebase.js";
import { storageOf } from "./services.js";

/** A page of the list: its metadata only (the content is loaded when the page is opened). */
export type PageEntry = PageMetaDoc & { id: string };
/** A page with its content (editor, duplication, publication checks, AI assistant). */
export type FullPage = PageDoc & { id: string };
export type ReleaseEntry = ReleaseDoc & { id: string };
export type MediaEntry = MediaDoc & { id: string };
export type AgentEntry = AgentTokenDoc & { id: string };
export type MessageEntry = MessageDoc & { id: string };

const now = () => new Date().toISOString();
export const EMPTY_PAGE_DATA: Data = { root: { props: {} }, content: [] };

/** The page list, live: metadata only, so it stays light whatever the size of the pages. */
export function subscribePages(
  db: Firestore,
  onData: (pages: PageEntry[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    collection(db, COLLECTIONS.pages),
    (snap) => {
      const pages = snap.docs.map((d) => ({ id: d.id, ...(d.data() as PageMetaDoc) }));
      pages.sort((a, b) => (a.slug === "" ? -1 : b.slug === "" ? 1 : a.slug.localeCompare(b.slug)));
      onData(pages);
    },
    onError,
  );
}

/** A page and its content (two documents with the same id). */
export async function getPage(db: Firestore, id: string): Promise<FullPage | undefined> {
  const [meta, content] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.pages, id)),
    getDoc(doc(db, COLLECTIONS.pageContent, id)),
  ]);
  if (!meta.exists()) return undefined;
  return {
    id,
    ...joinPage(meta.data() as PageMetaDoc, content.data() as PageContentDoc | undefined),
  };
}

export async function getAllPages(db: Firestore): Promise<FullPage[]> {
  const [metas, contents] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.pages)),
    getDocs(collection(db, COLLECTIONS.pageContent)),
  ]);
  const byId = new Map(contents.docs.map((d) => [d.id, d.data() as PageContentDoc]));
  return metas.docs.map((d) => ({
    id: d.id,
    ...joinPage(d.data() as PageMetaDoc, byId.get(d.id)),
  }));
}

export async function createPage(
  db: Firestore,
  input: Pick<PageDoc, "title" | "slug" | "status" | "seo" | "publishAt">,
  by?: string,
  data: Data = EMPTY_PAGE_DATA,
): Promise<string> {
  const base = slugify(input.title) || "page";
  let id = base;
  for (let n = 2; (await getDoc(doc(db, COLLECTIONS.pages, id))).exists(); n++) id = `${base}-${n}`;
  const { publishAt, ...meta } = input;
  await writePage(db, id, {
    ...meta,
    ...(publishAt ? { publishAt } : {}),
    data,
    updatedAt: now(),
    updatedBy: by,
  });
  return id;
}

/**
 * Copies a page (or an item) as a hidden draft, at the first free address « …-copie », and returns
 * the copy's id.
 */
export async function duplicatePage(
  db: Firestore,
  page: PageEntry,
  slugs: Set<string>,
  by?: string,
): Promise<string | undefined> {
  const full = await getPage(db, page.id);
  if (!full) return undefined;
  const base = `${page.slug || "accueil"}-copie`;
  let slug = base;
  for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
  const title = `${page.title} (copie)`;
  const baseId = slugify(title) || "page";
  let id = baseId;
  for (let n = 2; (await getDoc(doc(db, COLLECTIONS.pages, id))).exists(); n++)
    id = `${baseId}-${n}`;
  await writePage(db, id, {
    title,
    slug,
    status: "draft",
    seo: full.seo,
    data: full.data,
    ...(full.collection ? { collection: full.collection, summary: full.summary } : {}),
    updatedAt: now(),
    updatedBy: by,
  });
  return id;
}

/** Writes both documents of a new page at once. */
export async function writePage(db: Firestore, id: string, page: PageDoc) {
  const { data, ...meta } = page;
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.pages, id), meta satisfies PageMetaDoc);
  batch.set(doc(db, COLLECTIONS.pageContent, id), {
    data,
    updatedAt: meta.updatedAt,
    updatedBy: meta.updatedBy,
  } satisfies PageContentDoc);
  await batch.commit();
}

/** Changes a page's settings; `publishAt: null` cancels its scheduled publication. */
export async function updatePageMeta(
  db: Firestore,
  id: string,
  {
    publishAt,
    ...meta
  }: Partial<Pick<PageDoc, "title" | "slug" | "status" | "seo">> & {
    publishAt?: string | null;
  },
  by?: string,
) {
  await updateDoc(doc(db, COLLECTIONS.pages, id), {
    ...meta,
    ...(publishAt === null ? { publishAt: deleteField() } : publishAt ? { publishAt } : {}),
    updatedAt: now(),
    updatedBy: by,
  });
}

export class PageTooLargeError extends Error {}

/**
 * Saves the content of a page and, in the same write, the date of its metadata (the list shows
 * « Modifications non publiées » from it). For an item of a collection, `item` also updates its
 * title and the values shown in lists (see `itemMeta`).
 */
export async function savePageData(
  db: Firestore,
  id: string,
  data: Data,
  by?: string,
  item?: ItemMetaPatch,
) {
  const size = estimateSize(data);
  if (size > PAGE_SIZE_WARNING_BYTES * 1.25) {
    throw new PageTooLargeError(
      "Cette page est trop volumineuse pour être enregistrée : répartissez son contenu sur plusieurs pages.",
    );
  }
  const stamp = { updatedAt: now(), updatedBy: by };
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.pageContent, id), { data, ...stamp } satisfies PageContentDoc);
  batch.update(doc(db, COLLECTIONS.pages, id), {
    ...stamp,
    ...(item ? { summary: item.summary, ...(item.title ? { title: item.title } : {}) } : {}),
  });
  await batch.commit();
  return size;
}

/** Creates an item of a collection: its page, with the collection's section filled in. */
export async function createItem(
  db: Firestore,
  config: OpenFlowConfig,
  name: string,
  input: Pick<PageDoc, "title" | "slug" | "status" | "seo" | "publishAt"> & { date?: string },
  by?: string,
): Promise<string> {
  const collection = config.collections?.[name] as CollectionConfig;
  const data = newItemData(collection, config, {
    title: input.title,
    date: input.date,
    id: `${collection.component}-${crypto.randomUUID()}`,
  });
  const meta = itemMeta(data, collection, config);
  const base = slugify(input.title) || "element";
  let id = base;
  for (let n = 2; (await getDoc(doc(db, COLLECTIONS.pages, id))).exists(); n++) id = `${base}-${n}`;
  await writePage(db, id, {
    title: meta.title ?? input.title,
    slug: input.slug,
    status: input.status,
    seo: input.seo,
    collection: name,
    summary: meta.summary,
    ...(input.publishAt ? { publishAt: input.publishAt } : {}),
    data,
    updatedAt: now(),
    updatedBy: by,
  });
  return id;
}

/** Renames an item outside the editor: its section's title field follows. */
export async function renameItem(
  db: Firestore,
  config: OpenFlowConfig,
  id: string,
  title: string,
  by?: string,
) {
  const page = await getPage(db, id);
  const collection = page?.collection ? config.collections?.[page.collection] : undefined;
  if (!page || !collection) return;
  const data = setItemTitle(page.data, collection, title);
  await savePageData(db, id, data, by, itemMeta(data, collection, config));
}

export async function deletePage(db: Firestore, id: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, COLLECTIONS.pages, id));
  batch.delete(doc(db, COLLECTIONS.pageContent, id));
  await batch.commit();
}

export function subscribeSettings(
  db: Firestore,
  onData: (settings: SettingsDoc | undefined) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    doc(db, COLLECTIONS.site, DOCS.settings),
    (snap) => onData(snap.exists() ? (snap.data() as SettingsDoc) : undefined),
    onError,
  );
}

/**
 * Replaces the given parts of the settings (`site`, `values`) as a whole, so that a field the
 * owner emptied (the Analytics ID, the address) is removed instead of kept by a deep merge.
 */
export async function saveSettings(
  db: Firestore,
  patch: Partial<Pick<SettingsDoc, "site" | "values">>,
  by?: string,
) {
  await setDoc(
    doc(db, COLLECTIONS.site, DOCS.settings),
    { ...patch, updatedAt: now(), updatedBy: by ?? null },
    { mergeFields: [...Object.keys(patch), "updatedAt", "updatedBy"] },
  );
}

/** Replaces the business profile (`site.business`), keeping the rest of `site`. */
export async function saveBusiness(db: Firestore, business: BusinessInfo | null, by?: string) {
  await setDoc(
    doc(db, COLLECTIONS.site, DOCS.settings),
    {
      site: { business: business ? JSON.parse(JSON.stringify(business)) : null },
      updatedAt: now(),
      updatedBy: by ?? null,
    },
    { mergeFields: ["site.business", "updatedAt", "updatedBy"] },
  );
}

export async function saveLegal(db: Firestore, legal: LegalInfo | null, by?: string) {
  await setDoc(
    doc(db, COLLECTIONS.site, DOCS.settings),
    {
      site: { legal: legal ? JSON.parse(JSON.stringify(legal)) : null },
      updatedAt: now(),
      updatedBy: by ?? null,
    },
    { mergeFields: ["site.legal", "updatedAt", "updatedBy"] },
  );
}

/** A page's translation into one language, if it exists. */
export async function getTranslation(
  db: Firestore,
  pageId: string,
  locale: string,
): Promise<PageTranslationDoc | undefined> {
  const snap = await getDoc(doc(db, COLLECTIONS.pageTranslations, translationId(pageId, locale)));
  return snap.exists() ? (snap.data() as PageTranslationDoc) : undefined;
}

/**
 * Saves a page's translation; the page's date moves too, so the admin shows it as changed until
 * the next publication.
 */
export async function saveTranslation(
  db: Firestore,
  pageId: string,
  locale: string,
  translation: PageTranslation,
  by?: string,
) {
  const at = now();
  const batch = writeBatch(db);
  batch.set(
    doc(db, COLLECTIONS.pageTranslations, translationId(pageId, locale)),
    JSON.parse(
      JSON.stringify({
        page: pageId,
        locale,
        ...translation,
        updatedAt: at,
        updatedBy: by ?? null,
      } satisfies Omit<PageTranslationDoc, "updatedBy"> & { updatedBy: string | null }),
    ),
  );
  batch.update(doc(db, COLLECTIONS.pages, pageId), { updatedAt: at, updatedBy: by ?? null });
  await batch.commit();
}

/** Which pages are translated into which language (the pages list shows it). */
export function subscribeTranslations(
  db: Firestore,
  onData: (translations: Array<{ page: string; locale: string; updatedAt: string }>) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    collection(db, COLLECTIONS.pageTranslations),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const data = d.data() as PageTranslationDoc;
          return { page: data.page, locale: data.locale, updatedAt: data.updatedAt };
        }),
      ),
    onError,
  );
}

/** The common content in one language (Réglages > Contenu commun, in that language). */
export async function saveSettingsTranslation(
  db: Firestore,
  locale: string,
  translation: SettingsTranslation,
  by?: string,
) {
  await setDoc(
    doc(db, COLLECTIONS.site, DOCS.settings),
    {
      translations: { [locale]: JSON.parse(JSON.stringify(translation)) },
      updatedAt: now(),
      updatedBy: by ?? null,
    },
    { mergeFields: [`translations.${locale}`, "updatedAt", "updatedBy"] },
  );
}

/** Public facts of the integrations (reCAPTCHA, e-mails, region), for the legal pages. */
export async function getIntegrations(db: Firestore): Promise<IntegrationsDoc> {
  const snap = await getDoc(doc(db, COLLECTIONS.system, DOCS.integrations));
  return (snap.data() as IntegrationsDoc | undefined) ?? {};
}

/** Replaces the owner's theme tokens (keys absent from `theme` are removed). */
export async function saveTheme(db: Firestore, theme: Record<string, string>, by?: string) {
  await setDoc(
    doc(db, COLLECTIONS.site, DOCS.settings),
    { theme, updatedAt: now(), updatedBy: by ?? null },
    { mergeFields: ["theme", "updatedAt", "updatedBy"] },
  );
}

export function subscribeReleases(
  db: Firestore,
  onData: (releases: ReleaseEntry[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    query(collection(db, COLLECTIONS.releases), orderBy("createdAt", "desc"), limit(30)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ReleaseDoc) }))),
    onError,
  );
}

/** AI assistants allowed on the site: OAuth connections and keys, newest first. */
export function subscribeAgents(
  db: Firestore,
  onData: (agents: AgentEntry[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    query(collection(db, COLLECTIONS.agentTokens), orderBy("createdAt", "desc")),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as AgentTokenDoc) }))),
    onError,
  );
}

/** Messages of the site's forms, newest first (the inbox shows the last 300). */
export function subscribeMessages(
  db: Firestore,
  onData: (messages: MessageEntry[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    query(collection(db, COLLECTIONS.messages), orderBy("createdAt", "desc"), limit(300)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as MessageDoc) }))),
    onError,
  );
}

export function subscribeRelease(
  db: Firestore,
  id: string,
  onData: (release: ReleaseEntry | undefined) => void,
) {
  return onSnapshot(doc(db, COLLECTIONS.releases, id), (snap) =>
    onData(snap.exists() ? { id: snap.id, ...(snap.data() as ReleaseDoc) } : undefined),
  );
}

/** Media library, newest first (site files from `public/` come last). */
export async function listMedia(db: Firestore, max = 300): Promise<MediaEntry[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.media), orderBy("createdAt", "desc"), limit(max)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as MediaDoc) }));
}

function imageSize(file: File): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith("image/")) return Promise.resolve({});
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export const ACCEPTED_IMAGES = "image/png,image/jpeg,image/gif,image/webp,image/avif";
export const ACCEPTED_VIDEOS = "video/mp4,video/webm,video/quicktime";
/** @deprecated use ACCEPTED_IMAGES */
export const ACCEPTED_MEDIA = ACCEPTED_IMAGES;
/** Same limits as the Storage rules (`storage.rules`): videos are optimized after upload. */
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export type MediaKind = "image" | "video";

/** Uploads a file to `cms/media/` and records it in `cms_media`. */
export async function uploadMedia(
  services: Services,
  file: File,
  kind: MediaKind = "image",
): Promise<MediaEntry> {
  const max = kind === "video" ? MAX_VIDEO_BYTES : MAX_MEDIA_BYTES;
  if (file.size > max) {
    throw new Error(`Fichier trop lourd (${Math.round(max / 1024 / 1024)} Mo maximum).`);
  }
  const accepted = kind === "video" ? ACCEPTED_VIDEOS : ACCEPTED_IMAGES;
  if (!accepted.split(",").includes(file.type)) {
    throw new Error(
      kind === "video"
        ? "Format non pris en charge : utilisez une vidéo MP4, WebM ou MOV."
        : "Format non pris en charge : utilisez une image PNG, JPEG, GIF, WebP ou AVIF.",
    );
  }
  const dot = file.name.lastIndexOf(".");
  const name = slugify(dot > 0 ? file.name.slice(0, dot) : file.name) || "image";
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "bin";
  const path = `${STORAGE_PATHS.media}/${Date.now().toString(36)}-${name}.${ext}`;
  const [storage, { getDownloadURL, ref, uploadBytes }] = await Promise.all([
    storageOf(services),
    import("firebase/storage"),
  ]);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type,
    cacheControl: "public, max-age=31536000, immutable",
  });
  const url = await getDownloadURL(storageRef);
  const media: MediaDoc = {
    path,
    url,
    name: file.name,
    contentType: file.type,
    size: file.size,
    ...(await imageSize(file)),
    source: "storage",
    createdAt: now(),
  };
  const created = await addDoc(collection(services.db, COLLECTIONS.media), media);
  return { id: created.id, ...media };
}
