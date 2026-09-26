import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { COLLECTIONS, DOCS, FORM_SUBMISSION_LOG, PUBLICATION_FAILED_LOG } from "@openflow/core";
import { GoogleAuth } from "google-auth-library";
import { defaultProject } from "../firebase.js";
import { CliError, log } from "../util.js";

/**
 * `openflow setup`: prepares a Firebase project for OpenFlow, once, and again whenever needed (every
 * step checks first and only adds what is missing; nothing is ever removed):
 * Blaze plan, Google APIs, Firestore and Storage, the service account of the builds and the roles of
 * the builds and of the functions, sign-in by e-mail link, daily Firestore backups, and an e-mail
 * alert when a publication fails. `openflow deploy` runs it first.
 */

/** Google APIs used by OpenFlow (functions, builds, hosting, auth, backups, alerts, reCAPTCHA). */
export const REQUIRED_SERVICES = [
  "cloudresourcemanager",
  "serviceusage",
  "iam",
  "iamcredentials",
  "cloudbilling",
  "firebase",
  "firebasehosting",
  "firebaserules",
  "firebasestorage",
  "storage",
  "firestore",
  "identitytoolkit",
  "cloudfunctions",
  "run",
  "cloudbuild",
  "artifactregistry",
  "eventarc",
  "pubsub",
  "logging",
  "monitoring",
  "secretmanager",
  "recaptchaenterprise",
].map((name) => `${name}.googleapis.com`);

/** Roles of the service account that rebuilds the site at each « Publier ». */
export const BUILDER_ROLES = [
  "roles/firebasehosting.admin",
  "roles/firebase.viewer",
  "roles/serviceusage.serviceUsageConsumer",
  "roles/storage.objectViewer",
  "roles/logging.logWriter",
];

/** Roles of the functions' runtime account (Compute default): start builds, restore versions. */
export const RUNTIME_ROLES = [
  "roles/cloudbuild.builds.editor",
  "roles/firebasehosting.admin",
  "roles/recaptchaenterprise.agent",
];

export const BUILDER_ACCOUNT_ID = "openflow-builder";

interface Binding {
  role: string;
  members: string[];
}

/** Bindings to add so that each member has its roles (existing bindings are kept as they are). */
export function missingBindings(
  bindings: Binding[],
  wanted: Array<{ member: string; roles: string[] }>,
): Array<{ role: string; member: string }> {
  const missing: Array<{ role: string; member: string }> = [];
  for (const { member, roles } of wanted) {
    for (const role of roles) {
      if (!bindings.some((b) => b.role === role && b.members.includes(member))) {
        missing.push({ role, member });
      }
    }
  }
  return missing;
}

/** The policy with the missing bindings added (a new object; members are never removed). */
export function withBindings(
  bindings: Binding[],
  missing: Array<{ role: string; member: string }>,
): Binding[] {
  const next = bindings.map((b) => ({ ...b, members: [...b.members] }));
  for (const { role, member } of missing) {
    const existing = next.find((b) => b.role === role && !("condition" in b));
    if (existing) existing.members.push(member);
    else next.push({ role, members: [member] });
  }
  return next;
}

/** Firestore location for a functions region (same region, or its multi-region). */
export function firestoreLocation(region: string): string {
  return region;
}

export interface SetupOptions {
  project?: string;
  /** Region of the functions (`OPENFLOW_REGION`, `europe-west1` by default). */
  region?: string;
  /** Who receives the alert when a publication fails (the owner's e-mail by default). */
  alertEmail?: string;
  /** Prints what would change, changes nothing. */
  dryRun?: boolean;
  /** Extra domains of the site (custom domain), allowed for reCAPTCHA. */
  domains?: string[];
}

type Client = Awaited<ReturnType<GoogleAuth["getClient"]>>;

interface ApiError {
  response?: { status?: number; data?: { error?: { message?: string } } };
  message?: string;
}

const errorText = (error: unknown) =>
  (error as ApiError).response?.data?.error?.message ?? (error as Error).message;
const status = (error: unknown) => (error as ApiError).response?.status;

async function get<T>(client: Client, url: string): Promise<T | undefined> {
  try {
    return (await client.request<T>({ url })).data;
  } catch (error) {
    if (status(error) === 404) return undefined;
    throw error;
  }
}

async function send<T>(client: Client, url: string, method: string, data?: unknown): Promise<T> {
  return (await client.request<T>({ url, method: method as "POST", data })).data;
}

/** Waits for a long-running operation (`name`) of `api` to finish. */
async function waitFor(client: Client, api: string, operation: { name?: string; done?: boolean }) {
  let current = operation;
  for (let attempt = 0; current.name && !current.done && attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    current = await send<typeof current>(client, `${api}/${current.name}`, "GET");
  }
  const failure = (current as { error?: { message?: string } }).error;
  if (failure) throw new Error(failure.message ?? "opération en échec");
}

async function readEnv(file: string): Promise<Record<string, string>> {
  if (!existsSync(file)) return {};
  const values: Record<string, string> = {};
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const at = line.indexOf("=");
    if (at > 0 && !line.startsWith("#"))
      values[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return values;
}

async function setEnv(file: string, key: string, value: string): Promise<void> {
  const existing = existsSync(file) ? await readFile(file, "utf8") : "";
  const lines = existing.split("\n").filter((line) => line && !line.startsWith(`${key}=`));
  lines.push(`${key}=${value}`);
  await writeFile(file, `${lines.join("\n")}\n`);
}

export async function setup(site: string, options: SetupOptions): Promise<void> {
  const projectId = options.project ?? (await defaultProject(site));
  if (!projectId)
    throw new CliError("Précisez le projet Firebase : --project <id> (ou .firebaserc).");
  const envFile = path.join(site, "functions", `.env.${projectId}`);
  const env = {
    ...(await readEnv(path.join(site, "functions", ".env"))),
    ...(await readEnv(envFile)),
  };
  const region = options.region ?? env.OPENFLOW_REGION ?? "europe-west1";
  const owners = (env.OPENFLOW_OWNER_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const alertEmail = options.alertEmail ?? env.OPENFLOW_ALERT_EMAIL ?? owners[0];
  const dry = Boolean(options.dryRun);
  const act = async (label: string, change: () => Promise<unknown>) => {
    if (dry) {
      log.info(`  → à faire : ${label}`);
      return;
    }
    await change();
    log.ok(label);
  };
  const manual: string[] = [];

  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  let client: Client;
  try {
    client = await auth.getClient();
  } catch (error) {
    throw new CliError(
      `Identifiants Google introuvables (${errorText(error)}) : lancez \`gcloud auth application-default login\`.`,
    );
  }
  log.step(
    `Préparation du projet Firebase ${projectId}${dry ? " (simulation, rien n'est modifié)" : ""}`,
  );

  // Project and Blaze plan.
  const project = await get<{ projectNumber: string }>(
    client,
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
  ).catch((error) => {
    throw new CliError(`Projet ${projectId} inaccessible : ${errorText(error)}`);
  });
  if (!project) throw new CliError(`Projet ${projectId} introuvable.`);
  const billing = await get<{ billingEnabled?: boolean }>(
    client,
    `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`,
  ).catch(() => undefined);
  if (billing && !billing.billingEnabled) {
    throw new CliError(
      `Le projet ${projectId} n'est pas au forfait Blaze (paiement à l'usage), nécessaire pour Cloud Functions et Cloud Build : https://console.firebase.google.com/project/${projectId}/usage/details`,
    );
  }
  log.ok(billing ? "Forfait Blaze actif" : "Forfait : vérification impossible, on continue");

  // Google APIs.
  const enabled = new Set<string>();
  let pageToken = "";
  do {
    const page = await send<{
      services?: Array<{ config: { name: string } }>;
      nextPageToken?: string;
    }>(
      client,
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services?filter=state:ENABLED&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`,
      "GET",
    );
    for (const service of page.services ?? []) enabled.add(service.config.name);
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  const toEnable = REQUIRED_SERVICES.filter((service) => !enabled.has(service));
  if (toEnable.length === 0) log.ok("API Google activées");
  else {
    await act(
      `API activées : ${toEnable.map((s) => s.replace(".googleapis.com", "")).join(", ")}`,
      async () => {
        const operation = await send<{ name?: string; done?: boolean }>(
          client,
          `https://serviceusage.googleapis.com/v1/projects/${projectId}/services:batchEnable`,
          "POST",
          { serviceIds: toEnable },
        );
        await waitFor(client, "https://serviceusage.googleapis.com/v1", operation);
      },
    );
  }

  // Firestore and Storage.
  const firestoreApi = `https://firestore.googleapis.com/v1/projects/${projectId}/databases`;
  if (await get(client, `${firestoreApi}/(default)`)) log.ok("Base Firestore présente");
  else {
    await act(`Base Firestore créée (${firestoreLocation(region)})`, async () => {
      const operation = await send<{ name?: string; done?: boolean }>(
        client,
        `${firestoreApi}?databaseId=(default)`,
        "POST",
        { locationId: firestoreLocation(region), type: "FIRESTORE_NATIVE" },
      );
      await waitFor(client, "https://firestore.googleapis.com/v1", operation);
    });
  }
  const storageApi = `https://firebasestorage.googleapis.com/v1beta/projects/${projectId}/defaultBucket`;
  const bucket = await get<{ bucket?: { name?: string } }>(client, storageApi).catch(
    () => undefined,
  );
  if (bucket?.bucket?.name) log.ok("Stockage (Cloud Storage) présent");
  else {
    await act(`Stockage créé (${region})`, () =>
      send(client, storageApi, "POST", { location: region }),
    );
  }

  // Service account of the builds, and the roles.
  const builder = `${BUILDER_ACCOUNT_ID}@${projectId}.iam.gserviceaccount.com`;
  const iamApi = `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`;
  if (await get(client, `${iamApi}/${builder}`))
    log.ok(`Compte de service des builds : ${builder}`);
  else {
    await act(`Compte de service des builds créé : ${builder}`, () =>
      send(client, iamApi, "POST", {
        accountId: BUILDER_ACCOUNT_ID,
        serviceAccount: {
          displayName: "OpenFlow builder",
          description: "Reconstruit le site à chaque publication (Cloud Build).",
        },
      }),
    );
  }
  const runtime = `${project.projectNumber}-compute@developer.gserviceaccount.com`;
  const policyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`;
  const policy = await send<{ bindings?: Binding[]; etag?: string; version?: number }>(
    client,
    `${policyUrl}:getIamPolicy`,
    "POST",
    { options: { requestedPolicyVersion: 3 } },
  );
  const missing = missingBindings(policy.bindings ?? [], [
    { member: `serviceAccount:${builder}`, roles: BUILDER_ROLES },
    { member: `serviceAccount:${runtime}`, roles: RUNTIME_ROLES },
  ]);
  if (missing.length === 0) log.ok("Rôles des builds et des fonctions en place");
  else {
    await act(
      `Rôles ajoutés : ${missing.map((m) => `${m.role.replace("roles/", "")} (${m.member.includes("compute@") ? "fonctions" : "builds"})`).join(", ")}`,
      () =>
        send(client, `${policyUrl}:setIamPolicy`, "POST", {
          policy: { ...policy, bindings: withBindings(policy.bindings ?? [], missing) },
        }),
    );
  }
  // The functions start builds as the builder account.
  const actAsUrl = `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${builder}`;
  const accountPolicy = dry
    ? undefined
    : await send<{ bindings?: Binding[]; etag?: string }>(
        client,
        `${actAsUrl}:getIamPolicy`,
        "POST",
      ).catch(() => undefined);
  const actAs = missingBindings(accountPolicy?.bindings ?? [], [
    { member: `serviceAccount:${runtime}`, roles: ["roles/iam.serviceAccountUser"] },
  ]);
  if (accountPolicy && actAs.length === 0) log.ok("Les fonctions peuvent lancer les builds");
  else {
    await act("Les fonctions peuvent lancer les builds (serviceAccountUser)", () =>
      send(client, `${actAsUrl}:setIamPolicy`, "POST", {
        policy: { ...accountPolicy, bindings: withBindings(accountPolicy?.bindings ?? [], actAs) },
      }),
    );
  }
  if (env.OPENFLOW_BUILD_SERVICE_ACCOUNT === builder) log.ok(`functions/.env.${projectId} à jour`);
  else {
    await act(`functions/.env.${projectId} : OPENFLOW_BUILD_SERVICE_ACCOUNT`, () =>
      setEnv(envFile, "OPENFLOW_BUILD_SERVICE_ACCOUNT", builder),
    );
  }

  // Sign-in of the owner: e-mail link (Google needs an OAuth client: console only).
  const authApi = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}`;
  const authConfig = await get<{
    signIn?: { email?: { enabled?: boolean; passwordRequired?: boolean } };
  }>(client, `${authApi}/config`).catch(() => undefined);
  const email = authConfig?.signIn?.email;
  if (email?.enabled && email.passwordRequired === false)
    log.ok("Connexion par lien e-mail activée");
  else if (!authConfig) {
    manual.push(
      `Authentication n'est pas encore activé : https://console.firebase.google.com/project/${projectId}/authentication, « Commencer », puis relancez openflow setup.`,
    );
  } else {
    await act("Connexion par lien e-mail activée", () =>
      send(
        client,
        `${authApi}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`,
        "PATCH",
        { signIn: { email: { enabled: true, passwordRequired: false } } },
      ),
    );
  }
  const google = await get<{ enabled?: boolean }>(
    client,
    `${authApi}/defaultSupportedIdpConfigs/google.com`,
  ).catch(() => undefined);
  if (google?.enabled) log.ok("Connexion Google activée");
  else {
    manual.push(
      `Connexion Google (facultative, un clic) : https://console.firebase.google.com/project/${projectId}/authentication/providers, « Google », « Activer ».`,
    );
  }

  // Daily Firestore backups, kept 7 days.
  const schedules = await get<{ backupSchedules?: Array<{ dailyRecurrence?: object }> }>(
    client,
    `${firestoreApi}/(default)/backupSchedules`,
  ).catch(() => undefined);
  if (schedules?.backupSchedules?.some((s) => s.dailyRecurrence))
    log.ok("Sauvegarde quotidienne de Firestore");
  else {
    await act("Sauvegarde quotidienne de Firestore (conservée 7 jours)", () =>
      send(client, `${firestoreApi}/(default)/backupSchedules`, "POST", {
        retention: `${7 * 24 * 3600}s`,
        dailyRecurrence: {},
      }),
    );
  }

  // E-mail alert when a publication fails.
  if (!alertEmail) {
    manual.push("Alerte en cas d'échec de publication : précisez --alert-email ou --owner.");
  } else {
    const monitoring = `https://monitoring.googleapis.com/v3/projects/${projectId}`;
    const channels = await send<{
      notificationChannels?: Array<{ name: string; labels?: { email_address?: string } }>;
    }>(
      client,
      `${monitoring}/notificationChannels?filter=${encodeURIComponent('type="email"')}`,
      "GET",
    );
    let channel = channels.notificationChannels?.find(
      (c) => c.labels?.email_address === alertEmail,
    )?.name;
    const policies = await send<{ alertPolicies?: Array<{ displayName?: string }> }>(
      client,
      `${monitoring}/alertPolicies`,
      "GET",
    );
    const displayName = "OpenFlow : publication en échec";
    const messageAlert = "OpenFlow : nouveau message";
    const hasPolicy = (name: string) => policies.alertPolicies?.some((p) => p.displayName === name);
    if (channel && hasPolicy(displayName) && hasPolicy(messageAlert)) {
      log.ok(`Alertes par e-mail : publication en échec, nouveau message (${alertEmail})`);
    } else {
      await act(
        `Alertes par e-mail : publication en échec, nouveau message (${alertEmail})`,
        async () => {
          if (!channel) {
            channel = (
              await send<{ name: string }>(client, `${monitoring}/notificationChannels`, "POST", {
                type: "email",
                displayName: `OpenFlow · ${alertEmail}`,
                labels: { email_address: alertEmail },
              })
            ).name;
          }
          if (!policies.alertPolicies?.some((p) => p.displayName === displayName)) {
            await send(client, `${monitoring}/alertPolicies`, "POST", {
              displayName,
              combiner: "OR",
              documentation: {
                mimeType: "text/markdown",
                content:
                  "Une publication du site a échoué. Ouvrez l'admin, rubrique Historique, pour le détail et le journal du build ; le site en ligne n'a pas changé.",
              },
              conditions: [
                {
                  displayName: "Publication en échec",
                  conditionMatchedLog: {
                    filter: `jsonPayload.message="${PUBLICATION_FAILED_LOG}"`,
                  },
                },
              ],
              alertStrategy: { notificationRateLimit: { period: "3600s" }, autoClose: "86400s" },
              notificationChannels: [channel],
            });
          }
          // A new message, when no e-mail service (openflow mail) sends it directly.
          if (!hasPolicy(messageAlert)) {
            await send(client, `${monitoring}/alertPolicies`, "POST", {
              displayName: messageAlert,
              combiner: "OR",
              documentation: {
                mimeType: "text/markdown",
                content:
                  "Un visiteur vous a écrit avec un formulaire du site. Lisez le message dans l'admin, rubrique Messages.",
              },
              conditions: [
                {
                  displayName: "Nouveau message",
                  conditionMatchedLog: { filter: `jsonPayload.message="${FORM_SUBMISSION_LOG}"` },
                },
              ],
              alertStrategy: { notificationRateLimit: { period: "300s" }, autoClose: "1800s" },
              notificationChannels: [channel],
            });
          }
        },
      );
    }
  }

  // Forms: reCAPTCHA key (invisible, score), shared with the published site.
  const domains = [
    `${projectId}.web.app`,
    `${projectId}.firebaseapp.com`,
    ...(options.domains ?? []),
  ];
  const integrationsUrl = `${firestoreApi}/(default)/documents/${COLLECTIONS.system}/${DOCS.integrations}`;
  const integrations = await get<{ fields?: { recaptchaSiteKey?: { stringValue?: string } } }>(
    client,
    integrationsUrl,
  ).catch(() => undefined);
  const recaptchaApi = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/keys`;
  const existingKey = integrations?.fields?.recaptchaSiteKey?.stringValue;
  if (existingKey) log.ok("Protection anti-spam des formulaires (reCAPTCHA)");
  else {
    await act("Protection anti-spam des formulaires (reCAPTCHA, invisible)", async () => {
      const keys = await send<{ keys?: Array<{ name: string; displayName?: string }> }>(
        client,
        recaptchaApi,
        "GET",
      );
      let name = keys.keys?.find((k) => k.displayName === "OpenFlow")?.name;
      if (!name) {
        name = (
          await send<{ name: string }>(client, recaptchaApi, "POST", {
            displayName: "OpenFlow",
            webSettings: {
              allowedDomains: domains,
              integrationType: "SCORE",
              allowAmpTraffic: false,
            },
          })
        ).name;
      }
      const siteKey = name.split("/").at(-1)!;
      await send(client, `${integrationsUrl}?updateMask.fieldPaths=recaptchaSiteKey`, "PATCH", {
        fields: { recaptchaSiteKey: { stringValue: siteKey } },
      });
    });
  }

  // Counters of the forms' flood limit: removed by Firestore once expired (TTL).
  const ttlUrl = `${firestoreApi}/(default)/collectionGroups/${COLLECTIONS.rateLimits}/fields/expiresAt`;
  const ttl = await get<{ ttlConfig?: { state?: string } }>(client, ttlUrl).catch(() => undefined);
  if (ttl?.ttlConfig) log.ok("Nettoyage automatique des compteurs anti-spam");
  else {
    await act("Nettoyage automatique des compteurs anti-spam (TTL)", () =>
      send(client, `${ttlUrl}?updateMask=ttlConfig`, "PATCH", { ttlConfig: {} }),
    );
  }

  if (manual.length > 0) {
    log.step("À faire dans la console Firebase");
    for (const line of manual) log.warn(line);
  }
}
