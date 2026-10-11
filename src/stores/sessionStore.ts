import { create } from "zustand";
import {
  getSettings,
  listSessions,
  piStart,
  piState,
  rpc,
  setSettings,
  type AppSettings,
  type PiState,
  type SessionSummary,
} from "@/lib/rpc/client";
import type { AgentMessage, ExtensionUiRequest, ModelInfo } from "@/lib/rpc/types";
import { applyTheme } from "@/lib/theme";
import { addSystemNote, loadHistory, useChatStore } from "./chatStore";

export type PendingApproval = {
  request: ExtensionUiRequest;
};

interface SessionState {
  piState: PiState;
  cwd: string | null;
  sessions: SessionSummary[];
  models: ModelInfo[];
  currentModel: { provider: string; id: string; name?: string } | null;
  thinkingLevels: string[];
  thinkingLevel: string | null;
  settings: AppSettings;
  pendingApproval: PendingApproval | null;
  startError: string | null;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  boot: () => Promise<void>;
  startPi: (cwd: string) => Promise<boolean>;
  refreshSessions: () => Promise<void>;
  refreshModels: () => Promise<void>;
  setModel: (provider: string, id: string, name?: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
  switchSession: (path: string) => Promise<void>;
  newSession: () => Promise<void>;
  saveSettings: (s: AppSettings) => Promise<void>;
  resolveApproval: (response: Record<string, unknown>) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  piState: { state: "stopped" },
  cwd: null,
  sessions: [],
  models: [],
  currentModel: null,
  thinkingLevels: [],
  thinkingLevel: null,
  settings: {},
  pendingApproval: null,
  startError: null,
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  boot: async () => {
    await rpc.init();
    rpc.onStateChange((piState) => set({ piState }));
    rpc.onEvent((record) => {
      useChatStore.getState().handleRecord(record);
      // Refresh the session list after each run: persisted sessions are
      // written/updated by pi as the conversation progresses.
      if (record.type === "agent_settled") {
        void get().refreshSessions();
      }
      if (record.type === "extension_ui_request" && typeof record.id === "string") {
        // Only dialog methods (select/confirm/input/editor) block on a response.
        // Fire-and-forget methods (setWidget/setStatus/notify/…) must not open
        // the approval dialog — extensions emit them constantly.
        const DIALOG_METHODS = new Set(["select", "confirm", "input", "editor"]);
        if (
          typeof record.method !== "string" ||
          !DIALOG_METHODS.has(record.method)
        ) {
          return;
        }
        // Rebuild with runtime narrowing instead of casting: protocol records
        // arrive as loosely-typed JSON, so field presence is checked here.
        const options = Array.isArray(record.options)
          ? record.options.filter((o): o is string => typeof o === "string")
          : undefined;
        const request: ExtensionUiRequest = {
          type: "extension_ui_request",
          id: record.id,
          method: record.method,
          title: typeof record.title === "string" ? record.title : undefined,
          message: typeof record.message === "string" ? record.message : undefined,
          options,
          placeholder: typeof record.placeholder === "string" ? record.placeholder : undefined,
          timeout: typeof record.timeout === "number" ? record.timeout : undefined,
        };
        set({ pendingApproval: { request } });
      }
    });
    rpc.onExit(() => {
      set({ piState: { state: "stopped" }, cwd: null });
      // agent_settled handling resets the run status to idle.
      useChatStore.getState().handleRecord({ type: "agent_settled", aborted: true });
    });

    const settings = await getSettings();
    set({ settings });
    applyTheme(settings.theme);
    await get().refreshSessions();

    const st = await piState();
    set({ piState: st });

    // Auto-start: explicit default cwd, else the project dir setting, else ask UI.
    const cwd = settings.defaultCwd;
    if (cwd) {
      await get().startPi(cwd);
    }
  },

  startPi: async (cwd) => {
    set({ startError: null });
    useChatStore.getState().reset();
    const result = await piStart(cwd);
    if (!result.ok) {
      set({ startError: result.error ?? "启动 pi 失败" });
      return false;
    }
    set({ piState: { state: "running", cwd }, cwd });
    // Remember as last-opened workspace + recents list (most recent first).
    // First launch (no saved cwd) shows the workspace picker instead.
    const recents = [
      cwd,
      ...(get().settings.recentWorkspaces ?? []).filter((p) => p !== cwd),
    ].slice(0, 10);
    await get().saveSettings({
      ...get().settings,
      defaultCwd: cwd,
      recentWorkspaces: recents,
    });
    await get().refreshModels();
    return true;
  },

  refreshSessions: async () => {
    try {
      set({ sessions: await listSessions() });
    } catch {
      set({ sessions: [] });
    }
  },

  refreshModels: async () => {
    const loadOnce = async (): Promise<boolean> => {
      try {
        const res = await rpc.send({ type: "get_available_models" }, 15_000);
        if (res.success && res.data && typeof res.data === "object") {
          const data = res.data as { models?: ModelInfo[] };
          if ((data.models?.length ?? 0) > 0) {
            set({ models: data.models ?? [] });
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    };

    // pi needs a few seconds to boot (extensions load first); the first
    // query can arrive before models are resolvable, so retry once.
    const ok = await loadOnce();
    if (!ok) {
      await new Promise((r) => setTimeout(r, 2500));
      await loadOnce();
    }

    try {
      const state = await rpc.send({ type: "get_state" }, 15_000);
      if (state.success && state.data && typeof state.data === "object") {
        const d = state.data as {
          model?: { provider?: string; id?: string; name?: string };
          thinkingLevel?: string;
        };
        if (d.model?.provider && d.model.id) {
          set({
            currentModel: {
              provider: d.model.provider,
              id: d.model.id,
              name: d.model.name,
            },
          });
        }
        if (d.thinkingLevel) set({ thinkingLevel: d.thinkingLevel });
      }
    } catch {
      // state unavailable; non-fatal
    }
  },

  setModel: async (provider, id, name) => {
    const res = await rpc.send({ type: "set_model", provider, modelId: id });
    if (res.success) {
      set({ currentModel: { provider, id, name } });
    }
  },

  setThinkingLevel: async (level) => {
    const res = await rpc.send({ type: "set_thinking_level", level });
    if (res.success) set({ thinkingLevel: level });
  },

  switchSession: async (path) => {
    const res = await rpc.send({ type: "switch_session", sessionPath: path }, 30_000);
    if (!res.success) {
      addSystemNote(`切换会话失败：${res.error ?? "未知错误"}`);
      return;
    }
    // Rebuild the chat view from the loaded session's history.
    try {
      const msgs = await rpc.send({ type: "get_messages" }, 15_000);
      const data = msgs.success
        ? (msgs.data as { messages?: AgentMessage[] } | undefined)
        : undefined;
      loadHistory(data?.messages ?? []);
    } catch {
      useChatStore.getState().reset();
    }
    const fileName = path.split("/").pop() ?? path;
    const summary = get().sessions.find((s) => s.path === path);
    addSystemNote(`已加载会话：${summary?.name ?? fileName}（${summary?.messageCount ?? "?"} 条消息）`);
    await get().refreshSessions();
  },

  newSession: async () => {
    await rpc.send({ type: "new_session" }, 30_000);
    useChatStore.getState().reset();
    await get().refreshSessions();
  },

  saveSettings: async (s) => {
    await setSettings(s);
    set({ settings: s });
    applyTheme(s.theme);
  },

  resolveApproval: (response) => {
    const pending = get().pendingApproval;
    set({ pendingApproval: null });
    if (!pending) return;
    rpc.fire({ type: "extension_ui_response", id: pending.request.id, ...response });
  },
}));
