import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ThemeSetting } from "@/lib/theme";
import type {
  PiCommand,
  PiRecord,
  PiResponse,
} from "./types";

const PI_EVENT = "pi-event";
const PI_EXITED = "pi-exited";
const PI_STATE = "pi-state";

export type PiState =
  | { state: "stopped" }
  | { state: "starting"; cwd: string }
  | { state: "running"; cwd: string };

type PendingEntry = {
  resolve: (r: PiResponse) => void;
  reject: (e: Error) => void;
  timer: number;
};

type EventListener = (record: PiRecord) => void;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `pi-desk-${Date.now()}-${counter}`;
}

/**
 * Thin client over the Tauri bridge:
 *  - invoke("pi_command") writes one JSONL record to pi's stdin
 *  - "pi-event" carries every stdout record (responses + session events)
 * Requests are correlated by `id`; session events are delivered to listeners.
 */
class RpcClient {
  private pending = new Map<string, PendingEntry>();
  private listeners = new Set<EventListener>();
  private stateListeners = new Set<(s: PiState) => void>();
  private exitListeners = new Set<() => void>();
  private unlisten: UnlistenFn[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.unlisten.push(
      await listen<PiRecord>(PI_EVENT, (e) => this.handleRecord(e.payload)),
      await listen<PiState>(PI_STATE, (e) => {
        for (const fn of this.stateListeners) fn(e.payload);
      }),
      await listen(PI_EXITED, () => {
        this.rejectAll(new Error("pi process exited"));
        for (const fn of this.exitListeners) fn();
      }),
    );
  }

  private handleRecord(record: PiRecord): void {
    if (record.type === "response") {
      const response = record as PiResponse;
      const id = typeof response.id === "string" ? response.id : undefined;
      if (id) {
        const entry = this.pending.get(id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(id);
          entry.resolve(response);
          return;
        }
      }
    }
    for (const fn of this.listeners) fn(record);
  }

  private rejectAll(error: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  /** Send a command and resolve with its correlated response. */
  send(command: PiCommand, timeoutMs = 30_000): Promise<PiResponse> {
    const id = nextId();
    const record = { id, ...command };
    return new Promise<PiResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`pi command timed out: ${command.type}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      invoke("pi_command", { record }).catch((err) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  /** Fire a command without waiting for its response. */
  fire(command: PiCommand): void {
    invoke("pi_command", { record: command }).catch(() => {});
  }

  onEvent(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStateChange(fn: (s: PiState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  onExit(fn: () => void): () => void {
    this.exitListeners.add(fn);
    return () => this.exitListeners.delete(fn);
  }
}

export const rpc = new RpcClient();

// ---- Tauri command wrappers ----

export async function piStart(cwd: string): Promise<{ ok: boolean; error?: string }> {
  return invoke("pi_start", { cwd });
}

export async function piStop(): Promise<void> {
  await invoke("pi_stop");
}

export async function piState(): Promise<PiState> {
  return invoke("pi_state");
}

export interface SessionSummary {
  path: string;
  fileName: string;
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  name?: string;
  /** Preview from the first user message (preferred display title). */
  title?: string;
  messageCount: number;
  modifiedMs: number;
}

export async function listSessions(): Promise<SessionSummary[]> {
  return invoke("list_sessions");
}

export interface AppSettings {
  piPath?: string;
  defaultCwd?: string;
  theme?: ThemeSetting;
  recentWorkspaces?: string[];
}

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function setSettings(settings: AppSettings): Promise<void> {
  await invoke("set_settings", { settings });
}

export async function locatePi(explicit?: string): Promise<string> {
  return invoke("locate_pi", { explicit: explicit ?? null });
}
