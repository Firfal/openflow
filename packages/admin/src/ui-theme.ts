import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** Appearance of the admin itself (not of the site): follows the system unless the owner picks one. */
export type UiTheme = "system" | "light" | "dark";

const KEY = "openflow:ui-theme";
const ATTRIBUTE = "data-of-theme";

function read(): UiTheme {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(theme: UiTheme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute(ATTRIBUTE);
  else root.setAttribute(ATTRIBUTE, theme);
}

/**
 * Appearance state, owned by the admin root (stored per browser: a convenience, never site data).
 * Components read it with {@link useUiTheme}.
 */
export function useUiThemeState(): [UiTheme, (theme: UiTheme) => void] {
  const [theme, setTheme] = useState<UiTheme>(read);
  useEffect(() => {
    apply(theme);
    return () => document.documentElement.removeAttribute(ATTRIBUTE);
  }, [theme]);
  const update = useCallback((next: UiTheme) => {
    try {
      if (next === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
    setTheme(next);
  }, []);
  return [theme, update];
}

export const UiThemeContext = createContext<[UiTheme, (theme: UiTheme) => void]>([
  "system",
  () => undefined,
]);

export function useUiTheme() {
  return useContext(UiThemeContext);
}
