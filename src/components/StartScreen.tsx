import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "./ui";

/** Full-window state shown when pi is not running. */
export function StartScreen() {
  const startPi = useSessionStore((s) => s.startPi);
  const startError = useSessionStore((s) => s.startError);
  const settings = useSessionStore((s) => s.settings);
  const [picking, setPicking] = useState(false);

  const pick = async () => {
    setPicking(true);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        await startPi(selected);
      }
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">pi-desk</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          选择一个工作区文件夹，开始 pi 会话
        </p>
      </div>
      <Button size="md" onClick={pick} disabled={picking}>
        {picking ? "启动中…" : "选择工作区…"}
      </Button>
      {startError && (
        <p className="max-w-md rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-center text-[12.5px] text-red-400">
          {startError}
        </p>
      )}
      {!startError && settings.piPath == null && (
        <p className="text-[11px] text-muted-foreground/60">
          需要安装 pi CLI——若未安装，可在设置中指定自定义路径
        </p>
      )}
    </div>
  );
}
