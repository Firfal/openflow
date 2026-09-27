import {
  AGENT_AUTHOR,
  AGENT_TOOLS,
  type AgentBackend,
  type AgentContext,
  AgentError,
  type AgentPage,
  type AgentRelease,
  applyDefaults,
  buildSiteSchema,
  COLLECTIONS,
  DOCS,
  FUNCTION_NAMES,
  type OpenFlowConfig,
  type PageDoc,
  type ReleaseDoc,
  runAgentTool,
  type SettingsDoc,
  toolResult,
} from "@openflow/core";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { getEditorBridge } from "./bridge.js";
import {
  deletePage,
  type FullPage,
  getAllPages,
  getPage,
  listMedia,
  saveBusiness,
  savePageData,
  saveSettings,
  saveTheme,
  updatePageMeta,
  uploadMedia,
  writePage,
} from "./data.js";
import { call, errorMessage, type Services } from "./firebase.js";
import { setWebMcpState, webMcp } from "./webmcp.js";

// ---------------------------------------------------------------------------------------------
// Backend on the owner's Firebase session

function toAgentPage(page: FullPage): AgentPage {
  const bridge = getEditorBridge();
  const data = bridge?.pageId === page.id ? bridge.getData() : page.data;
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    status: page.status,
    seo: page.seo ?? {},
    data,
    updatedAt: page.updatedAt,
    ...(page.collection ? { collection: page.collection } : {}),
  };
}

function fileName(url: string): string {
  const last = new URL(url).pathname.split("/").pop() || "media";
  return decodeURIComponent(last)
    .replace(/[^\w.-]+/g, "-")
    .slice(-80);
}

/** {@link AgentBackend} on the owner's Firebase session, for WebMCP. */
export function browserBackend(services: Services, config: OpenFlowConfig): AgentBackend {
  const { db } = services;
  return {
    listPages: async () => (await getAllPages(db)).map(toAgentPage),
    getPage: async (id) => {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return undefined;
      const page = await getPage(db, id);
      return page ? toAgentPage(page) : undefined;
    },
    savePageData: async (id, data, item) => {
      const bridge = getEditorBridge();
      // Open in the editor: through Puck, whose autosave also updates an item's title and summary.
      if (bridge?.pageId === id) bridge.setData(applyDefaults(data, config));
      else await savePageData(db, id, data, AGENT_AUTHOR, item);
    },
    savePageMeta: (id, meta) => updatePageMeta(db, id, meta, AGENT_AUTHOR),
    createPage: async (id, page) => {
      if ((await getDoc(doc(db, COLLECTIONS.pages, id))).exists()) {
        throw new AgentError(`La page « ${id} » existe déjà.`);
      }
      const created: PageDoc = {
        ...page,
        updatedAt: new Date().toISOString(),
        updatedBy: AGENT_AUTHOR,
      };
      await writePage(db, id, JSON.parse(JSON.stringify(created)));
      return id;
    },
    deletePage: (id) => deletePage(db, id),
    getSettings: async () => {
      const settings = ((await getDoc(doc(db, COLLECTIONS.site, DOCS.settings))).data() ??
        {}) as Partial<SettingsDoc>;
      return {
        site: settings.site ?? { name: config.site.name, lang: config.site.lang ?? "fr" },
        values: settings.values ?? {},
        theme: settings.theme ?? {},
      };
    },
    saveSettingsValues: (values) => saveSettings(db, { values }, AGENT_AUTHOR),
    saveTheme: (theme) => saveTheme(db, theme, AGENT_AUTHOR),
    saveBusiness: (business) => saveBusiness(db, business, AGENT_AUTHOR),
    listMedia: async () =>
      (await listMedia(db)).map((m) => ({
        id: m.id,
        url: m.url,
        name: m.name,
        contentType: m.contentType,
        alt: m.alt,
        width: m.width,
        height: m.height,
        source: m.source,
      })),
    importMedia: async (url, alt) => {
      let blob: Blob;
      try {
        const response = await fetch(url, { credentials: "omit" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        blob = await response.blob();
      } catch (error) {
        throw new AgentError(
          `Téléchargement impossible depuis le navigateur (${errorMessage(error)}) : le site d'origine l'interdit peut-être. Enregistrez le fichier puis importez-le dans la médiathèque.`,
        );
      }
      const kind = blob.type.startsWith("video/") ? "video" : "image";
      try {
        const media = await uploadMedia(
          services,
          new File([blob], fileName(url), { type: blob.type }),
          kind,
        );
        if (alt) await setDoc(doc(db, COLLECTIONS.media, media.id), { alt }, { merge: true });
        return { ...media, alt };
      } catch (error) {
        throw new AgentError(errorMessage(error));
      }
    },
    publish: async () => {
      try {
        return await call<Record<string, never>, { releaseId: string }>(
          services,
          FUNCTION_NAMES.publish,
          {},
        );
      } catch (error) {
        throw new AgentError(errorMessage(error));
      }
    },
    listReleases: async (max) => {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.releases), orderBy("createdAt", "desc"), limit(max)),
      );
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

export function browserAgentContext(services: Services, config: OpenFlowConfig): AgentContext {
  return { config, schema: buildSiteSchema(config), backend: browserBackend(services, config) };
}

// ---------------------------------------------------------------------------------------------
// WebMCP: the tools are exposed to the AI assistant of the browser (`document.modelContext`).
// This module is only loaded when the browser supports it (see `webmcp.ts`).

/** Tools whose effect reaches visitors or cannot be undone: the owner confirms in the admin. */
const CONFIRM: Record<string, string> = {
  publish: "L'assistant IA veut mettre le site en ligne avec les dernières modifications.",
  delete_page: "L'assistant IA veut supprimer définitivement une page.",
  remove_section: "L'assistant IA veut supprimer une section de la page.",
};

/**
 * Registers the tools with WebMCP while the owner is signed in to the admin, so the AI assistant of
 * the browser can edit the site by chat, with the owner's own session. Returns the cleanup.
 */
export function registerWebMcp(services: Services, config: OpenFlowConfig): () => void {
  const agentContext = browserAgentContext(services, config);
  const context = () => agentContext;
  const mc = webMcp();
  if (!mc) return () => undefined;
  const controller = new AbortController();
  let registered = 0;
  for (const tool of AGENT_TOOLS) {
    const confirmText = CONFIRM[tool.name];
    const definition = {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: tool.annotations.readOnlyHint === true,
        consequentialHint: Boolean(confirmText),
        untrustedContentHint: false,
      },
      execute: async (input: unknown) => {
        if (confirmText && !window.confirm(`${confirmText}\n\nConfirmer ?`)) {
          return {
            content: [{ type: "text", text: "Action refusée par le propriétaire du site." }],
            isError: true,
          };
        }
        try {
          return toolResult(await runAgentTool(tool.name, input, context()));
        } catch (error) {
          const text =
            error instanceof AgentError ? error.message : `Erreur : ${errorMessage(error)}`;
          return { content: [{ type: "text", text }], isError: true };
        }
      },
    };
    try {
      const result = mc.registerTool(definition, { signal: controller.signal });
      if (result && typeof (result as Promise<unknown>).catch === "function") {
        (result as Promise<unknown>).catch(() => undefined);
      }
      registered++;
    } catch {
      // A tool with the same name is already registered (another admin tab): ignore.
    }
  }
  setWebMcpState({ status: "active", tools: registered });
  return () => {
    // The spec unregisters through the signal; earlier drafts had `unregisterTool`.
    controller.abort();
    if (typeof mc.unregisterTool === "function") {
      for (const tool of AGENT_TOOLS) {
        try {
          mc.unregisterTool(tool.name);
        } catch {
          // already gone
        }
      }
    }
    setWebMcpState({ status: "idle", tools: 0 });
  };
}
