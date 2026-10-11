import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);
  return ref;
}

function Pill({
  children,
  onClick,
  active,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex max-w-[220px] items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors",
        active
          ? "bg-accent/15 text-accent"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Compact status strip under the composer (Codex/OpenCode style):
 * model picker + thinking level on the left, dismissible popovers.
 */
export function ComposerStatus() {
  const models = useSessionStore((s) => s.models);
  const currentModel = useSessionStore((s) => s.currentModel);
  const setModel = useSessionStore((s) => s.setModel);
  const thinkingLevel = useSessionStore((s) => s.thinkingLevel);
  const setThinkingLevel = useSessionStore((s) => s.setThinkingLevel);
  const cwd = useSessionStore((s) => s.cwd);
  const [openMenu, setOpenMenu] = useState<"model" | "thinking" | null>(null);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const menuRef = useClickOutside(() => setOpenMenu(null));

  // Fetch the workspace's git branch when the workspace changes.
  useEffect(() => {
    if (!cwd) {
      setGitBranch(null);
      return;
    }
    let cancelled = false;
    invoke<string | null>("git_branch", { cwd })
      .then((branch) => {
        if (!cancelled) setGitBranch(branch ?? null);
      })
      .catch(() => {
        if (!cancelled) setGitBranch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  if (!cwd) return null;

  const toggle = (menu: "model" | "thinking") => {
    setOpenMenu((cur) => (cur === menu ? null : menu));
    // Open the current model's provider group by default.
    setOpenProvider(currentModel?.provider ?? null);
  };

  // Group models by provider, preserving the API order.
  const providerGroups: Array<{ provider: string; models: typeof models }> = [];
  for (const model of models) {
    const group = providerGroups.find((g) => g.provider === model.provider);
    if (group) {
      group.models.push(model);
    } else {
      providerGroups.push({ provider: model.provider, models: [model] });
    }
  }

  return (
    <div ref={menuRef} className="relative mt-1 flex items-center justify-between">
      <div className="flex items-center gap-0.5">
        {/* Model */}
        <div className="relative">
          <Pill onClick={() => toggle("model")} active={openMenu === "model"}>
            <span className="truncate">{currentModel?.name ?? currentModel?.id ?? "选择模型"}</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Pill>
          {openMenu === "model" && (
            <div className="absolute bottom-full left-0 z-50 mb-1.5 w-56 rounded-lg border border-border bg-background py-1 shadow-xl">
              {models.length === 0 && (
                <p className="px-3 py-2 text-[12px] text-muted-foreground">
                  暂无可用模型——请检查 pi 登录状态
                </p>
              )}
              {providerGroups.map(({ provider, models: groupModels }) => {
                const expanded = openProvider === provider;
                const containsCurrent = groupModels.some(
                  (m) => currentModel?.provider === m.provider && currentModel?.id === m.id,
                );
                return (
                  <div
                    key={provider}
                    className="relative"
                    onMouseEnter={() => setOpenProvider(provider)}
                  >
                    {/* Level 1: provider row — hover opens the cascade to the right */}
                    <button
                      type="button"
                      onClick={() => setOpenProvider(provider)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] font-medium hover:bg-muted",
                        expanded && "bg-muted",
                        containsCurrent && "text-accent",
                      )}
                    >
                      <span className="truncate">{provider}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-muted-foreground/70">
                        {groupModels.length}
                        <svg
                          width="9"
                          height="9"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M9 6l6 6-6 6"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                    {/* Level 2: cascading submenu to the right of the row */}
                    {expanded && (
                      <div className="absolute left-full top-0 z-50 ml-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-xl">
                        {groupModels.map((m) => {
                          const selected =
                            currentModel?.provider === m.provider && currentModel?.id === m.id;
                          return (
                            <button
                              key={`${m.provider}/${m.id}`}
                              type="button"
                              onClick={() => {
                                setModel(m.provider, m.id, m.name);
                                setOpenMenu(null);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-muted",
                                selected && "text-accent",
                              )}
                            >
                              <span className="truncate">{m.name ?? m.id}</span>
                              <span className="shrink-0 text-[10.5px] text-muted-foreground/70">
                                {m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k` : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Thinking level */}
        <div className="relative">
          <Pill onClick={() => toggle("thinking")} active={openMenu === "thinking"}>
            <span>thinking: {thinkingLevel ?? "off"}</span>
          </Pill>
          {openMenu === "thinking" && (
            <div className="absolute bottom-full left-0 z-50 mb-1.5 w-36 rounded-lg border border-border bg-background py-1 shadow-xl">
              {THINKING_LEVELS.map((level) => {
                const selected = (thinkingLevel ?? "off") === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      setThinkingLevel(level);
                      setOpenMenu(null);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-1.5 text-left text-[12.5px] hover:bg-muted",
                      selected && "text-accent",
                    )}
                  >
                    <span>{level}</span>
                    {selected && <span aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Git branch (display-only) — after thinking level */}
        <Pill>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
            <circle cx="6" cy="6" r="2.2" stroke="currentColor" strokeWidth="2" />
            <circle cx="6" cy="18" r="2.2" stroke="currentColor" strokeWidth="2" />
            <circle cx="18" cy="9" r="2.2" stroke="currentColor" strokeWidth="2" />
            <path d="M6 8.2v7.6M18 11.2c0 3-2.5 4-6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="max-w-[140px] truncate">{gitBranch ? `git: ${gitBranch}` : "无git"}</span>
        </Pill>
      </div>

      <p className="text-[11px] text-muted-foreground/50">
        Enter 发送 · Shift+Enter 换行 · Esc 中止
      </p>
    </div>
  );
}
