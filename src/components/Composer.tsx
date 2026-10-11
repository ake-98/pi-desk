import { useCallback, useRef, useState } from "react";
import { rpc } from "@/lib/rpc/client";
import { cn } from "@/lib/utils";
import { addUserMessage, addSystemNote, useChatStore } from "@/stores/chatStore";
import { ComposerStatus } from "./ComposerStatus";
import { Button, Textarea } from "./ui";

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5m0 0l-6 6m6-6l6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2.5" />
    </svg>
  );
}

export function Composer({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState("");
  const runStatus = useChatStore((s) => s.runStatus);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const running = runStatus !== "idle";

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;

    if (!running) {
      addUserMessage(text);
      rpc
        .send({ type: "prompt", message: text })
        .then((res) => {
          if (!res.success) {
            addSystemNote(`发送失败：${res.error ?? "未知错误"}`);
          } else {
            const disposition = (
              res.data as { disposition?: string } | undefined
            )?.disposition;
            if (disposition === "handled") {
              useChatStore.setState({ runStatus: "idle" });
            } else {
              useChatStore.setState({ runStatus: "running" });
            }
          }
        })
        .catch((err: Error) => addSystemNote(err.message));
    } else {
      // Steer: queue into the active run.
      addSystemNote(`引导消息：${text}`);
      rpc.send({ type: "steer", message: text }).catch(() => {});
    }
    setValue("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [value, running, disabled]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const abort = useCallback(() => {
    rpc.send({ type: "abort" }).catch(() => {});
  }, []);

  return (
    <div className="border-t border-border bg-background/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            "flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2",
            "focus-within:border-accent/50",
          )}
        >
          <Textarea
            ref={textareaRef}
            rows={1}
            value={value}
            disabled={disabled}
            placeholder={
              running ? "引导当前运行（Enter 排队发送）…" : "给 pi 发送消息…"
            }
            className="max-h-40 min-h-[24px]"
            onChange={(e) => {
              setValue(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
            onKeyDown={onKeyDown}
          />
          {running ? (
            <Button
              variant="danger"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              onClick={abort}
              title="Stop"
              aria-label="Stop"
            >
              <StopIcon />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              onClick={submit}
              disabled={!value.trim() || disabled}
              title="Send"
              aria-label="Send"
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
        <ComposerStatus />
      </div>
    </div>
  );
}
