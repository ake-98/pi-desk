import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";
import type { ChatItem, ToolEntry } from "@/stores/chatStore";

function ToolEntryRow({ tool }: { tool: ToolEntry }) {
  const [open, setOpen] = useState(false);
  const statusIcon =
    tool.status === "running" ? "◐" : tool.status === "error" ? "✗" : "✓";
  const argsSummary = summarizeArgs(tool.args);

  return (
    <div className="rounded-md border border-border bg-muted/40 text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/70"
      >
        <span
          className={cn(
            "font-mono",
            tool.status === "running" && "animate-pulse text-accent",
            tool.status === "error" && "text-red-400",
            tool.status === "done" && "text-emerald-500",
          )}
        >
          {statusIcon}
        </span>
        <span className="font-mono font-medium text-foreground">{tool.toolName}</span>
        <span className="truncate text-muted-foreground">{argsSummary}</span>
      </button>
      {open && (
        <div className="border-t border-border px-2.5 py-2">
          {tool.args != null && (
            <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          )}
          {tool.output && (
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/90">
              {tool.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function summarizeArgs(args: unknown): string {
  if (args == null || typeof args !== "object") return "";
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) return "";
  const first = entries[0];
  const value = typeof first[1] === "string" ? first[1] : JSON.stringify(first[1]);
  const text = value.length > 80 ? `${value.slice(0, 80)}…` : value;
  if (entries.length === 1) return text;
  return `${text} (+${entries.length - 1} more)`;
}

export const MessageItem = memo(function MessageItem({ item }: { item: ChatItem }) {
  if (item.kind === "user") {
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2 text-[14px] leading-relaxed">
          {item.text}
        </div>
      </div>
    );
  }

  if (item.kind === "system") {
    return (
      <div className="px-4 py-1">
        <p className="rounded-md border border-dashed border-border px-3 py-1.5 text-[12px] text-muted-foreground">
          {item.text}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 px-4 py-1.5">
      {item.thinking && (
        <details className="group">
          <summary className="cursor-pointer select-none text-[12px] text-muted-foreground hover:text-foreground">
            thinking {item.streaming && <span className="animate-pulse">…</span>}
          </summary>
          <div className="mt-1 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-[12.5px] leading-relaxed text-muted-foreground">
            {item.thinking}
          </div>
        </details>
      )}
      {item.tools.length > 0 && (
        <div className="space-y-1">
          {item.tools.map((tool) => (
            <ToolEntryRow key={tool.toolCallId} tool={tool} />
          ))}
        </div>
      )}
      {(item.text || (item.streaming && !item.thinking && item.tools.length === 0)) && (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {item.text || "…"}
          </ReactMarkdown>
          {item.streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse rounded-sm bg-accent align-text-bottom" />
          )}
        </div>
      )}
      {item.model && !item.streaming && (
        <div className="text-[11px] text-muted-foreground/60">{item.model}</div>
      )}
    </div>
  );
});
