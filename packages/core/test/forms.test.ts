import { describe, expect, it } from "vitest";
import { type FormFieldDef, formFieldName, validateSubmission } from "../src/index.js";

const form: FormFieldDef[] = [
  { label: "Nom", type: "text", required: "yes" },
  { label: "E-mail", type: "email", required: "yes" },
  { label: "Téléphone", type: "tel", required: "no" },
  { label: "Sujet", type: "select", required: "no", options: "Devis\nQuestion" },
  { label: "Message", type: "textarea", required: "yes" },
  { label: "J'accepte d'être recontacté", type: "checkbox", required: "yes" },
];

describe("forms", () => {
  it("names fields from their labels", () => {
    expect(form.map(formFieldName)).toEqual([
      "nom",
      "e-mail",
      "telephone",
      "sujet",
      "message",
      "jaccepte-detre-recontacte",
    ]);
    expect(formFieldName({ label: "", type: "text" }, 2)).toBe("champ-3");
  });

  it("accepts a valid message, in the order of the form, with the e-mail to reply to", () => {
    const result = validateSubmission(form, {
      message: "Bonjour,\\nje voudrais un devis.".replace("\\n", "\n"),
      nom: "  Camille  ",
      "e-mail": "camille@exemple.fr",
      sujet: "Devis",
      "jaccepte-detre-recontacte": "on",
      inconnu: "ignoré",
    });
    expect(result).toEqual({
      ok: true,
      submission: {
        email: "camille@exemple.fr",
        fields: [
          { label: "Nom", value: "Camille" },
          { label: "E-mail", value: "camille@exemple.fr" },
          { label: "Sujet", value: "Devis" },
          { label: "Message", value: "Bonjour,\nje voudrais un devis." },
          { label: "J'accepte d'être recontacté", value: "Oui" },
        ],
      },
    });
  });

  it("reports each invalid field", () => {
    const result = validateSubmission(form, {
      nom: "Camille\nNouvelle ligne",
      "e-mail": "pas-un-email",
      telephone: "abc",
      sujet: "Autre chose",
      message: "x".repeat(5001),
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual({
      nom: "Une seule ligne.",
      "e-mail": "Adresse e-mail invalide.",
      telephone: "Numéro de téléphone invalide.",
      sujet: "Choix invalide.",
      message: "5000 caractères au plus.",
      "jaccepte-detre-recontacte": "Ce champ est obligatoire.",
    });
  });
});
