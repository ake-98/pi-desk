import { invoke } from "@tauri-apps/api/core";

export type ThemeSetting = "light" | "dark" | "system";

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

function resolveAndApply(setting: ThemeSetting): void {
  const root = document.documentElement;
  const dark =
    setting === "dark" ||
    (setting === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  // Sync native window chrome (titlebar) with the resolved theme.
  invoke("set_window_theme", { theme: dark ? "dark" : "light" }).catch(() => {});
}

/**
 * Apply the theme setting to <html> (class light/dark).
 * "system" tracks the OS preference live via matchMedia.
 */
export function applyTheme(setting: ThemeSetting | undefined): () => void {
  const resolved = setting ?? "system";
  resolveAndApply(resolved);

  // Rebind the system listener each call so it always reflects the latest setting.
  if (mediaListener) {
    mediaQuery?.removeEventListener("change", mediaListener);
    mediaListener = null;
  }
  if (resolved === "system") {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaListener = () => resolveAndApply("system");
    mediaQuery.addEventListener("change", mediaListener);
  }

  return () => {
    if (mediaListener) {
      mediaQuery?.removeEventListener("change", mediaListener);
      mediaListener = null;
    }
  };
}
