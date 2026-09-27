import { createHash } from "node:crypto";
import {
  COLLECTIONS,
  FORM_FIELDS_PROP,
  FORM_SUBMISSION_LOG,
  type FormFieldDef,
  type MessageDoc,
  type Snapshot,
  slugToPath,
  validateSubmission,
  walkComponents,
} from "@openflow/core";
import type { Firestore } from "firebase-admin/firestore";

/**
 * Forms of the published site (`POST /forms/submit`, Hosting rewrite to `cmsSubmitForm`).
 * A message is accepted only if it matches a form of the page as it is published, and passes the
 * spam defences: hidden field (honeypot), minimum filling time, a limit per visitor, and the
 * reCAPTCHA score when `openflow setup` created a key. Accepted messages go to `cms_messages`.
 */

export const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
/** A human needs a few seconds to fill a form; bots post at once. */
export const MIN_FILL_MS = 2500;
/** reCAPTCHA score (0 to 1) below which a message is kept apart as spam. */
export const SPAM_SCORE = 0.5;
export const MAX_BODY_BYTES = 32 * 1024;

export interface SubmitBody {
  formId?: unknown;
  page?: unknown;
  values?: unknown;
  /** Honeypot: hidden from people, filled by bots. */
  website?: unknown;
  /** Milliseconds between the display of the form and its sending. */
  elapsed?: unknown;
  token?: unknown;
  /** The form was sent by the visitor's AI assistant (WebMCP `SubmitEvent.agentInvoked`). */
  agent?: unknown;
}

export interface SubmitDeps {
  db: Firestore;
  /** The site as published (live release). */
  liveSnapshot(): Promise<Snapshot | undefined>;
  /** reCAPTCHA score of a token, `undefined` when it cannot be checked. */
  recaptchaScore?(token: string, siteKey: string): Promise<number | undefined>;
  /** Sends the message to the owner; `false` when no e-mail service is configured. */
  notify?(message: MessageDoc): Promise<boolean>;
  log?(message: string, data: Record<string, unknown>): void;
  salt: string;
}

export interface SubmitResult {
  status: number;
  body: { ok: boolean; error?: string; errors?: Record<string, string> };
}

/** The form definition in the published page (a section whose `formFields` is the form). */
export function findForm(
  snapshot: Snapshot,
  page: string,
  formId: string,
): { definition: FormFieldDef[]; title: string; page: string } | undefined {
  const target = page.endsWith("/") ? page : `${page}/`;
  const found = snapshot.pages.find((p) => slugToPath(p.slug) === target);
  if (!found) return undefined;
  let form: { definition: FormFieldDef[]; title: string; page: string } | undefined;
  walkComponents(found.data, (item) => {
    const props = item.props as Record<string, unknown>;
    if (form || props.id !== formId || !Array.isArray(props[FORM_FIELDS_PROP])) return;
    form = {
      definition: props[FORM_FIELDS_PROP] as FormFieldDef[],
      title: typeof props.title === "string" && props.title ? props.title : found.title,
      page: slugToPath(found.slug),
    };
  });
  return form;
}

/** Counts a submission of a visitor; `false` beyond the limit. */
export async function withinRateLimit(
  db: Firestore,
  visitor: string,
  now = Date.now(),
): Promise<boolean> {
  const ref = db.collection(COLLECTIONS.rateLimits).doc(visitor);
  return db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as { start: number; count: number } | undefined;
    if (!current || now - current.start > RATE_LIMIT.windowMs) {
      tx.set(ref, { start: now, count: 1, expiresAt: new Date(now + RATE_LIMIT.windowMs) });
      return true;
    }
    if (current.count >= RATE_LIMIT.max) return false;
    tx.update(ref, { count: current.count + 1 });
    return true;
  });
}

/** Handles one submission (transport-agnostic: the function passes the parsed body and IP). */
export async function handleSubmission(
  body: SubmitBody,
  ip: string,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  const formId = typeof body.formId === "string" ? body.formId.slice(0, 200) : "";
  const page = typeof body.page === "string" ? body.page.slice(0, 500) : "";
  const values =
    body.values && typeof body.values === "object" && !Array.isArray(body.values)
      ? (body.values as Record<string, unknown>)
      : undefined;
  if (!formId || !page.startsWith("/") || !values) {
    return { status: 400, body: { ok: false, error: "Formulaire invalide." } };
  }
  // Bots: answered as a success, so they learn nothing, and dropped.
  const elapsed = Number(body.elapsed);
  if ((typeof body.website === "string" && body.website) || !(elapsed >= MIN_FILL_MS)) {
    deps.log?.("OpenFlow form dropped (bot)", { formId, page });
    return { status: 200, body: { ok: true } };
  }
  const visitor = createHash("sha256").update(`${deps.salt}:${ip}`).digest("hex").slice(0, 40);
  if (!(await withinRateLimit(deps.db, visitor))) {
    return {
      status: 429,
      body: { ok: false, error: "Trop d'envois : réessayez dans quelques minutes." },
    };
  }
  const snapshot = await deps.liveSnapshot();
  const form = snapshot ? findForm(snapshot, page, formId) : undefined;
  if (!snapshot || !form) {
    return {
      status: 404,
      body: { ok: false, error: "Ce formulaire n'existe plus : rechargez la page." },
    };
  }
  const result = validateSubmission(form.definition, values);
  if (!result.ok) {
    return {
      status: 400,
      body: { ok: false, error: "Vérifiez les champs signalés.", errors: result.errors },
    };
  }
  const siteKey = snapshot.integrations?.recaptchaSiteKey;
  let score: number | undefined;
  if (siteKey && deps.recaptchaScore) {
    score =
      typeof body.token === "string" && body.token
        ? await deps.recaptchaScore(body.token, siteKey)
        : 0;
  }
  const spam = score !== undefined && score < SPAM_SCORE;
  const message: MessageDoc = {
    formId,
    page: form.page,
    formTitle: form.title,
    fields: result.submission.fields,
    ...(result.submission.email ? { email: result.submission.email } : {}),
    createdAt: new Date().toISOString(),
    read: false,
    ...(spam ? { spam: true } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(body.agent === true ? { agent: true } : {}),
  };
  await deps.db.collection(COLLECTIONS.messages).add(message);
  if (!spam) {
    const mailed = await deps.notify?.(message).catch(() => false);
    // Without an e-mail service, the Cloud Monitoring alert of `openflow setup` warns the owner.
    if (!mailed) deps.log?.(FORM_SUBMISSION_LOG, { formId, page: form.page });
  }
  return { status: 200, body: { ok: true } };
}

/** Plain-text and HTML e-mail sent to the owner for a new message. */
export function messageEmail(message: MessageDoc, adminUrl: string) {
  const lines = message.fields.map((field) => `${field.label} : ${field.value}`);
  const escapeHtml = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  return {
    subject: `Nouveau message : ${message.formTitle}`.slice(0, 150),
    text: `${lines.join("\n")}\n\nPage : ${message.page}\nTous les messages : ${adminUrl}?view=messages\n`,
    html: `<div style="font:15px/1.5 system-ui,sans-serif;color:#18181b">${message.fields
      .map(
        (field) =>
          `<p style="margin:0 0 12px"><strong>${escapeHtml(field.label)}</strong><br>${escapeHtml(field.value).replace(/\n/g, "<br>")}</p>`,
      )
      .join(
        "",
      )}<p style="margin:24px 0 0;color:#6b6b74">Page ${escapeHtml(message.page)} · <a href="${escapeHtml(`${adminUrl}?view=messages`)}">Tous les messages</a></p></div>`,
  };
}
