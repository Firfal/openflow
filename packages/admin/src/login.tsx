import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { errorMessage, type Services } from "./firebase.js";
import { Button, FormField } from "./ui.js";

const EMAIL_KEY = "openflow:signin-email";
const DEV_PASSWORD = "openflow-emulator";

export function Login({ services, siteName }: { services: Services; siteName: string }) {
  const [email, setEmail] = useState(() => window.localStorage.getItem(EMAIL_KEY) ?? "");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const completing = isSignInWithEmailLink(services.auth, window.location.href);

  useEffect(() => {
    if (!completing) return;
    const stored = window.localStorage.getItem(EMAIL_KEY);
    if (!stored) return; // Opened on another device: ask for the email below.
    setBusy(true);
    signInWithEmailLink(services.auth, stored, window.location.href)
      .then(() => {
        window.localStorage.removeItem(EMAIL_KEY);
        window.history.replaceState(null, "", window.location.pathname);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [completing, services.auth]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendLink = () =>
    run(async () => {
      if (completing) {
        await signInWithEmailLink(services.auth, email, window.location.href);
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }
      await sendSignInLinkToEmail(services.auth, email, {
        url: `${window.location.origin}${window.location.pathname}`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_KEY, email);
      setSent(true);
    });

  const devLogin = () =>
    run(async () => {
      try {
        await signInWithEmailAndPassword(services.auth, email, DEV_PASSWORD);
      } catch {
        await createUserWithEmailAndPassword(services.auth, email, DEV_PASSWORD);
      }
    });

  return (
    <main className="of-login">
      <div className="of-card of-login__card">
        <p className="of-login__brand">OpenFlow</p>
        <h1>Administration de {siteName}</h1>
        {sent ? (
          <p>
            Un lien de connexion vient d'être envoyé à <strong>{email}</strong>. Ouvrez-le sur cet
            appareil pour accéder à l'administration.
          </p>
        ) : (
          <form
            className="of-form"
            onSubmit={(e) => {
              e.preventDefault();
              void sendLink();
            }}
          >
            <FormField label="Votre adresse e-mail">
              <input
                className="of-input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <Button variant="primary" type="submit" busy={busy} disabled={!email}>
              {completing ? "Confirmer la connexion" : "Recevoir un lien de connexion"}
            </Button>
            <div className="of-divider">ou</div>
            <Button
              busy={busy}
              onClick={() => run(() => signInWithPopup(services.auth, new GoogleAuthProvider()))}
            >
              Continuer avec Google
            </Button>
            {services.emulators && (
              <Button variant="ghost" busy={busy} disabled={!email} onClick={devLogin}>
                Connexion rapide (émulateur local)
              </Button>
            )}
          </form>
        )}
        {error && <p className="of-error">{error}</p>}
      </div>
    </main>
  );
}
