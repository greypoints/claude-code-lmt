# Claude Code + Cursor 集成指南

## 已完成的安装

- **Claude Code CLI**: 2.1.150（通过 WinGet 安装）
- **Cursor 扩展**: `anthropic.claude-code` 2.1.150

## 首次使用

### 1. 重启 Cursor

完全关闭并重新打开 Cursor，让 PATH 和扩展生效。

### 2. 登录 Anthropic 账号

需要 **Claude Pro / Max / Team / Enterprise / Console (API)** 账号。免费 Claude.ai 计划不包含 Claude Code。

**方式 A — 图形界面（推荐）**

1. 在 Cursor 中打开任意代码文件
2. 点击编辑器右上角的 **Spark（✱）** 图标，或左侧活动栏的 Claude 图标
3. 点击 **Sign in**，在浏览器中完成授权

**方式 B — 终端**

1. 在 Cursor 内置终端（`` Ctrl+` ``）中运行：

```powershell
claude
```

2. 按提示在浏览器中登录

### 3. 验证 IDE 集成

在 Cursor **内置终端**中运行：

```powershell
claude
```

CLI 会自动连接 Cursor，支持 diff 预览、@-mention 选中文本、诊断信息等。

若在外部终端使用，可在 Claude Code 会话中输入 `/ide` 手动连接。

## 常用快捷键（Windows）

| 操作 | 快捷键 |
|------|--------|
| 打开 Claude Code 面板 | 编辑器右上角 Spark 图标 |
| 命令面板 | `Ctrl+Shift+P` → 输入 "Claude Code" |
| 在编辑器与 Claude 间切换焦点 | `Ctrl+Esc` |
| 插入 @-mention 引用 | `Alt+K`（需先选中代码） |
| 新建对话标签 | `Ctrl+Shift+Esc` |

## 更新

```powershell
# 更新 CLI（WinGet 安装）
winget upgrade Anthropic.ClaudeCode

# 更新 Cursor 扩展：扩展面板搜索 Claude Code → 更新
```

## 故障排除

**`claude` 命令找不到**

- 关闭并重新打开终端 / Cursor
- 确认 PATH 包含 WinGet 包路径

**扩展未显示 Spark 图标**

1. 打开一个文件（仅打开文件夹不够）
2. `Ctrl+Shift+P` → `Developer: Reload Window`
3. 检查扩展是否已启用：`Ctrl+Shift+X` → 搜索 "Claude Code"

**IDE 未连接**

- 必须在 Cursor **内置终端**运行 `claude`，不要用外部 PowerShell
- 确保已安装 `anthropic.claude-code` 扩展

**网络问题**

若官方安装脚本 `irm https://claude.ai/install.ps1 | iex` 失败，可使用 WinGet：

```powershell
winget install Anthropic.ClaudeCode
```

## 参考文档

- [Claude Code 官方文档](https://code.claude.com/docs)
- [VS Code / Cursor 集成说明](https://code.claude.com/docs/en/ide-integrations)
