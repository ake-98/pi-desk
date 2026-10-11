import { create } from "zustand";
import { rpc } from "@/lib/rpc/client";
import {
  contentBlockText,
  messageText,
  messageToolCalls,
  type PiRecord,
} from "@/lib/rpc/types";
import type {
  AgentMessage,
  AssistantMessageEvent,
  MessageEndEvent,
  MessageUpdateEvent,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
} from "@/lib/rpc/types";

export interface ToolEntry {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  status: "running" | "done" | "error";
  output: string;
}

export interface ChatItem {
  id: string;
  kind: "user" | "assistant" | "system";
  text: string;
  thinking: string;
  tools: ToolEntry[];
  streaming: boolean;
  model?: string;
}

export type RunStatus = "idle" | "running" | "queued" | "settling";

interface ChatState {
  items: ChatItem[];
  runStatus: RunStatus;
  lastError: string | null;
  totalTokens: number;
  totalCost: number;
  addItem: (item: ChatItem) => void;
  updateTool: (toolCallId: string, fn: (t: ToolEntry) => ToolEntry) => void;
  handleRecord: (record: PiRecord) => void;
  reset: () => void;
}

let itemSeq = 0;
function nextItemId(): string {
  itemSeq += 1;
  return `item-${itemSeq}`;
}

function newAssistantItem(): ChatItem {
  return {
    id: nextItemId(),
    kind: "assistant",
    text: "",
    thinking: "",
    tools: [],
    streaming: true,
  };
}

/**
 * Aggregates the pi event stream into renderable chat items.
 * Streaming deltas mutate the tail assistant item; `message_end`
 * finalizes content authoritatively.
 */
export const useChatStore = create<ChatState>((set, get) => ({
  items: [],
  runStatus: "idle",
  lastError: null,
  totalTokens: 0,
  totalCost: 0,

  addItem: (item) => set((s) => ({ items: [...s.items, item] })),

  updateTool: (toolCallId, fn) => {
    set((s) => {
      const items = [...s.items];
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item.kind !== "assistant") continue;
        const idx = item.tools.findIndex((t) => t.toolCallId === toolCallId);
        if (idx >= 0) {
          const tools = [...item.tools];
          tools[idx] = fn(tools[idx]);
          items[i] = { ...item, tools };
          return { items };
        }
      }
      // Tool event before any assistant item exists: attach to a fresh one.
      const tool: ToolEntry = {
        toolCallId,
        toolName: "tool",
        status: "running",
        output: "",
      };
      items.push({ ...newAssistantItem(), tools: [fn(tool)] });
      return { items };
    });
  },

  reset: () =>
    set({ items: [], runStatus: "idle", lastError: null, totalTokens: 0, totalCost: 0 }),

  handleRecord: (record) => {
    switch (record.type) {
      case "agent_start": {
        set({ runStatus: "running", lastError: null });
        break;
      }

      case "message_start": {
        const message = (record as { message?: AgentMessage }).message;
        if (message?.role === "assistant") {
          get().addItem(newAssistantItem());
        }
        break;
      }

      case "message_update": {
        const event = record as MessageUpdateEvent;
        const delta = event.assistantMessageEvent as AssistantMessageEvent | undefined;
        if (!delta) break;
        set((s) => {
          const items = [...s.items];
          // Tail assistant item receives streaming deltas.
          for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (item.kind !== "assistant") continue;
            items[i] = applyDelta(item, delta);
            return {
              items,
              totalTokens: event.usage?.totalTokens ?? s.totalTokens,
              totalCost: event.usage?.cost?.total ?? s.totalCost,
            };
          }
          // No assistant item yet: create one.
          const item = applyDelta(newAssistantItem(), delta);
          return { items: [...items, item] };
        });
        break;
      }

      case "message_end": {
        const { message } = record as MessageEndEvent;
        if (!message) break;
        if (message.role === "assistant") {
          set((s) => {
            const items = [...s.items];
            // Finalize the tail streaming assistant item; create if absent.
            for (let i = items.length - 1; i >= 0; i--) {
              const item = items[i];
              if (item.kind !== "assistant" || !item.streaming) continue;
              const toolCalls = messageToolCalls(message);
              items[i] = {
                ...item,
                text: messageText(message) || item.text,
                tools: toolCalls.length
                  ? toolCalls.map((tc, tcIdx) => ({
                      toolCallId: tc.id ?? `${item.id}-tc-${tcIdx}`,
                      toolName: tc.name ?? "tool",
                      args: tc.arguments,
                      status: "done" as const,
                      output: "",
                    }))
                  : item.tools,
                streaming: false,
                model: (message.model as { id?: string } | undefined)?.id ?? item.model,
              };
              return { items };
            }
            items.push({
              id: nextItemId(),
              kind: "assistant",
              text: messageText(message),
              thinking: "",
              tools: messageToolCalls(message).map((tc, idx) => ({
                toolCallId: tc.id ?? `${nextItemId()}-tc-${idx}`,
                toolName: tc.name ?? "tool",
                args: tc.arguments,
                status: "done" as const,
                output: "",
              })),
              streaming: false,
              model: (message.model as { id?: string } | undefined)?.id,
            });
            return { items };
          });
        } else if (message.role === "user") {
          // Echoed user message: add if we don't already show it.
          const text = messageText(message);
          set((s) => {
            const last = s.items[s.items.length - 1];
            if (last?.kind === "user" && last.text === text) return s;
            return {
              items: [
                ...s.items,
                {
                  id: nextItemId(),
                  kind: "user" as const,
                  text,
                  thinking: "",
                  tools: [],
                  streaming: false,
                },
              ],
            };
          });
        }
        break;
      }

      case "tool_execution_start": {
        const event = record as ToolExecutionStartEvent;
        set({ runStatus: "running" });
        get().updateTool(event.toolCallId, (t) => ({
          ...t,
          toolName: event.toolName,
          args: event.args,
          status: "running",
        }));
        break;
      }

      case "tool_execution_update": {
        const event = record as ToolExecutionUpdateEvent;
        get().updateTool(event.toolCallId, (t) => ({
          ...t,
          output: contentBlockText(event.partialResult) || t.output,
        }));
        break;
      }

      case "tool_execution_end": {
        const event = record as ToolExecutionEndEvent;
        get().updateTool(event.toolCallId, (t) => ({
          ...t,
          status: event.isError ? "error" : "done",
          output: contentBlockText(event.result) || t.output,
        }));
        break;
      }

      case "agent_settled": {
        set((s) => ({
          runStatus: "idle",
          items: s.items.map((it) => (it.streaming ? { ...it, streaming: false } : it)),
        }));
        break;
      }

      case "auto_retry_start": {
        const attempt = record.attempt as number;
        const max = record.maxAttempts as number;
        set({ runStatus: "settling", lastError: `retrying (${attempt}/${max})` });
        break;
      }

      case "auto_retry_end": {
        if (record.success === false) {
          set({ lastError: String(record.errorMessage ?? "request failed") });
        }
        break;
      }

      case "extension_error": {
        set({ lastError: String(record.error ?? "extension error") });
        break;
      }

      default:
        break;
    }
  },
}));

function applyDelta(item: ChatItem, delta: AssistantMessageEvent): ChatItem {
  switch (delta.type) {
    case "text_delta":
      return { ...item, text: item.text + delta.delta };
    case "thinking_delta":
      return { ...item, thinking: item.thinking + delta.delta };
    case "tool_call": {
      const toolCallId =
        typeof delta.toolCallId === "string"
          ? delta.toolCallId
          : `${item.id}-tc-${item.tools.length}`;
      if (item.tools.some((t) => t.toolCallId === toolCallId)) return item;
      return {
        ...item,
        tools: [
          ...item.tools,
          {
            toolCallId,
            toolName: typeof delta.toolName === "string" ? delta.toolName : "tool",
            args: delta.arguments,
            status: "running" as const,
            output: "",
          },
        ],
      };
    }
    default:
      return item;
  }
}

/** Render history from `get_messages` (used after loading a session). */
export function loadHistory(messages: AgentMessage[]): void {
  const all: ChatItem[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const text = messageText(message);
      if (!text) continue;
      all.push({
        id: nextItemId(),
        kind: "user",
        text,
        thinking: "",
        tools: [],
        streaming: false,
      });
    } else if (message.role === "assistant") {
      const text = messageText(message);
      const tools = messageToolCalls(message).map((tc, idx) => ({
        toolCallId: tc.id ?? `hist-${all.length}-${idx}`,
        toolName: tc.name ?? "tool",
        args: tc.arguments,
        status: "done" as const,
        output: "",
      }));
      if (!text && tools.length === 0) continue;
      all.push({
        id: nextItemId(),
        kind: "assistant",
        text,
        thinking: "",
        tools,
        streaming: false,
        model: (message.model as { id?: string } | undefined)?.id,
      });
    }
    // system/custom messages are pi-internal; skip.
  }

  // Long sessions would render hundreds of markdown blocks at once and
  // jank the UI; show the most recent slice and note the truncation.
  const MAX_HISTORY_ITEMS = 100;
  let items = all;
  if (all.length > MAX_HISTORY_ITEMS) {
    const omitted = all.length - MAX_HISTORY_ITEMS;
    items = [
      {
        id: nextItemId(),
        kind: "system",
        text: `历史较长，仅显示最近 ${MAX_HISTORY_ITEMS} 条消息（已省略 ${omitted} 条）`,
        thinking: "",
        tools: [],
        streaming: false,
      },
      ...all.slice(-MAX_HISTORY_ITEMS),
    ];
  }
  useChatStore.setState({ items, runStatus: "idle", lastError: null });
}

export function addUserMessage(text: string): void {
  useChatStore
    .getState()
    .addItem({ id: nextItemId(), kind: "user", text, thinking: "", tools: [], streaming: false });
}

export function addSystemNote(text: string): void {
  useChatStore
    .getState()
    .addItem({ id: nextItemId(), kind: "system", text, thinking: "", tools: [], streaming: false });
}

/** Wait until agent_settled before switching sessions — but only when a
 * run is actually active. When pi is idle no agent_settled will ever
 * arrive, so waiting would stall for the full timeout. */
export function waitForSettled(timeoutMs = 60_000): Promise<void> {
  if (useChatStore.getState().runStatus === "idle") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const unsub = rpc.onEvent((record) => {
      if (record.type === "agent_settled") {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });
    const timer = window.setTimeout(() => {
      unsub();
      resolve();
    }, timeoutMs);
  });
}
