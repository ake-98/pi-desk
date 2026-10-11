import { useEffect, useState } from "react";
import { ApprovalDialog } from "./components/ApprovalDialog";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { Sidebar } from "./components/Sidebar";
import { StartScreen } from "./components/StartScreen";
import { Badge, Button } from "./components/ui";
import { rpc } from "@/lib/rpc/client";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";

export default function App() {
  const boot = useSessionStore((s) => s.boot);
  const piState = useSessionStore((s) => s.piState);
  const startPi = useSessionStore((s) => s.startPi);
  const lastCwd = useSessionStore((s) => s.cwd);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [wasRunning, setWasRunning] = useState(false);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Crash/exit detection for the recovery banner. `sawRun` latches on once
  // a run starts and only clears when pi is running again, so the banner
  // persists until the user restarts (or closes the window).
  useEffect(() => {
    if (piState.state === "running") setWasRunning(true);
  }, [piState.state]);

  // Global shortcuts: Esc aborts the run, Cmd+N starts a new session.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const status = useChatStore.getState().runStatus;
        if (status !== "idle") rpc.send({ type: "abort" }).catch(() => {});
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void useSessionStore.getState().newSession();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      } else if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        useSessionStore.getState().setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const running = piState.state === "running";
  const startError = useSessionStore((s) => s.startError);
  const exitedUnexpectedly = piState.state === "stopped" && wasRunning && lastCwd;
  // Failed connection: explicit start error (e.g. pi not found) or a crash
  // after a previously working session. Both render red.
  const connectionFailed =
    piState.state === "stopped" && (Boolean(startError) || exitedUnexpectedly);

  return (
    <div className="flex h-full">
      {sidebarOpen && <Sidebar onClose={() => setSidebarOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Title bar */}
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} title="展开侧栏">
              ☰
            </Button>
          )}
          <span className="truncate text-[13px] text-muted-foreground">
            {piState.state === "running" ? piState.cwd : "pi 未运行"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {/* pi connection status: green = connected, amber = connecting,
                red = failed (start error or crash), gray = idle/not started */}
            <Badge
              title={
                piState.state === "stopped" && startError
                  ? startError
                  : undefined
              }
              className={
                piState.state === "running"
                  ? "border-emerald-800/50 text-emerald-600"
                  : piState.state === "starting"
                    ? "border-amber-700/50 text-amber-500"
                    : connectionFailed
                      ? "border-red-900/60 text-red-500"
                      : undefined
              }
            >
              {piState.state === "running"
                ? "已连接"
                : piState.state === "starting"
                  ? "连接中"
                  : connectionFailed
                    ? "连接失败"
                    : "未连接"}
            </Badge>
          </div>
        </header>

        {/* Crash recovery banner */}
        {exitedUnexpectedly && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-[13px] text-amber-400">
            <span>pi 进程意外退出。</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void startPi(lastCwd)}
              >
                重启
              </Button>
            </div>
          </div>
        )}

        {running ? (
          <>
            <ChatView />
            <Composer />
          </>
        ) : (
          <StartScreen />
        )}
      </div>
      <ApprovalDialog />
    </div>
  );
}
