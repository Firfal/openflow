import { FUNCTION_NAMES, validatePageData, validateSettingsValues } from "@openflow/core";
import { useEffect, useState } from "react";
import { flushAllAutosaves } from "./autosave.js";
import { useAdmin } from "./context.js";
import { getAllPages, type ReleaseEntry, subscribeRelease } from "./data.js";
import { call, errorMessage } from "./firebase.js";
import { Button, Dialog } from "./ui.js";

interface Problem {
  where: string;
  message: string;
}

/** Top-bar "Publier" button: validates drafts, calls `openflowPublish` and follows the release. */
export function PublishControl() {
  const { config, services, pages, releases, settings, notify } = useAdmin();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [active, setActive] = useState<ReleaseEntry>();
  const [elapsed, setElapsed] = useState(0);

  const lastLive = releases.find((release) => release.status === "live");
  const changed = pages.filter((page) => !lastLive || page.updatedAt > lastLive.createdAt).length;
  const running = active && (active.status === "queued" || active.status === "building");

  useEffect(() => {
    if (!activeId) return;
    return subscribeRelease(services.db, activeId, (release) => {
      setActive(release);
      if (release?.status === "live") {
        notify("success", "Le site est en ligne avec vos dernières modifications.");
        setActiveId(undefined);
      }
      if (release?.status === "failed") {
        notify("error", `La publication a échoué${release.error ? ` : ${release.error}` : "."}`);
        setActiveId(undefined);
      }
    });
  }, [activeId, services.db, notify]);

  useEffect(() => {
    if (!running) return;
    const started = new Date(active.createdAt).getTime();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [running, active?.createdAt]);

  const open = async () => {
    setBusy(true);
    try {
      await flushAllAutosaves();
      const found: Problem[] = [];
      for (const page of await getAllPages(services.db)) {
        if (page.status !== "published") continue;
        for (const issue of validatePageData(page.data, config)) {
          if (issue.severity === "error") found.push({ where: page.title, message: issue.message });
        }
      }
      for (const issue of validateSettingsValues(settings?.values ?? {}, config)) {
        if (issue.severity === "error") found.push({ where: "Réglages", message: issue.message });
      }
      setProblems(found);
      setConfirming(true);
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const { releaseId } = await call<Record<string, never>, { releaseId: string }>(
        services,
        FUNCTION_NAMES.publish,
        {},
      );
      setElapsed(0);
      setActiveId(releaseId);
      setConfirming(false);
      notify("info", "Publication lancée : votre site sera à jour dans quelques minutes.");
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {running ? (
        <span className="of-publish-status" role="status">
          <span className="of-spinner of-spinner--small" aria-hidden />
          Publication en cours… {elapsed > 0 ? `${elapsed} s` : ""}
        </span>
      ) : (
        <Button variant="primary" busy={busy} onClick={open}>
          Publier{changed > 0 ? ` (${changed})` : ""}
        </Button>
      )}
      <Dialog
        open={confirming}
        title="Publier le site"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button variant="primary" busy={busy} disabled={problems.length > 0} onClick={publish}>
              Mettre en ligne
            </Button>
          </>
        }
      >
        {problems.length > 0 ? (
          <>
            <p className="of-error">Corrigez ces points avant de publier :</p>
            <ul className="of-problems">
              {problems.slice(0, 20).map((problem, index) => (
                <li key={`${problem.where}-${index}`}>
                  <strong>{problem.where}</strong> — {problem.message}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p>
              Toutes les pages visibles (
              {pages.filter((page) => page.status === "published").length}) seront mises en ligne
              telles qu'elles apparaissent dans l'éditeur.
            </p>
            <p className="of-muted">
              {changed > 0 ? `${changed} page(s) modifiée(s) depuis la dernière publication. ` : ""}
              La mise en ligne prend généralement 2 à 4 minutes. Vous pourrez revenir à une version
              précédente depuis l'historique.
            </p>
          </>
        )}
      </Dialog>
    </>
  );
}
