import { useEffect, useRef } from "react";
import { MessageItem } from "./MessageItem";
import { useChatStore } from "@/stores/chatStore";

export function ChatView() {
  const items = useChatStore((s) => s.items);
  const runStatus = useChatStore((s) => s.runStatus);
  const lastError = useChatStore((s) => s.lastError);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      pinnedToBottom.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (pinnedToBottom.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [items]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl pb-4 pt-2">
        {items.length === 0 && (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-1 text-muted-foreground">
            <p className="text-lg font-medium text-foreground/80">pi-desk</p>
            <p className="text-[13px]">向 pi 发送消息，让它在这个工作区工作</p>
          </div>
        )}
        {items.map((item) => (
          <MessageItem key={item.id} item={item} />
        ))}
        {runStatus === "settling" && (
          <div className="px-4 py-1 text-[12px] text-amber-500">请求重试中…{lastError}</div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
