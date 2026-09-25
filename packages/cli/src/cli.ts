#!/usr/bin/env node
import { Command, Option } from "commander";
import { buildSite } from "./commands/build.js";
import { check, hook } from "./commands/check.js";
import { create } from "./commands/create.js";
import { deploy } from "./commands/deploy.js";
import { dev } from "./commands/dev.js";
import { seed, snapshot } from "./commands/seed.js";
import { CliError, cliVersion, log, siteDir } from "./util.js";

const program = new Command();
program
  .name("openflow")
  .description("OpenFlow : sites Next.js éditables par leur propriétaire, 100 % Firebase.")
  .version(await cliVersion());

program
  .command("create")
  .argument("<dossier>", "dossier du nouveau site")
  .description("crée un site Next.js OpenFlow à partir du modèle de départ")
  .option("--name <nom>", "nom du site")
  .option("--project <id>", "projet Firebase par défaut (.firebaserc)")
  .action((dir, options) => create(dir, options));

program
  .command("check")
  .argument("[fichiers...]", "limiter le niveau fast à ces fichiers")
  .description("vérifie la conformité à la norme OpenFlow (OFS)")
  .addOption(
    new Option("--level <niveau>", "fast | render | build")
      .choices(["fast", "render", "build"])
      .default("render"),
  )
  .addOption(
    new Option("--format <format>", "agent | json | sarif")
      .choices(["agent", "json", "sarif"])
      .default("agent"),
  )
  .option("--build", "relance next build avant le niveau build")
  .option("--cwd <dossier>", "dossier du site")
  .action(async (files, options) => {
    process.exitCode = (await check(files, options)) > 0 ? 1 : 0;
  });

program
  .command("validate")
  .description("alias de `check --level render`")
  .option("--cwd <dossier>", "dossier du site")
  .action(async (options) => {
    process.exitCode = (await check([], { level: "render", cwd: options.cwd })) > 0 ? 1 : 0;
  });

program
  .command("hook")
  .argument("<événement>", "post-tool-use | stop")
  .description("point d'entrée des hooks Claude Code (JSON sur stdin)")
  .option("--source <source>", "plugin | project")
  .action(async (event, options) => {
    process.exitCode = await hook(event, options);
  });

program
  .command("dev")
  .description("émulateurs Firebase + contenu initial + next dev (site et admin en local)")
  .option("--port <port>", "port de next dev", "3000")
  .option("--owner <email>", "e-mail du propriétaire pour l'émulateur")
  .action((options) => dev(siteDir(), options));

program
  .command("build")
  .description("export statique (next build) à partir d'un snapshot")
  .option("--snapshot <fichier>", "snapshot à utiliser (par défaut : généré depuis openflow/seed)")
  .option("--report <releaseId>", "met à jour la publication dans Firestore (builder local)")
  .action((options) => buildSite(siteDir(), options));

program
  .command("seed")
  .description("importe openflow/seed dans Firestore sans écraser le contenu existant")
  .option("--project <id>", "projet Firebase")
  .option("--emulator", "cible les émulateurs locaux")
  .option(
    "--force",
    "écrase le contenu existant (attention : efface les modifications du propriétaire)",
  )
  .action((options) => seed(siteDir(), options).then(() => undefined));

program
  .command("snapshot")
  .description("écrit le contenu actuel dans openflow/.snapshot.json")
  .addOption(
    new Option("--from <source>", "seed | firestore")
      .choices(["seed", "firestore"])
      .default("seed"),
  )
  .option("--out <fichier>", "fichier de sortie")
  .option("--project <id>", "projet Firebase")
  .option("--emulator", "lit les émulateurs locaux")
  .action((options) => snapshot(siteDir(), options));

program
  .command("deploy")
  .description(
    "livre le site : contrôle, règles, fonctions, code source, contenu initial, 1re publication",
  )
  .option("--project <id>", "projet Firebase (plan Blaze)")
  .option("--owner <email>", "e-mail du propriétaire du site")
  .option("--bucket <nom>", "bucket Cloud Storage (par défaut <projet>.firebasestorage.app)")
  .option("--force", "déploie malgré des erreurs de conformité")
  .option("--no-publish", "ne lance pas de publication")
  .action((options) => deploy(siteDir(), { ...options, noPublish: options.publish === false }));

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CliError) {
    log.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
