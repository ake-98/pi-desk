import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";

function basenameOf(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

/**
 * Workspace dropdown: fixed "choose folder…" row on top (native picker),
 * then searchable quick-select rows for previously opened workspaces.
 */
export function WorkspacePicker() {
  const cwd = useSessionStore((s) => s.cwd);
  // Select the raw value (stable reference); defaulting to [] outside the
  // selector — a fresh array per render crashes zustand v5 + React 19.
  const recentWorkspaces = useSessionStore((s) => s.settings.recentWorkspaces);
  const startPi = useSessionStore((s) => s.startPi);
  const [openState, setOpenState] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside close.
  useEffect(() => {
    if (!openState) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenState(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openState]);

  // Escape closes; Enter opens the folder picker (fastest path to a new dir).
  useEffect(() => {
    if (!openState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenState(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openState]);

  const pickNew = async () => {
    setOpenState(false);
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") await startPi(selected);
  };

  const q = query.trim().toLowerCase();
  const recents = recentWorkspaces ?? [];
  const filtered = recents.filter((p) => {
    if (!q) return true;
    return basenameOf(p).toLowerCase().includes(q) || p.toLowerCase().includes(q);
  });

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpenState((o) => !o);
          setQuery("");
        }}
        className="flex w-full items-center justify-between gap-1.5 rounded-md border border-border px-2 py-1.5 text-left text-[13px] hover:bg-muted"
        title={cwd ?? undefined}
      >
        <span className="truncate">{cwd ? basenameOf(cwd) : "选择文件夹…"}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={cn("shrink-0 text-muted-foreground transition-transform", openState && "rotate-180")}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {openState && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-lg border border-border bg-background py-1 shadow-xl">
          {/* Fixed first row: open the native folder picker */}
          <button
            type="button"
            onClick={pickNew}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-accent hover:bg-muted"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
              <path
                d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            选择工作区…
          </button>

          {recents.length > 0 && (
            <>
              <div className="border-t border-border px-2.5 py-1" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="按名称搜索…"
                className="mx-1.5 mb-1 w-[calc(100%-12px)] rounded-md bg-muted/50 px-2 py-1 text-[12px] outline-none placeholder:text-muted-foreground/50"
              />
              <div className="max-h-52 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="px-2.5 py-1.5 text-[12px] text-muted-foreground">无匹配工作区</p>
                )}
                {filtered.map((path) => {
                  const isCurrent = path === cwd;
                  return (
                    <button
                      key={path}
                      type="button"
                      onClick={() => {
                        setOpenState(false);
                        if (!isCurrent) void startPi(path);
                      }}
                      title={path}
                      className={cn(
                        "block w-full px-2.5 py-1.5 text-left hover:bg-muted",
                        isCurrent && "text-accent",
                      )}
                    >
                      <span className="block truncate text-[12.5px]">{basenameOf(path)}</span>
                      <span className="block truncate text-[10.5px] text-muted-foreground/70">
                        {path}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
