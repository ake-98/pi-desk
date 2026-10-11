import { cn, formatTimestamp, settingsShortcutLabel } from "@/lib/utils";
import { type SessionSummary } from "@/lib/rpc/client";
import { addSystemNote, waitForSettled } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { SettingsDialog } from "./SettingsDialog";
import { WorkspacePicker } from "./WorkspacePicker";
import { Button } from "./ui";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  );
}

function SessionRow({ session }: { session: SessionSummary }) {
  const cwd = useSessionStore((s) => s.cwd);
  const switchSession = useSessionStore((s) => s.switchSession);
  const isCurrentWorkspace = cwd && session.cwd === cwd;
  const label =
    session.name ?? session.title ?? formatTimestamp(session.timestamp) ?? session.fileName;

  const load = async () => {
    if (!isCurrentWorkspace) {
      addSystemNote(
        `该会话来自 ${session.cwd}——请先切换到对应工作区再加载`,
      );
      return;
    }
    await waitForSettled();
    // switchSession fetches history and renders it; no reset here —
    // resetting after loading would wipe the conversation view.
    await switchSession(session.path);
  };

  return (
    <button
      type="button"
      onClick={load}
      className={cn(
        "w-full rounded-md px-2 py-1.5 text-left hover:bg-muted",
        "focus-visible:outline-2 focus-visible:outline-accent/60",
      )}
    >
      <p className="truncate text-[13px] text-foreground/90">{label}</p>
      <p className="text-[11px] text-muted-foreground/60">
        {formatTimestamp(session.timestamp)} · {session.messageCount} 条消息
      </p>
    </button>
  );
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const sessions = useSessionStore((s) => s.sessions);
  const cwd = useSessionStore((s) => s.cwd);
  const newSession = useSessionStore((s) => s.newSession);
  const refreshSessions = useSessionStore((s) => s.refreshSessions);
  const settingsOpen = useSessionStore((s) => s.settingsOpen);
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen);

  const currentSessions = sessions.filter((s) => s.cwd === cwd).slice(0, 30);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-muted/20">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-[14px] font-semibold">pi-desk</span>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} title="收起侧栏">
            ✕
          </Button>
        )}
      </div>

      {/* Fixed top: workspace section — no overflow so the dropdown can
          overlay the sessions area below without clipping or scrollbars. */}
      <div className="shrink-0 px-4 pb-2">
        <SectionTitle>工作区</SectionTitle>
        <div className="px-0">
          <WorkspacePicker />
          {cwd && (
            <button
              type="button"
              onClick={async () => {
                await newSession();
              }}
              className="mt-1.5 w-full rounded-md border border-border px-2 py-1.5 text-[13px] hover:bg-muted"
            >
              + 新会话
            </button>
          )}
        </div>
      </div>

      {/* Scrollable region: sessions list only */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <div className="flex items-center justify-between px-0">
          <SectionTitle>会话</SectionTitle>
          <button
            type="button"
            onClick={refreshSessions}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            刷新
          </button>
        </div>
        <div className="space-y-0.5">
          {currentSessions.length === 0 && (
            <p className="px-2 text-[12px] text-muted-foreground/70">
              当前工作区暂无会话
            </p>
          )}
          {currentSessions.map((s) => (
            <SessionRow key={s.path} session={s} />
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
            "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          设置
          <span className="ml-auto text-[11px] text-muted-foreground/60">
            {settingsShortcutLabel()}
          </span>
        </button>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </aside>
  );
}
