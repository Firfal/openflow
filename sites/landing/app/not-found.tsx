import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page introuvable", robots: { index: false } };

export default function NotFound() {
  return (
    <main
      style={{ fontFamily: "system-ui, sans-serif", padding: "96px 24px", textAlign: "center" }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 700 }}>Page introuvable</h1>
      <p style={{ marginTop: 12 }}>
        <a href="/" style={{ textDecoration: "underline" }}>
          Retour à l'accueil
        </a>
      </p>
    </main>
  );
}
