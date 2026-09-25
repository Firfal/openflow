import { FUNCTION_NAMES, type ReleaseStatus } from "@openflow/core";
import { useState } from "react";
import { useAdmin } from "./context.js";
import type { ReleaseEntry } from "./data.js";
import { call, errorMessage } from "./firebase.js";
import { Button, Dialog, formatDate, StatusChip } from "./ui.js";

const STATUS: Record<
  ReleaseStatus,
  { label: string; tone: "green" | "grey" | "orange" | "red" | "blue" }
> = {
  queued: { label: "En attente", tone: "blue" },
  building: { label: "En cours", tone: "blue" },
  live: { label: "En ligne", tone: "green" },
  failed: { label: "Échec", tone: "red" },
  superseded: { label: "Remplacée", tone: "grey" },
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
    <section className="of-view">
      <header className="of-view__header">
        <div>
          <h1>Historique des publications</h1>
          <p className="of-muted">
            Chaque publication est conservée : vous pouvez remettre en ligne une version précédente
            en un clic.
          </p>
        </div>
      </header>
      {releases.length === 0 ? (
        <p className="of-empty">Le site n'a pas encore été publié depuis l'admin.</p>
      ) : (
        <ul className="of-list">
          {releases.map((release) => {
            const status = STATUS[release.status];
            return (
              <li key={release.id} className="of-list__item">
                <div className="of-list__main">
                  <strong>{formatDate(release.createdAt)}</strong>
                  <span className="of-muted">
                    {release.pageCount} page(s) · par {release.createdBy}
                    {release.restoredAt ? ` · restaurée le ${formatDate(release.restoredAt)}` : ""}
                  </span>
                  {release.error && <span className="of-error">{release.error}</span>}
                </div>
                <div className="of-row">
                  <StatusChip tone={status.tone}>{status.label}</StatusChip>
                  {release.logUrl && (
                    <a
                      className="of-btn of-btn--ghost"
                      href={release.logUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Journal
                    </a>
                  )}
                  {release.hostingVersion && release.status === "superseded" && (
                    <Button onClick={() => setRestoring(release)}>Remettre en ligne</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
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
    </section>
  );
}
