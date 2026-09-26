import type { OpenFlowConfig, SettingsDoc } from "@openflow/core";
import type { User } from "firebase/auth";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { PageEntry, ReleaseEntry } from "./data.js";
import type { Services } from "./firebase.js";

export type SettingsTab = "global" | "theme" | "site" | "assistant";

export type Route =
  | { view: "pages" }
  | { view: "editor"; pageId: string }
  | { view: "settings"; tab?: SettingsTab }
  | { view: "media" }
  | { view: "history" };

const SETTINGS_TABS: SettingsTab[] = ["global", "theme", "site", "assistant"];

export interface Notice {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
}

export interface AdminContextValue {
  config: OpenFlowConfig;
  services: Services;
  user: User;
  pages: PageEntry[];
  settings: SettingsDoc | undefined;
  releases: ReleaseEntry[];
  route: Route;
  navigate: (route: Route) => void;
  notify: (kind: Notice["kind"], text: string) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({
  value,
  children,
}: {
  value: AdminContextValue;
  children: ReactNode;
}) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin() doit être utilisé dans l'admin OpenFlow");
  return value;
}

function readRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  const pageId = params.get("page");
  const tab = params.get("tab") as SettingsTab | null;
  if (view === "editor" && pageId) return { view: "editor", pageId };
  if (view === "settings") {
    return tab && SETTINGS_TABS.includes(tab) ? { view, tab } : { view };
  }
  if (view === "history" || view === "media") return { view };
  return { view: "pages" };
}

function routeToSearch(route: Route): string {
  const params = new URLSearchParams();
  if (route.view !== "pages") params.set("view", route.view);
  if (route.view === "editor") params.set("page", route.pageId);
  if (route.view === "settings" && route.tab) params.set("tab", route.tab);
  const search = params.toString();
  return search ? `?${search}` : window.location.pathname;
}

/** Tiny query-string router (`/admin/?view=editor&page=accueil`) with back-button support. */
export function useRouter(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((next: Route) => {
    window.history.pushState(null, "", routeToSearch(next));
    setRoute(next);
  }, []);
  return [route, navigate];
}
