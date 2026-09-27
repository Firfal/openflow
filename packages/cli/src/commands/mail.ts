import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { GoogleAuth } from "google-auth-library";
import { defaultProject } from "../firebase.js";
import { CliError, log } from "../util.js";
import { missingBindings, withBindings } from "./setup.js";

/**
 * `openflow mail`: the messages of the site's forms are e-mailed to the owner through Resend
 * (https://resend.com, free up to 3,000 e-mails a month). The API key is typed here (never in the
 * code, never in a chat) and stored in Secret Manager (`cms-mail-key`), readable only by the
 * functions. Without it, the owner is warned by the Cloud Monitoring alert of `openflow setup`.
 */

export const MAIL_SECRET = "cms-mail-key";

export interface MailOptions {
  project?: string;
  /** Sender, e.g. `Boulangerie <contact@boulangerie.fr>` (a domain verified in Resend). */
  from?: string;
}

async function readKey(): Promise<string> {
  if (!process.stdin.isTTY) {
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    return data.trim();
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Hide what is typed.
  const output = rl as unknown as { _writeToOutput: (text: string) => void };
  const question = "Clé API Resend (re_…) : ";
  process.stdout.write(question);
  output._writeToOutput = () => undefined;
  const key = await new Promise<string>((resolve) => rl.once("line", resolve));
  rl.close();
  process.stdout.write("\n");
  return key.trim();
}

export async function mail(site: string, options: MailOptions): Promise<void> {
  const projectId = options.project ?? (await defaultProject(site));
  if (!projectId) throw new CliError("Précisez le projet Firebase : --project <id>.");
  const envFile = path.join(site, "functions", `.env.${projectId}`);
  const env = existsSync(envFile) ? await readFile(envFile, "utf8") : "";
  const owners =
    /^CMS_OWNER_EMAIL=(.*)$/m
      .exec(env)?.[1]
      ?.split(",")
      .map((s) => s.trim()) ?? [];

  const key = await readKey();
  if (!/^re_[\w-]{10,}$/.test(key))
    throw new CliError("Clé Resend invalide (elle commence par re_).");

  log.step("Vérification de la clé auprès de Resend");
  if (owners[0]) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: options.from || "Site web <onboarding@resend.dev>",
        to: owners,
        subject: "Les messages de votre site arriveront ici",
        text: "Les messages envoyés avec les formulaires de votre site vous seront transmis à cette adresse. Vous les retrouvez aussi dans l'admin, rubrique Messages.",
      }),
    });
    if (!response.ok) {
      throw new CliError(
        `Resend refuse l'envoi (${response.status}) : ${(await response.text()).slice(0, 300)}`,
      );
    }
    log.ok(`E-mail de test envoyé à ${owners.join(", ")}`);
  }

  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const secrets = `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets`;
  const exists = await client.request({ url: `${secrets}/${MAIL_SECRET}` }).then(
    () => true,
    (error: { response?: { status?: number } }) => {
      if (error.response?.status === 404) return false;
      throw error;
    },
  );
  if (!exists) {
    await client.request({
      url: `${secrets}?secretId=${MAIL_SECRET}`,
      method: "POST",
      data: { replication: { automatic: {} }, labels: { cms: "mail" } },
    });
  }
  await client.request({
    url: `${secrets}/${MAIL_SECRET}:addVersion`,
    method: "POST",
    data: { payload: { data: Buffer.from(key).toString("base64") } },
  });
  log.ok("Clé enregistrée dans Secret Manager (cms-mail-key)");

  // Only the functions' account can read it.
  const project = (
    await client.request<{ projectNumber: string }>({
      url: `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
    })
  ).data;
  const runtime = `serviceAccount:${project.projectNumber}-compute@developer.gserviceaccount.com`;
  const policy = (
    await client.request<{ bindings?: Array<{ role: string; members: string[] }>; etag?: string }>({
      url: `${secrets}/${MAIL_SECRET}:getIamPolicy`,
    })
  ).data;
  const missing = missingBindings(policy.bindings ?? [], [
    { member: runtime, roles: ["roles/secretmanager.secretAccessor"] },
  ]);
  if (missing.length > 0) {
    await client.request({
      url: `${secrets}/${MAIL_SECRET}:setIamPolicy`,
      method: "POST",
      data: { policy: { ...policy, bindings: withBindings(policy.bindings ?? [], missing) } },
    });
  }
  log.ok("Les fonctions peuvent lire la clé");

  if (options.from) {
    const lines = env.split("\n").filter((line) => line && !line.startsWith("CMS_MAIL_FROM="));
    lines.push(`CMS_MAIL_FROM=${options.from}`);
    await writeFile(envFile, `${lines.join("\n")}\n`);
    log.ok(`Expéditeur : ${options.from} (relancez openflow deploy pour l'appliquer)`);
  }
  log.info(
    "\nLes nouveaux messages seront envoyés par e-mail au propriétaire (au plus tard 10 minutes après ce changement).",
  );
}
