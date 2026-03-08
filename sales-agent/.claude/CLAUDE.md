# 闲鱼销售 Agent 项目规则

## 技能配置

本项目启用以下技能：

| 技能 | 路径 | 作用 |
|------|------|------|
| 闲鱼 Web | `skills/goofish-web/` | 提供闲鱼网页操作能力 |

## Agent 配置

本项目配置以下 Agent：

| Agent | 路径 | 作用 |
|-------|------|------|
| 闲鱼销售 Agent | `agents/goofish-agent/` | 自动处理买家消息和订单 |

## 系统架构

```
本地守护程序 (Node.js)
    ↓ tmux
Claude Agent
    ↓ devtools-mcp
闲鱼网页 + 注入脚本
    ↓ HTTP
云端同步程序 (Cloudflare Worker)
```

## 使用流程

### 初始化流程
1. 本地守护程序启动
2. 通过 tmux 启动 Claude
3. Claude 加载 Agent 文件
4. 打开闲鱼页面并注入脚本
5. 系统进入待命状态

### 消息处理流程
1. 注入脚本检测新消息
2. 报告到云端
3. 云端通知本地守护程序
4. 守护程序通知 Claude
5. Claude 处理并回复

## 配置文件

- `local-daemon/.env`: 本地守护程序配置
- `cloud-worker/wrangler.toml`: Worker 配置
- `.mcp.json`: MCP 服务器配置

## 注意事项

- 首次使用需手动登录闲鱼
- 保持浏览器页面打开
- 定期检查系统状态
- 注意 API Key 安全
