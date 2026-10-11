import { describe, expect, it, beforeEach } from "vitest";
import { useChatStore } from "./chatStore";

/** Feed a record through the same entry point the RPC client uses. */
function feed(record: Record<string, unknown>) {
  useChatStore.getState().handleRecord(record as never);
}

function state() {
  return useChatStore.getState();
}

describe("chatStore event aggregation", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("streams text deltas into an assistant item", () => {
    feed({ type: "message_start", message: { role: "assistant", content: [] } });
    feed({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Hello " },
    });
    feed({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "world" },
    });

    const items = state().items;
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("assistant");
    expect(items[0].text).toBe("Hello world");
    expect(items[0].streaming).toBe(true);
  });

  it("aggregates thinking deltas separately from text", () => {
    feed({ type: "message_start", message: { role: "assistant", content: [] } });
    feed({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "hmm " },
    });
    feed({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "answer" },
    });

    const item = state().items[0];
    expect(item.thinking).toBe("hmm ");
    expect(item.text).toBe("answer");
  });

  it("registers a tool call from message_update and finalizes it on end", () => {
    feed({ type: "message_start", message: { role: "assistant", content: [] } });
    feed({
      type: "message_update",
      assistantMessageEvent: {
        type: "tool_call",
        toolCallId: "call-1",
        toolName: "bash",
        arguments: { command: "ls" },
      },
    });
    feed({
      type: "tool_execution_end",
      toolCallId: "call-1",
      result: { content: [{ type: "text", text: "file.txt" }] },
      isError: false,
    });

    const tools = state().items[0].tools;
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      toolCallId: "call-1",
      toolName: "bash",
      status: "done",
      output: "file.txt",
    });
  });

  it("message_end finalizes the streaming item and stops streaming", () => {
    feed({ type: "message_start", message: { role: "assistant", content: [] } });
    feed({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "partial" },
    });
    feed({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "final text" }],
        model: { id: "glm-5" },
      },
    });

    const item = state().items[0];
    expect(item.text).toBe("final text");
    expect(item.streaming).toBe(false);
    expect(item.model).toBe("glm-5");
  });

  it("agent_settled resets run status and closes dangling streams", () => {
    feed({ type: "agent_start" });
    expect(state().runStatus).toBe("running");
    feed({ type: "message_start", message: { role: "assistant", content: [] } });
    feed({ type: "agent_settled", aborted: false });

    expect(state().runStatus).toBe("idle");
    expect(state().items[0].streaming).toBe(false);
  });

  it("adds echoed user messages exactly once", () => {
    feed({
      type: "message_end",
      message: { role: "user", content: "hi there" },
    });
    feed({
      type: "message_end",
      message: { role: "user", content: "hi there" },
    });

    expect(state().items.filter((i) => i.kind === "user")).toHaveLength(1);
  });

  it("run status goes running -> settling on retry -> idle on settle", () => {
    feed({ type: "agent_start" });
    feed({ type: "auto_retry_start", attempt: 1, maxAttempts: 3 });
    expect(state().runStatus).toBe("settling");
    feed({ type: "auto_retry_end", success: true, attempt: 2 });
    feed({ type: "agent_settled", aborted: false });
    expect(state().runStatus).toBe("idle");
  });

  it("attaches tool events arriving before any assistant item to a fresh item", () => {
    feed({
      type: "tool_execution_start",
      toolCallId: "call-early",
      toolName: "read",
      args: { path: "a.ts" },
    });
    const items = state().items;
    expect(items).toHaveLength(1);
    expect(items[0].tools[0]).toMatchObject({
      toolCallId: "call-early",
      toolName: "read",
      status: "running",
    });
  });
});
