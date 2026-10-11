# pi-desk

[pi](https://pi.dev) 编码代理的桌面客户端。基于 **Tauri 2 + React 19 + TypeScript** 构建，通过 pi 的 RPC 模式驱动真实的 pi CLI。

## 架构

```text
┌─────────────┐   invoke/event   ┌──────────────┐   JSONL (stdin/stdout)   ┌─────────────────┐
│  React UI   │ ◄──────────────► │  Rust 桥接层  │ ◄──────────────────────► │ pi --mode rpc   │
│  (webview)  │                  │  (src-tauri) │                          │ (pi 子进程)      │
└─────────────┘                  └──────────────┘                          └─────────────────┘
```

- **前端**不直接与 pi 通信：所有 RPC 命令通过 `invoke("pi_command")` 写入 pi 的 stdin，pi 的 stdout 每行 JSON 经 Tauri event（`pi-event`）广播回前端
- **Rust 侧**负责 pi 子进程的生命周期（启动/优雅关闭/崩溃检测）、JSONL 帧解析、会话文件扫描、设置持久化
- 会话持久化由 pi 自己完成（`~/.pi/agent/sessions/`），pi-desk 只负责扫描与切换

## 功能

- 流式聊天（文本/思考块/工具调用展示）、steer 队列、Esc 中止
- 会话管理：列表（含首条消息预览标题）、切换、新建，长会话仅渲染最近 100 条
- 模型选择（按供应商分组的二级级联菜单）与思考等级切换
- 工作区：可搜索下拉快捷切换历史工作区，启动时自动恢复上次工作区
- 扩展审批：转发 pi 扩展的 confirm/select/input 请求为弹窗
- 主题：浅色 / 深色 / 跟随系统（含原生标题栏同步）
- git 分支显示、崩溃恢复横幅、全局快捷键（⌘N 新会话、⌘B 侧栏、⌘, 设置、Esc 中止）

## 环境要求

- [pi CLI](https://pi.dev)（`curl -fsSL https://pi.dev/install.sh | sh`），Node ≥ 22.19
- Rust toolchain、[bun](https://bun.sh)

## 开发

```bash
bun install
bun run tauri dev
```

## 构建

```bash
bun run tauri build   # 产出 .app 与 .dmg
```

## 测试与检查

```bash
bun run test          # vitest（store 逻辑）
bunx tsc --noEmit     # 类型检查
cargo check           # Rust 检查（在 src-tauri/ 下）
```

## 配置

设置存储于 `~/Library/Application Support/com.ake.pi-desk/pi-desk-settings.json`（`recentWorkspaces`、`theme`、`piPath`、`defaultCwd`）。pi 二进制默认自动探测（`~/.pi/agent/bin/pi` → PATH → 常见安装前缀），可在设置中手动指定。pi 的 stderr 日志写入 `~/Library/Logs/com.ake.pi-desk/pi-rpc-stderr.log`。

## 许可

MIT
