/**
 * Loose typings for the pi RPC JSONL protocol (subset used by pi-desk).
 * Mirrors pi's rpc-types; unknown fields are preserved as `unknown`.
 */

export interface PiRecord {
  type: string;
  [key: string]: unknown;
}

export interface PiResponse extends PiRecord {
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
  id?: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
  provider: string;
  contextWindow?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface SessionStats {
  tokens?: { input?: number; output?: number; totalTokens?: number };
  cost?: { total?: number };
  [key: string]: unknown;
}

/** assistantMessageEvent variants we care about */
export type AssistantMessageEvent =
  | { type: "text_start"; contentIndex: number }
  | { type: "text_delta"; contentIndex: number; delta: string }
  | { type: "text_end"; contentIndex: number }
  | { type: "thinking_start"; contentIndex: number }
  | { type: "thinking_delta"; contentIndex: number; delta: string }
  | { type: "thinking_end"; contentIndex: number }
  | { type: "tool_call"; contentIndex: number; toolCallId?: string; toolName?: string; arguments?: unknown }
  | { type: string; [key: string]: unknown };

export interface MessageUpdateEvent extends PiRecord {
  type: "message_update";
  usage?: {
    totalTokens?: number;
    cost?: { total?: number };
    [key: string]: unknown;
  };
  assistantMessageEvent: AssistantMessageEvent;
}

export interface MessageEndEvent extends PiRecord {
  type: "message_end";
  message: AgentMessage;
}

export interface ToolExecutionStartEvent extends PiRecord {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args?: unknown;
}

export interface ToolExecutionUpdateEvent extends PiRecord {
  type: "tool_execution_update";
  toolCallId: string;
  toolName?: string;
  partialResult?: { content?: ContentBlock[]; [key: string]: unknown };
}

export interface ToolExecutionEndEvent extends PiRecord {
  type: "tool_execution_end";
  toolCallId: string;
  toolName?: string;
  result?: { content?: ContentBlock[]; [key: string]: unknown };
  isError?: boolean;
}

export interface AgentSettledEvent extends PiRecord {
  type: "agent_settled";
  aborted?: boolean;
}

export interface ExtensionUiRequest extends PiRecord {
  type: "extension_ui_request";
  id: string;
  method: "select" | "confirm" | "input" | "editor" | string;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  timeout?: number;
}

export interface AgentMessage {
  role: "user" | "assistant" | "system" | string;
  content: string | ContentBlock[];
  stopReason?: string;
  usage?: { totalTokens?: number; [key: string]: unknown };
  model?: { id?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; id?: string; name?: string; arguments?: unknown }
  | { type: string; [key: string]: unknown };

/** Commands we send to pi (type field + optional payload). */
export type PiCommand =
  | { type: "prompt"; message: string }
  | { type: "steer"; message: string }
  | { type: "follow_up"; message: string }
  | { type: "abort" }
  | { type: "clear_queue" }
  | { type: "new_session" }
  | { type: "get_state" }
  | { type: "get_messages" }
  | { type: "get_available_models" }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "get_available_thinking_levels" }
  | { type: "set_thinking_level"; level: string }
  | { type: "switch_session"; sessionPath: string }
  | { type: "set_session_name"; name: string }
  | { type: "get_session_stats" }
  | { type: "compact" }
  | { type: "extension_ui_response"; [key: string]: unknown }
  | { type: string; [key: string]: unknown };

export interface Disposition {
  disposition?: "handled" | "queued" | "steering" | "follow-up" | string;
}

/** Extract text from a message's content blocks. */
export function messageText(message: AgentMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
}

/** Extract toolCall blocks from an assistant message. */
export function messageToolCalls(message: AgentMessage | undefined) {
  if (!message || typeof message.content === "string") return [];
  return message.content.filter((b) => b.type === "toolCall") as Array<{
    type: "toolCall";
    id?: string;
    name?: string;
    arguments?: unknown;
  }>;
}

export function contentBlockText(result: { content?: ContentBlock[] } | undefined): string {
  if (!result?.content) return "";
  return result.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
}
