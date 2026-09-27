"use client";

import {
  type FormFieldDef,
  formFieldName,
  formFieldOptions,
  validateSubmission,
} from "@openflow/core/forms";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

/**
 * A contact form of the site, declared by the owner in a section (`formFieldsField`) and sent to
 * `cmsSubmitForm` (`/forms/submit`). Works on the static site: labels, validation messages
 * and states are accessible (errors linked to their field, status announced). The section passes
 * its classes (Tailwind or other) through `classNames`.
 *
 * ```tsx
 * <OpenFlowForm formId={id} fields={formFields} submitLabel={submitLabel}
 *   successMessage={successMessage} editing={puck?.isEditing} />
 * ```
 */

export interface OpenFlowFormClassNames {
  form?: string;
  field?: string;
  label?: string;
  input?: string;
  checkbox?: string;
  error?: string;
  button?: string;
  status?: string;
  note?: string;
}

export interface OpenFlowFormProps {
  /** Id of the section (Puck `id`): the server finds the form with it. */
  formId: string;
  fields: FormFieldDef[];
  submitLabel: string;
  successMessage: string;
  /** Text under the form (use of the data, consent). */
  note?: string;
  /** In the editor: the form is shown but never sent. */
  editing?: boolean;
  classNames?: OpenFlowFormClassNames;
  /** Defaults to `/forms/submit` (the emulator's function with `NEXT_PUBLIC_CMS_EMULATORS`). */
  endpoint?: string;
  /**
   * What the form is for, told to the AI assistant of the visitor's browser (WebMCP declarative
   * API): « Demander un devis pour des travaux de menuiserie ». A generic sentence by default.
   */
  toolDescription?: string;
}

const TEXTS = {
  fr: {
    required: "obligatoire",
    sending: "Envoi…",
    failed: "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez.",
    invalid: "Vérifiez les champs signalés.",
    recaptcha: "Ce formulaire est protégé par reCAPTCHA :",
    privacy: "confidentialité",
    terms: "conditions",
    tool: "Envoie un message au propriétaire du site avec ce formulaire. Le visiteur relit et confirme l'envoi.",
    sentToAgent: "Message envoyé au propriétaire du site.",
  },
  en: {
    required: "required",
    sending: "Sending…",
    failed: "The message could not be sent. Check your connection and try again.",
    invalid: "Please check the highlighted fields.",
    recaptcha: "This form is protected by reCAPTCHA:",
    tool: "Sends a message to the site's owner with this form. The visitor reviews and confirms it.",
    sentToAgent: "Message sent to the site's owner.",
    privacy: "privacy",
    terms: "terms",
  },
};

declare global {
  interface Window {
    grecaptcha?: {
      enterprise: {
        ready(callback: () => void): void;
        execute(siteKey: string, options: { action: string }): Promise<string>;
      };
    };
  }
}

function defaultEndpoint(): string {
  if (process.env.NEXT_PUBLIC_CMS_EMULATORS === "1" && typeof window !== "undefined") {
    const region = process.env.NEXT_PUBLIC_CMS_REGION || "europe-west1";
    return `http://${window.location.hostname}:5001/demo-openflow/${region}/cmsSubmitForm`;
  }
  return "/forms/submit";
}

/** Lets browsers fill in the visitor's details (`autocomplete`), guessed from the type and label. */
function autoComplete(field: FormFieldDef): string | undefined {
  if (field.type === "email") return "email";
  if (field.type === "tel") return "tel";
  if (field.type !== "text") return undefined;
  const label = String(field.label ?? "")
    .trim()
    .toLowerCase();
  if (/soci[ée]t[ée]|entreprise|company|organi[sz]ation/.test(label)) return "organization";
  if (/^(nom de famille|last name|surname)/.test(label)) return "family-name";
  if (/^(prénom|first name)/.test(label)) return "given-name";
  if (/^(nom|name|full name|votre nom|your name)(\s|$)/.test(label)) return "name";
  return undefined;
}

/** reCAPTCHA key published by the layout (`<meta name="cms-recaptcha">`), if any. */
function recaptchaKey(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return (
    document.querySelector<HTMLMetaElement>('meta[name="cms-recaptcha"]')?.content || undefined
  );
}

let recaptchaLoading: Promise<void> | undefined;
function loadRecaptcha(key: string): Promise<void> {
  recaptchaLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => window.grecaptcha?.enterprise.ready(() => resolve());
    script.onerror = () => reject(new Error("reCAPTCHA"));
    document.head.append(script);
  });
  return recaptchaLoading;
}

type Status = { kind: "idle" | "sending" | "sent" | "error"; message?: string };

export function OpenFlowForm({
  formId,
  fields,
  submitLabel,
  successMessage,
  note,
  editing,
  classNames = {},
  endpoint,
  toolDescription,
}: OpenFlowFormProps) {
  const id = useId();
  const shownAt = useRef(0);
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [key, setKey] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const statusRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const t = TEXTS[lang];

  useEffect(() => {
    shownAt.current = Date.now();
    setLang(document.documentElement.lang.startsWith("en") ? "en" : "fr");
    setKey(recaptchaKey());
  }, []);

  // After an error, focus the first field to fix (else the message); after sending, the message.
  useEffect(() => {
    if (status.kind !== "sent" && status.kind !== "error") return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? statusRef.current)?.focus();
  }, [status]);

  // reCAPTCHA is loaded only when a visitor starts filling the form.
  const warmUp = () => {
    if (key && !editing) void loadRecaptcha(key).catch(() => undefined);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editing || status.kind === "sending") return;
    // Sent by the AI assistant of the visitor's browser (WebMCP): it gets the result back.
    const native = event.nativeEvent as SubmitEvent & {
      agentInvoked?: boolean;
      respondWith?: (result: Promise<unknown>) => void;
    };
    const agent = native.agentInvoked === true;
    const result = send(event.currentTarget, agent);
    if (agent && typeof native.respondWith === "function") native.respondWith(result);
  };

  /** Validates and sends the form; resolves with what the visitor's assistant is told. */
  const send = async (form: HTMLFormElement, agent: boolean): Promise<string> => {
    const data = new FormData(form);
    const values: Record<string, string | boolean> = {};
    fields.forEach((field, index) => {
      const name = formFieldName(field, index);
      values[name] =
        field.type === "checkbox" ? data.get(name) === "on" : String(data.get(name) ?? "");
    });
    const local = validateSubmission(fields, values);
    if (!local.ok) {
      setErrors(local.errors);
      setStatus({ kind: "error", message: t.invalid });
      return `${t.invalid} ${Object.values(local.errors).join(" ")}`;
    }
    setErrors({});
    setStatus({ kind: "sending" });
    let token: string | undefined;
    if (key) {
      try {
        await loadRecaptcha(key);
        token = await window.grecaptcha?.enterprise.execute(key, { action: "contact" });
      } catch {
        token = undefined;
      }
    }
    try {
      const response = await fetch(endpoint ?? defaultEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId,
          page: window.location.pathname,
          values,
          website: String(data.get("website") ?? ""),
          elapsed: Date.now() - shownAt.current,
          token,
          ...(agent ? { agent: true } : {}),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        errors?: Record<string, string>;
      };
      if (response.ok && result.ok) {
        form.reset();
        setStatus({ kind: "sent" });
        return t.sentToAgent;
      }
      setErrors(result.errors ?? {});
      setStatus({ kind: "error", message: result.error || t.failed });
      return result.error || t.failed;
    } catch {
      setStatus({ kind: "error", message: t.failed });
      return t.failed;
    }
  };

  // WebMCP declarative API: the form is a tool the visitor's assistant can fill in (the visitor
  // still confirms the sending). Browsers without it ignore these attributes.
  const tool = {
    toolname: `send_${formId.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "message"}`,
    tooldescription: toolDescription || t.tool,
  } as Record<string, string>;

  return (
    <form
      ref={formRef}
      className={classNames.form}
      {...tool}
      noValidate
      onSubmit={submit}
      onFocus={warmUp}
      aria-describedby={status.kind === "sent" || status.message ? `${id}-status` : undefined}
    >
      {fields.map((field, index) => {
        const name = formFieldName(field, index);
        const inputId = `${id}-${name}`;
        const error = errors[name];
        const common = {
          id: inputId,
          name,
          required: field.required === "yes",
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? `${inputId}-error` : undefined,
          // The parameter as the visitor's assistant sees it (WebMCP).
          toolparamdescription:
            field.type === "select"
              ? `${field.label} (${formFieldOptions(field).join(", ")})`
              : field.label,
        };
        const label = (
          <>
            {field.label}
            {field.required === "yes" && <span aria-hidden="true"> *</span>}
          </>
        );
        return (
          <div key={`${name}-${index}`} className={classNames.field}>
            {field.type === "checkbox" ? (
              <label className={classNames.label}>
                <input type="checkbox" className={classNames.checkbox} {...common} /> {label}
              </label>
            ) : (
              <>
                <label className={classNames.label} htmlFor={inputId}>
                  {label}
                </label>
                {field.type === "textarea" ? (
                  <textarea className={classNames.input} rows={5} {...common} />
                ) : field.type === "select" ? (
                  <select className={classNames.input} defaultValue="" {...common}>
                    <option value="" disabled hidden />
                    {formFieldOptions(field).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={classNames.input}
                    type={field.type}
                    autoComplete={autoComplete(field)}
                    spellCheck={field.type === "email" ? false : undefined}
                    {...common}
                  />
                )}
              </>
            )}
            {error && (
              <p id={`${inputId}-error`} className={classNames.error}>
                {error}
              </p>
            )}
          </div>
        );
      })}
      {/* Honeypot: invisible to people and assistive technologies, filled by bots. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px", height: 0, overflow: "hidden" }}
      >
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <button
        type="submit"
        className={classNames.button}
        disabled={status.kind === "sending"}
        aria-disabled={editing || undefined}
      >
        {status.kind === "sending" ? t.sending : submitLabel}
      </button>
      {status.kind === "error" && status.message && (
        <p
          id={`${id}-status`}
          ref={statusRef}
          tabIndex={-1}
          role="alert"
          className={classNames.status}
          data-status="error"
        >
          {status.message}
        </p>
      )}
      {/* The success message is in the page from the start (hidden), and shown in the editor. */}
      <p
        id={status.kind === "sent" ? `${id}-status` : undefined}
        ref={status.kind === "sent" ? statusRef : undefined}
        tabIndex={-1}
        role="status"
        hidden={status.kind !== "sent" && !editing}
        className={classNames.status}
        data-status="sent"
      >
        {successMessage}
      </p>
      {note && <p className={classNames.note}>{note}</p>}
      {key && (
        <p className={classNames.note}>
          {t.recaptcha}{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            {t.privacy}
          </a>
          ,{" "}
          <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
            {t.terms}
          </a>
          .<style>{".grecaptcha-badge{visibility:hidden}"}</style>
        </p>
      )}
    </form>
  );
}
