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
import { SiteMark } from "./shell.js";
import { Button, FormField } from "./ui.js";

/** The Google « G » (brand colours, as required by Google's sign-in guidelines). */
function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

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
        <p className="of-login__brand">
          <SiteMark name={siteName} />
          OpenFlow
        </p>
        <h1>Administration de {siteName}</h1>
        {sent ? (
          <div className="of-login__sent" role="status">
            <p className="of-login__lead">
              Un lien de connexion vient d'être envoyé à <strong>{email}</strong>. Ouvrez-le sur cet
              appareil pour accéder à l'administration.
            </p>
            <Button variant="ghost" icon="arrowLeft" onClick={() => setSent(false)}>
              Utiliser une autre adresse
            </Button>
          </div>
        ) : (
          <>
            <p className="of-login__lead">
              Connectez-vous pour modifier votre site. Pas de mot de passe : vous recevez un lien
              par e-mail.
            </p>
            <form
              className="of-form"
              onSubmit={(e) => {
                e.preventDefault();
                void sendLink();
              }}
            >
              <FormField label="Votre adresse e-mail">
                <input
                  className="of-input of-input--lg"
                  type="email"
                  required
                  autoComplete="email"
                  spellCheck={false}
                  placeholder="vous@exemple.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormField>
              <Button variant="primary" size="lg" type="submit" busy={busy}>
                {completing ? "Confirmer la connexion" : "Recevoir un lien de connexion"}
              </Button>
              <div className="of-divider">ou</div>
              <Button
                size="lg"
                busy={busy}
                onClick={() => run(() => signInWithPopup(services.auth, new GoogleAuthProvider()))}
              >
                <GoogleLogo />
                Continuer avec Google
              </Button>
              {services.emulators && (
                <Button variant="ghost" busy={busy} disabled={!email} onClick={devLogin}>
                  Connexion rapide (émulateur local)
                </Button>
              )}
            </form>
          </>
        )}
        {error && (
          <p className="of-callout of-callout--warning" role="alert" style={{ marginTop: 16 }}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
