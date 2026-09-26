import {
  COLLECTIONS,
  DOCS,
  estimateSize,
  type MediaDoc,
  PAGE_SIZE_WARNING_BYTES,
  type PageDoc,
  type ReleaseDoc,
  type SettingsDoc,
  STORAGE_PATHS,
  slugify,
} from "@openflow/core";
import type { Data } from "@puckeditor/core";
import {
  addDoc,
  collection,
  deleteDoc,
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
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Services } from "./firebase.js";

export type PageEntry = PageDoc & { id: string };
export type ReleaseEntry = ReleaseDoc & { id: string };
export type MediaEntry = MediaDoc & { id: string };

const now = () => new Date().toISOString();
export const EMPTY_PAGE_DATA: Data = { root: { props: {} }, content: [] };

export function subscribePages(
  db: Firestore,
  onData: (pages: PageEntry[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    collection(db, COLLECTIONS.pages),
    (snap) => {
      const pages = snap.docs.map((d) => ({ id: d.id, ...(d.data() as PageDoc) }));
      pages.sort((a, b) => (a.slug === "" ? -1 : b.slug === "" ? 1 : a.slug.localeCompare(b.slug)));
      onData(pages);
    },
    onError,
  );
}

export async function getPage(db: Firestore, id: string): Promise<PageEntry | undefined> {
  const snap = await getDoc(doc(db, COLLECTIONS.pages, id));
  return snap.exists() ? { id: snap.id, ...(snap.data() as PageDoc) } : undefined;
}

export async function getAllPages(db: Firestore): Promise<PageEntry[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.pages));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as PageDoc) }));
}

export async function createPage(
  db: Firestore,
  input: Pick<PageDoc, "title" | "slug" | "status" | "seo">,
  by?: string,
  data: Data = EMPTY_PAGE_DATA,
): Promise<string> {
  const base = slugify(input.title) || "page";
  let id = base;
  for (let n = 2; (await getDoc(doc(db, COLLECTIONS.pages, id))).exists(); n++) id = `${base}-${n}`;
  const page: PageDoc = { ...input, data, updatedAt: now(), updatedBy: by };
  await setDoc(doc(db, COLLECTIONS.pages, id), page);
  return id;
}

export async function updatePageMeta(
  db: Firestore,
  id: string,
  meta: Partial<Pick<PageDoc, "title" | "slug" | "status" | "seo">>,
  by?: string,
) {
  await updateDoc(doc(db, COLLECTIONS.pages, id), { ...meta, updatedAt: now(), updatedBy: by });
}

export class PageTooLargeError extends Error {}

export async function savePageData(db: Firestore, id: string, data: Data, by?: string) {
  const size = estimateSize(data);
  if (size > PAGE_SIZE_WARNING_BYTES * 1.25) {
    throw new PageTooLargeError(
      "Cette page est trop volumineuse pour être enregistrée : répartissez son contenu sur plusieurs pages.",
    );
  }
  await updateDoc(doc(db, COLLECTIONS.pages, id), { data, updatedAt: now(), updatedBy: by });
  return size;
}

export async function deletePage(db: Firestore, id: string) {
  await deleteDoc(doc(db, COLLECTIONS.pages, id));
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

export async function saveSettings(
  db: Firestore,
  patch: Partial<Pick<SettingsDoc, "site" | "values">>,
  by?: string,
) {
  await setDoc(
    doc(db, COLLECTIONS.site, DOCS.settings),
    { ...patch, updatedAt: now(), updatedBy: by },
    { merge: true },
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
export const ACCEPTED_VIDEOS = "video/mp4,video/webm";
/** @deprecated use ACCEPTED_IMAGES */
export const ACCEPTED_MEDIA = ACCEPTED_IMAGES;
/** Same limit as the Storage rules (`storage.rules`). */
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

export type MediaKind = "image" | "video";

/** Uploads a file to `openflow/media/` and records it in `of_media`. */
export async function uploadMedia(
  services: Services,
  file: File,
  kind: MediaKind = "image",
): Promise<MediaEntry> {
  if (file.size > MAX_MEDIA_BYTES) throw new Error("Fichier trop lourd (15 Mo maximum).");
  const accepted = kind === "video" ? ACCEPTED_VIDEOS : ACCEPTED_IMAGES;
  if (!accepted.split(",").includes(file.type)) {
    throw new Error(
      kind === "video"
        ? "Format non pris en charge : utilisez une vidéo MP4 ou WebM."
        : "Format non pris en charge : utilisez une image PNG, JPEG, GIF, WebP ou AVIF.",
    );
  }
  const dot = file.name.lastIndexOf(".");
  const name = slugify(dot > 0 ? file.name.slice(0, dot) : file.name) || "image";
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "bin";
  const path = `${STORAGE_PATHS.media}/${Date.now().toString(36)}-${name}.${ext}`;
  const storageRef = ref(services.storage, path);
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
