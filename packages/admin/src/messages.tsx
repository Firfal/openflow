import { COLLECTIONS } from "@openflow/core";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import { useAdmin } from "./context.js";
import type { MessageEntry } from "./data.js";
import { errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { PageHead } from "./shell.js";
import { Button, Dialog, EmptyState, timeAgo } from "./ui.js";

/** Who wrote: the name (first text field), else the e-mail. */
function sender(message: MessageEntry): string {
  const name = message.fields.find((f) => /nom|name/i.test(f.label))?.value;
  return name || message.email || message.fields[0]?.value || "Visiteur";
}

function excerpt(message: MessageEntry): string {
  const long = [...message.fields].sort((a, b) => b.value.length - a.value.length)[0];
  return long?.value.replace(/\s+/g, " ").slice(0, 140) ?? "";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

/**
 * « Messages »: what visitors sent with the site's contact forms (`cmsSubmitForm`), newest
 * first. Likely spam (low reCAPTCHA score) is kept apart in « Indésirables ».
 */
export function MessagesView() {
  const { messages, services, notify } = useAdmin();
  const [box, setBox] = useState<"inbox" | "spam">("inbox");
  const [openId, setOpenId] = useState<string>();
  const shown = messages.filter((m) => (box === "spam" ? m.spam : !m.spam));
  const spamCount = messages.filter((m) => m.spam).length;
  const open = messages.find((m) => m.id === openId);

  const update = async (message: MessageEntry, data: { read?: boolean; spam?: boolean }) => {
    try {
      await updateDoc(doc(services.db, COLLECTIONS.messages, message.id), data);
    } catch (error) {
      notify("error", errorMessage(error));
    }
  };
  const show = (message: MessageEntry) => {
    setOpenId(message.id);
    if (!message.read) void update(message, { read: true });
  };
  const remove = async (message: MessageEntry) => {
    if (
      !window.confirm(
        `Supprimer le message de ${sender(message)} ? Il ne pourra pas être récupéré.`,
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(services.db, COLLECTIONS.messages, message.id));
      setOpenId(undefined);
      notify("success", "Message supprimé.");
    } catch (error) {
      notify("error", errorMessage(error));
    }
  };

  return (
    <>
      <PageHead
        title="Messages"
        description="Ce que les visiteurs vous envoient avec les formulaires du site."
      />
      <section className="of-view">
        <fieldset className="of-segmented of-messages__boxes">
          <legend className="of-sr-only">Dossier</legend>
          <button
            type="button"
            aria-pressed={box === "inbox"}
            className={box === "inbox" ? "is-active" : ""}
            onClick={() => setBox("inbox")}
          >
            Reçus
          </button>
          <button
            type="button"
            aria-pressed={box === "spam"}
            className={box === "spam" ? "is-active" : ""}
            onClick={() => setBox("spam")}
          >
            Indésirables{spamCount > 0 ? ` (${spamCount})` : ""}
          </button>
        </fieldset>
        {shown.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={box === "spam" ? "Aucun message indésirable" : "Aucun message pour l'instant"}
          >
            <p>
              {box === "spam"
                ? "Les messages que le filtre anti-spam juge suspects arrivent ici, sans notification."
                : "Ajoutez la section « Formulaire de contact » à une page, publiez : les messages des visiteurs arriveront ici, et par e-mail."}
            </p>
          </EmptyState>
        ) : (
          <ul
            className="of-list"
            aria-label={box === "spam" ? "Messages indésirables" : "Messages reçus"}
          >
            {shown.map((message) => (
              <li key={message.id} className={`of-list__item${message.read ? "" : " is-unread"}`}>
                <span className="of-list__icon" aria-hidden>
                  <Icon name="mail" />
                </span>
                <button type="button" className="of-message" onClick={() => show(message)}>
                  <span className="of-message__head">
                    <span className="of-message__sender">{sender(message)}</span>
                    {!message.read && <span className="of-message__new">Nouveau</span>}
                    <span className="of-message__date">{timeAgo(message.createdAt)}</span>
                  </span>
                  <span className="of-message__excerpt">{excerpt(message)}</span>
                  <span className="of-list__meta">
                    <span>{message.formTitle}</span>
                    <span className="of-mono">{message.page}</span>
                    {message.agent && <span>Rempli par l'assistant IA du visiteur</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog
        open={Boolean(open)}
        title={open ? `Message de ${sender(open)}` : "Message"}
        onClose={() => setOpenId(undefined)}
        wide
        footer={
          open && (
            <>
              <Button variant="danger-ghost" icon="trash" onClick={() => void remove(open)}>
                Supprimer
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void update(open, { spam: !open.spam });
                  setOpenId(undefined);
                }}
              >
                {open.spam ? "Ce n'est pas un indésirable" : "Indésirable"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void update(open, { read: false });
                  setOpenId(undefined);
                }}
              >
                Marquer comme non lu
              </Button>
              {open.email && (
                <a
                  className="of-btn of-btn--primary"
                  href={`mailto:${open.email}?subject=${encodeURIComponent(`Re : ${open.formTitle}`)}`}
                >
                  <Icon name="mail" />
                  Répondre
                </a>
              )}
            </>
          )
        }
      >
        {open && (
          <div className="of-message-detail">
            <p className="of-subtle">
              Reçu le {formatDate(open.createdAt)}, depuis la page{" "}
              <span className="of-mono">{open.page}</span> ({open.formTitle})
              {open.agent ? ", rempli par l'assistant IA du visiteur" : ""}.
            </p>
            <dl>
              {open.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Dialog>
    </>
  );
}
