import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getSettings, locatePi } from "@/lib/rpc/client";
import type { ThemeSetting } from "@/lib/theme";
import { cn, settingsShortcutLabel } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "./ui";

const THEME_OPTIONS: Array<{ value: ThemeSetting; label: string }> = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const saveSettings = useSessionStore((s) => s.saveSettings);
  const [piPath, setPiPath] = useState("");
  const [theme, setTheme] = useState<ThemeSetting>("system");
  const [detected, setDetected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const settings = await getSettings();
      setPiPath(settings.piPath ?? "");
      setTheme(settings.theme ?? "system");
      try {
        setDetected(await locatePi(settings.piPath || undefined));
        setError(null);
      } catch (err) {
        setDetected(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setPiPath(`${selected}/pi`);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings({
        piPath: piPath.trim() || undefined,
        defaultCwd: useSessionStore.getState().settings.defaultCwd,
        theme,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[440px] rounded-xl border border-border bg-background p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] font-semibold">设置</p>
          <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground/70">
            {settingsShortcutLabel()}
          </span>
        </div>

        <label className="mb-1 block text-[12px] text-muted-foreground">
          pi 二进制路径（留空自动检测）
        </label>
        <div className="flex gap-2">
          <input
            value={piPath}
            onChange={(e) => setPiPath(e.target.value)}
            placeholder="e.g. /usr/local/bin/pi"
            className="flex-1 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-accent/60"
          />
          <Button variant="outline" size="sm" onClick={pickFolder}>
            浏览
          </Button>
        </div>

        <p className="mt-2 text-[12px]">
          {detected && (
            <span className="text-emerald-500">已找到：{detected}</span>
          )}
          {error && <span className="text-red-400">{error}</span>}
        </p>

        <label className="mb-1 mt-4 block text-[12px] text-muted-foreground">主题</label>
        <div className="flex gap-1.5">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-[12.5px] transition-colors",
                theme === option.value
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground/60">
          跟随系统时，切换 macOS 外观会实时同步
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
