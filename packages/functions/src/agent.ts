import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  AGENT_AUTHOR,
  type AgentBackend,
  AgentError,
  type AgentMedia,
  type AgentPage,
  type AgentRelease,
  type AgentTokenDoc,
  COLLECTIONS,
  configFromSchema,
  DOCS,
  type MediaDoc,
  type PageDoc,
  type ReleaseDoc,
  type SettingsDoc,
  type SiteSchema,
  STORAGE_PATHS,
} from "@openflow/core";
import { imageDimensions } from "@openflow/core/node";
import type { Firestore } from "firebase-admin/firestore";

/** Prefix of OpenFlow assistant keys (recognisable in logs and secret scanners). */
export const AGENT_TOKEN_PREFIX = "ofk_";

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates an access key for an AI assistant: only its hash is stored, the key is shown once. */
export async function createAgentToken(
  db: Firestore,
  input: { label: string; by: string },
): Promise<{ id: string; token: string }> {
  const token = `${AGENT_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const ref = db.collection(COLLECTIONS.agentTokens).doc();
  const doc: AgentTokenDoc = {
    label: input.label.trim().slice(0, 80) || "Assistant IA",
    hash: hashAgentToken(token),
    prefix: token.slice(0, AGENT_TOKEN_PREFIX.length + 6),
    createdAt: new Date().toISOString(),
    createdBy: input.by,
  };
  await ref.set(doc);
  return { id: ref.id, token };
}

/** Finds the key presented by a client (`Authorization: Bearer …` or `?key=…`). */
export async function verifyAgentToken(
  db: Firestore,
  token: string | undefined,
): Promise<{ id: string; doc: AgentTokenDoc } | undefined> {
  if (!token?.startsWith(AGENT_TOKEN_PREFIX) || token.length > 200) return undefined;
  const snap = await db
    .collection(COLLECTIONS.agentTokens)
    .where("hash", "==", hashAgentToken(token))
    .limit(1)
    .get();
  const found = snap.docs[0];
  if (!found) return undefined;
  const doc = found.data() as AgentTokenDoc;
  // Last use, at most once per hour (shown in the admin).
  const last = doc.lastUsedAt ? Date.parse(doc.lastUsedAt) : 0;
  if (Date.now() - last > 3_600_000) {
    await found.ref.update({ lastUsedAt: new Date().toISOString() }).catch(() => undefined);
  }
  return { id: found.id, doc };
}

/** The key sent by an MCP client. */
export function tokenFromRequest(headers: Record<string, unknown>, query: Record<string, unknown>) {
  const authorization = String(headers.authorization ?? "");
  const bearer = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  const key = typeof query.key === "string" ? query.key : undefined;
  return bearer ?? key;
}

let schemaCache: { at: number; schema: SiteSchema } | undefined;

/** Site schema written by `openflow deploy` / `openflow seed` (cached one minute). */
export async function loadSiteSchema(db: Firestore): Promise<SiteSchema | undefined> {
  if (schemaCache && Date.now() - schemaCache.at < 60_000) return schemaCache.schema;
  const schema = (await db.collection(COLLECTIONS.system).doc(DOCS.schema).get()).data() as
    | SiteSchema
    | undefined;
  if (schema) schemaCache = { at: Date.now(), schema };
  return schema;
}

export function agentConfig(schema: SiteSchema) {
  return configFromSchema(schema);
}

const MEDIA_TYPES = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm))$/;
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    return (
      a === "::1" ||
      a.startsWith("fc") ||
      a.startsWith("fd") ||
      a.startsWith("fe80") ||
      a.startsWith("::ffff:127.") ||
      a === "::"
    );
  }
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Downloads a public media file for the library, refusing private hosts and large files. */
export async function downloadMedia(
  url: string,
): Promise<{ bytes: Buffer; contentType: string; name: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new AgentError("Seules les adresses https sont acceptées.");
  const { address } = await lookup(parsed.hostname);
  if (privateAddress(address)) throw new AgentError("Adresse refusée (réseau privé).");
  const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new AgentError(`Téléchargement impossible (HTTP ${response.status}).`);
  const contentType =
    (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!MEDIA_TYPES.test(contentType)) {
    throw new AgentError(
      `Type de fichier refusé (${contentType || "inconnu"}) : PNG, JPEG, GIF, WebP, AVIF, MP4 ou WebM.`,
    );
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_MEDIA_BYTES) throw new AgentError("Fichier trop lourd (15 Mo au plus).");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_MEDIA_BYTES) throw new AgentError("Fichier trop lourd (15 Mo au plus).");
  const name = decodeURIComponent(parsed.pathname.split("/").pop() || "media")
    .replace(/[^\w.-]+/g, "-")
    .slice(-80);
  return { bytes, contentType, name };
}

export interface AdminBackendOptions {
  db: Firestore;
  /** Cloud Storage bucket (Admin SDK). */
  bucket: {
    name: string;
    file(path: string): { save(data: Buffer, options: object): Promise<unknown> };
  };
  /** Public base URL of Storage files (the emulator in local runs). */
  storageBaseUrl: string;
  publish: () => Promise<{ releaseId: string }>;
}

function mediaUrl(base: string, bucket: string, path: string, token: string): string {
  return `${base}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** {@link AgentBackend} on Firestore and Cloud Storage with the Admin SDK (MCP server). */
export function adminBackend({
  db,
  bucket,
  storageBaseUrl,
  publish,
}: AdminBackendOptions): AgentBackend {
  const pages = db.collection(COLLECTIONS.pages);
  const settingsRef = db.collection(COLLECTIONS.site).doc(DOCS.settings);
  const stamp = () => ({ updatedAt: new Date().toISOString(), updatedBy: AGENT_AUTHOR });
  const toPage = (id: string, doc: PageDoc): AgentPage => ({
    id,
    slug: doc.slug,
    title: doc.title,
    status: doc.status,
    seo: doc.seo ?? {},
    data: doc.data,
    updatedAt: doc.updatedAt,
  });
  return {
    async listPages() {
      const snap = await pages.get();
      return snap.docs.map((d) => toPage(d.id, d.data() as PageDoc));
    },
    async getPage(id) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return undefined;
      const snap = await pages.doc(id).get();
      return snap.exists ? toPage(snap.id, snap.data() as PageDoc) : undefined;
    },
    async savePageData(id, data) {
      await pages.doc(id).update({ data: JSON.parse(JSON.stringify(data)), ...stamp() });
    },
    async savePageMeta(id, meta) {
      await pages.doc(id).update({ ...JSON.parse(JSON.stringify(meta)), ...stamp() });
    },
    async createPage(id, page) {
      await pages.doc(id).create({ ...JSON.parse(JSON.stringify(page)), ...stamp() });
      return id;
    },
    async deletePage(id) {
      await pages.doc(id).delete();
    },
    async getSettings() {
      const doc = ((await settingsRef.get()).data() ?? {}) as Partial<SettingsDoc>;
      return {
        site: doc.site ?? { name: "Site", lang: "fr" },
        values: doc.values ?? {},
        theme: doc.theme ?? {},
      };
    },
    async saveSettingsValues(values) {
      await settingsRef.set(
        { values: JSON.parse(JSON.stringify(values)), ...stamp() },
        { merge: true },
      );
    },
    async saveTheme(theme) {
      await settingsRef.set(
        { theme, ...stamp() },
        { mergeFields: ["theme", "updatedAt", "updatedBy"] },
      );
    },
    async listMedia() {
      const snap = await db
        .collection(COLLECTIONS.media)
        .orderBy("createdAt", "desc")
        .limit(300)
        .get();
      return snap.docs.map((d) => {
        const m = d.data() as MediaDoc;
        return {
          id: d.id,
          url: m.url,
          name: m.name,
          contentType: m.contentType,
          alt: m.alt,
          width: m.width,
          height: m.height,
          source: m.source,
        } satisfies AgentMedia;
      });
    },
    async importMedia(url, alt) {
      const { bytes, contentType, name } = await downloadMedia(url);
      const path = `${STORAGE_PATHS.media}/${Date.now()}-${name}`;
      const token = randomUUID();
      await bucket.file(path).save(bytes, {
        contentType,
        resumable: false,
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });
      const ext = contentType.split("/")[1] ?? "";
      const doc: MediaDoc = {
        path,
        url: mediaUrl(storageBaseUrl, bucket.name, path, token),
        name,
        contentType,
        size: bytes.length,
        ...(contentType.startsWith("image/")
          ? imageDimensions(bytes, ext === "jpeg" ? "jpg" : ext)
          : {}),
        ...(alt ? { alt } : {}),
        source: "storage",
        createdAt: new Date().toISOString(),
      };
      const ref = await db.collection(COLLECTIONS.media).add(JSON.parse(JSON.stringify(doc)));
      return { id: ref.id, ...doc };
    },
    publish,
    async listReleases(max) {
      const snap = await db
        .collection(COLLECTIONS.releases)
        .orderBy("createdAt", "desc")
        .limit(max)
        .get();
      return snap.docs.map((d) => {
        const r = d.data() as ReleaseDoc;
        return {
          id: d.id,
          status: r.status,
          createdAt: r.createdAt,
          finishedAt: r.finishedAt,
          error: r.error,
          pageCount: r.pageCount,
        } satisfies AgentRelease;
      });
    },
  };
}
