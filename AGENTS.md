# AGENTS.md

面向编码代理的本仓库说明。pi-desk 是 pi 编码代理（`@earendil-works/pi-coding-agent`）的 Tauri 2 桌面客户端。

## 架构（改代码前必读）

```text
React UI (src/) ←invoke/event→ Rust 桥接 (src-tauri/) ←JSONL stdin/stdout→ pi --mode rpc 子进程
```

- 前端永不直接 spawn pi 或解析 JSON：一切经 Rust 桥接层
- Rust 的 `pi_process.rs` 是唯一拥有 pi 子进程的模块；`send()` 是唯一写 stdin 的入口
- RPC 请求/响应按 `id` 关联；session 事件无 id，直接广播到前端（`pi-event`）
- 会话文件由 pi 自己持久化（`~/.pi/agent/sessions/<encoded-cwd>/*.jsonl`）；`list_sessions` 是 Rust 自实现的目录扫描（RPC 协议没有列会话命令）

## 常用命令

```bash
bun run tauri dev      # 开发（Vite 端口 1420 固定）
bun run tauri build    # 打包 .app / .dmg
bun run test           # vitest（src/**/*.test.ts）
bunx tsc --noEmit      # 类型检查
cargo check            # 在 src-tauri/ 下运行
```

提交前门槛：`cargo check`、`tsc --noEmit`、`bun run test`、`bun run build` 全部通过。

## 代码结构

- `src-tauri/src/pi_process.rs` — pi 子进程生命周期、JSONL 帧、PATH 增强、二进制定位
- `src-tauri/src/commands.rs` — 全部 Tauri invoke 命令（注册在 `lib.rs`）
- `src-tauri/src/session_scan.rs` — 会话文件扫描/标题预览提取
- `src-tauri/src/settings.rs` — 设置 JSON 读写（app_data_dir）
- `src/lib/rpc/` — RPC 类型与客户端（id 关联、事件订阅）
- `src/stores/` — zustand：`chatStore`（事件聚合为聊天项）、`sessionStore`（进程/设置/模型/审批）
- `src/components/` — UI；`ComposerStatus.tsx` 是输入框下方的模型/思考/git 状态条

## 硬性约定与已知陷阱

1. **zustand v5 + React 19**：选择器禁止返回新引用（如 `(s) => s.list ?? []` 会白屏）。选择原始稳定值，`?? []` 放选择器外
2. **JSONL 帧**：仅 LF 是记录边界（不可用按 Unicode 分隔的读行器），可选 CR 剥离；stdout 必须持续读取防背压
3. **pi 启动参数**：不要加 `--no-session`（会话会丢失）；子进程必须注入 `augmented_path()`（GUI 应用的最小 PATH 会导致 `env: node` 失败）
4. **UI 文案用中文**；设置变更（主题等）必须在保存时生效，弹窗内选择不即时应用
5. **主题**：颜色走 CSS 变量（`@theme inline` + `:root` / `:root.light`），不要硬编码 hex
6. **approval**：只对 `extension_ui_request` 中的 dialog 方法（select/confirm/input/editor）弹窗，fire-and-forget（setWidget/setStatus 等）必须忽略
7. **长历史**：`loadHistory` 截断最近 100 条并提示，避免 Markdown 全量渲染卡顿
8. **版本对齐**：tauri npm 包与 Rust crate 需同 minor（npm 领先时降 npm，crate 升级受 rustc 版本约束）
9. 长会话切换前先 `waitForSettled`（空闲时立即返回，不得死等超时）
