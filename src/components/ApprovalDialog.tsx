import { useState } from "react";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "./ui";

/**
 * Minimal forwarding surface for pi extension UI requests (confirm/select/input).
 * Unsupported methods (e.g. `editor`) are cancelled automatically.
 */
export function ApprovalDialog() {
  const pending = useSessionStore((s) => s.pendingApproval);
  const resolve = useSessionStore((s) => s.resolveApproval);
  const [inputValue, setInputValue] = useState("");

  if (!pending) return null;
  const { request } = pending;

  const cancel = () => resolve({ cancelled: true });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[400px] rounded-xl border border-border bg-background p-4 shadow-2xl">
        <p className="mb-1 text-[14px] font-semibold">
          {request.title ?? "pi 需要你的确认"}
        </p>
        {request.message && (
          <p className="mb-3 whitespace-pre-wrap text-[13px] text-muted-foreground">
            {request.message}
          </p>
        )}

        {request.method === "confirm" && (
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => resolve({ confirmed: false })}>
              否
            </Button>
            <Button onClick={() => resolve({ confirmed: true })}>是</Button>
          </div>
        )}

        {request.method === "select" && (
          <div className="mt-3 flex flex-col gap-1.5">
            {(request.options ?? []).map((option) => (
              <Button
                key={option}
                variant="outline"
                className="justify-start"
                onClick={() => resolve({ value: option })}
              >
                {option}
              </Button>
            ))}
            <Button variant="ghost" onClick={cancel}>
              取消
            </Button>
          </div>
        )}

        {request.method === "input" && (
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              resolve({ value: inputValue });
              setInputValue("");
            }}
          >
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={request.placeholder}
              className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-[13px] outline-none focus:border-accent/60"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={cancel}>
                取消
              </Button>
              <Button type="submit">确定</Button>
            </div>
          </form>
        )}

        {(request.method === "editor" ||
          !["confirm", "select", "input"].includes(request.method)) && (
          <div className="mt-3">
            <p className="mb-2 text-[12px] text-muted-foreground/70">
              pi-desk 暂不支持此请求类型
            </p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={cancel}>
                关闭
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
