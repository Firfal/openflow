import { FUNCTION_NAMES, validatePageData, validateSettingsValues } from "@openflow/core";
import { useCallback, useEffect, useState } from "react";
import { flushAllAutosaves } from "./autosave.js";
import { useAdmin } from "./context.js";
import { getAllPages, type ReleaseEntry, subscribeRelease } from "./data.js";
import { call, errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { Button, Dialog, timeAgo } from "./ui.js";

interface Problem {
  where: string;
  pageId?: string;
  message: string;
}

/**
 * « Publier » button (dashboard and editor bars): validates drafts, lists what changed since the
 * last publication, calls `openflowPublish` and follows the release until it is live.
 */
export function PublishControl({ compact = false }: { compact?: boolean }) {
  const { config, services, pages, releases, settings, notify, navigate } = useAdmin();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [active, setActive] = useState<ReleaseEntry>();
  const [elapsed, setElapsed] = useState(0);

  const lastLive = releases.find((release) => release.status === "live");
  const changedPages = pages.filter((page) => !lastLive || page.updatedAt > lastLive.createdAt);
  const settingsChanged = Boolean(
    lastLive && settings?.updatedAt && settings.updatedAt > lastLive.createdAt,
  );
  const changed = changedPages.length + (settingsChanged ? 1 : 0);
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

  const open = useCallback(async () => {
    setBusy(true);
    try {
      await flushAllAutosaves();
      const found: Problem[] = [];
      for (const page of await getAllPages(services.db)) {
        if (page.status !== "published") continue;
        for (const issue of validatePageData(page.data, config)) {
          if (issue.severity === "error") {
            found.push({ where: page.title, pageId: page.id, message: issue.message });
          }
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
  }, [config, notify, services.db, settings?.values]);

  // « Publier le site » from the command palette.
  useEffect(() => {
    const onRequest = () => void open();
    window.addEventListener("openflow:publish", onRequest);
    return () => window.removeEventListener("openflow:publish", onRequest);
  }, [open]);

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

  const visible = pages.filter((page) => page.status === "published").length;
  return (
    <>
      {running ? (
        <span className="of-publish-status" role="status">
          <span className="of-spinner of-spinner--small" aria-hidden />
          {compact ? "Publication…" : "Publication en cours…"} {elapsed > 0 ? `${elapsed} s` : ""}
        </span>
      ) : (
        <Button
          variant="primary"
          busy={busy}
          onClick={open}
          title={
            changed > 0
              ? `${changed} modification(s) à mettre en ligne`
              : "Le site est à jour : publier de nouveau"
          }
        >
          Publier
          {changed > 0 && (
            <span className="of-badge">
              <span className="of-sr-only">, modifications : </span>
              {changed}
            </span>
          )}
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
            <p className="of-callout of-callout--warning">
              <Icon name="circleAlert" className="of-icon--first-line" />
              <span>Corrigez ces points avant de publier.</span>
            </p>
            <ul className="of-changes">
              {problems.slice(0, 20).map((problem, index) => (
                <li key={`${problem.where}-${index}`}>
                  <div className="of-list__main">
                    <strong>{problem.where}</strong>
                    <span className="of-subtle">{problem.message}</span>
                  </div>
                  {problem.pageId && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setConfirming(false);
                        navigate({ view: "editor", pageId: problem.pageId! });
                      }}
                    >
                      Corriger
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p>
              {visible > 1
                ? `Les ${visible} pages visibles seront mises en ligne telles qu'elles apparaissent dans l'éditeur.`
                : "La page visible sera mise en ligne telle qu'elle apparaît dans l'éditeur."}
            </p>
            {changed > 0 ? (
              <div>
                <p className="of-field__label" style={{ marginBottom: 8 }}>
                  Modifié depuis la dernière publication
                </p>
                <ul className="of-changes">
                  {changedPages.map((page) => (
                    <li key={page.id}>
                      <Icon name={page.slug === "" ? "home" : "fileText"} />
                      <div className="of-list__main">
                        <strong>{page.title}</strong>
                        <span className="of-subtle">
                          {page.status === "published" ? "" : "Masquée · "}
                          modifiée {timeAgo(page.updatedAt)}
                          {page.updatedBy ? ` par ${page.updatedBy}` : ""}
                        </span>
                      </div>
                    </li>
                  ))}
                  {settingsChanged && (
                    <li>
                      <Icon name="settings" />
                      <div className="of-list__main">
                        <strong>Réglages du site</strong>
                        <span className="of-subtle">modifiés {timeAgo(settings?.updatedAt)}</span>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <p className="of-callout of-callout--success">
                <Icon name="circleCheck" className="of-icon--first-line" />
                <span>Rien n'a changé depuis la dernière publication : le site est à jour.</span>
              </p>
            )}
            <p className="of-subtle" style={{ fontSize: 13 }}>
              La mise en ligne prend généralement 2 à 4 minutes. Chaque version reste restaurable
              depuis l'historique.
            </p>
          </>
        )}
      </Dialog>
    </>
  );
}
