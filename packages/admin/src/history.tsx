import { FUNCTION_NAMES, type ReleaseStatus } from "@openflow/core";
import { useState } from "react";
import { useAdmin } from "./context.js";
import type { ReleaseEntry } from "./data.js";
import { call, errorMessage } from "./firebase.js";
import { Icon, type IconName } from "./icons.js";
import { PageHead } from "./shell.js";
import { Button, Dialog, EmptyState, formatDate, StatusChip, type Tone, timeAgo } from "./ui.js";

const STATUS: Record<
  ReleaseStatus,
  { label: string; tone: Tone; icon: IconName; dot: "live" | "failed" | "running" | "" }
> = {
  queued: { label: "En attente", tone: "blue", icon: "history", dot: "running" },
  building: { label: "En cours", tone: "blue", icon: "history", dot: "running" },
  live: { label: "En ligne", tone: "green", icon: "check", dot: "live" },
  failed: { label: "Échec", tone: "red", icon: "x", dot: "failed" },
  superseded: { label: "Remplacée", tone: "grey", icon: "globe", dot: "" },
};

export function HistoryView() {
  const { releases, services, notify } = useAdmin();
  const [restoring, setRestoring] = useState<ReleaseEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    if (!restoring) return;
    setBusy(true);
    try {
      await call(services, FUNCTION_NAMES.restoreRelease, { releaseId: restoring.id });
      notify(
        "success",
        `La version du ${formatDate(restoring.createdAt)} est de nouveau en ligne.`,
      );
      setRestoring(null);
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Historique" />
      <section className="of-view of-view--narrow">
        <p className="of-view__intro">
          Chaque publication est conservée : vous pouvez remettre en ligne une version précédente en
          un clic. Vos brouillons ne sont pas modifiés.
        </p>
        {releases.length === 0 ? (
          <EmptyState icon="history" title="Aucune publication pour l'instant">
            <p>Le site n'a pas encore été publié depuis l'admin.</p>
          </EmptyState>
        ) : (
          <ol className="of-timeline" aria-label="Publications">
            {releases.map((release) => {
              const status = STATUS[release.status];
              return (
                <li key={release.id} className="of-timeline__item">
                  <span
                    className={`of-timeline__dot${status.dot ? ` of-timeline__dot--${status.dot}` : ""}`}
                    aria-hidden
                  >
                    {status.dot === "running" ? (
                      <span className="of-spinner of-spinner--small" />
                    ) : (
                      <Icon name={status.icon} size={12} />
                    )}
                  </span>
                  <div className="of-timeline__card">
                    <div className="of-list__main">
                      <span className="of-list__title">{formatDate(release.createdAt)}</span>
                      <span className="of-list__meta">
                        <span>{timeAgo(release.createdAt)}</span>
                        <span>
                          {release.pageCount} page{release.pageCount > 1 ? "s" : ""}
                        </span>
                        <span>par {release.createdBy}</span>
                        {release.restoredAt && (
                          <span>restaurée le {formatDate(release.restoredAt)}</span>
                        )}
                      </span>
                      {release.error && (
                        <span className="of-error" style={{ fontSize: 12.5 }}>
                          {release.error}
                        </span>
                      )}
                    </div>
                    <StatusChip tone={status.tone}>{status.label}</StatusChip>
                    {release.logUrl && (
                      <a
                        className="of-btn of-btn--ghost of-btn--sm"
                        href={release.logUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Journal
                      </a>
                    )}
                    {release.hostingVersion && release.status === "superseded" && (
                      <Button size="sm" icon="reset" onClick={() => setRestoring(release)}>
                        Remettre en ligne
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <Dialog
        open={Boolean(restoring)}
        title="Remettre cette version en ligne ?"
        onClose={() => setRestoring(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestoring(null)}>
              Annuler
            </Button>
            <Button variant="primary" busy={busy} onClick={restore}>
              Remettre en ligne
            </Button>
          </>
        }
      >
        <p>
          Le site public reviendra immédiatement à la version publiée le{" "}
          {formatDate(restoring?.createdAt)}. Vos brouillons dans l'éditeur ne sont pas modifiés :
          la prochaine publication les remettra en ligne.
        </p>
      </Dialog>
    </>
  );
}
