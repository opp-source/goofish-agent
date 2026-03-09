# 闲鱼销售 Agent 系统

自动化闲鱼店铺客服系统，基于 Claude Code + Cloudflare Worker 实现。

## 功能特性

- 自动监控买家消息
- 智能回复客户咨询
- 订单流程管理（待发货、待收货等）
- 异常情况 Telegram 告警
- Web 状态监控页面

## 系统架构

```
┌──────────────┐       ┌──────────────┐
│ 本地守护程序  │◄─────►│ 云端同步程序  │
│  (Node.js)   │  SSE  │ (CF Worker)  │
└──────┬───────┘       └──────┬───────┘
       │                       │
       ▼                       ▼
┌──────────────┐       ┌──────────────┐
│ Claude Agent │       │ Telegram Bot │
└──────┬───────┘       └──────────────┘
       │
       ▼
┌──────────────┐
│ 闲鱼网页     │
│ + 注入脚本   │
└──────────────┘
```

## 目录结构

```
goofish-agent/
├── .claude/                    # Claude 配置和技能
│   ├── CLAUDE.md              # Claude 职责规则
│   ├── .mcp.json              # MCP 配置
│   ├── skills/                # 技能目录
│   │   └── goofish-web/       # 闲鱼 Web 操作技能
│   │       ├── SKILL.md
│   │       ├── references/
│   │       └── scripts/
│   └── agents/                # Agent 目录
│       └── goofish-agent/     # 闲鱼销售 Agent
│           └── AGENT.md
├── local-daemon/              # 本地守护程序
│   ├── src/
│   ├── package.json
│   └── .env.example
├── cloud-worker/              # Cloudflare Worker
│   ├── src/
│   ├── wrangler.toml
│   └── package.json
├── docs/                      # 文档
│   ├── architecture.md        # 架构设计
│   ├── api.md                # API 文档
│   └── deployment.md         # 部署指南
└── README.md                  # 本文件
```

## 快速开始

### 方式 1: 使用部署脚本（推荐）

```bash
# 部署云端 Worker
./deploy.sh worker

# 配置本地环境
cd local-daemon
cp .env.example .env
# 编辑 .env 填入 Worker URL 和 API Key

# 部署本地守护程序
./deploy.sh daemon

# 测试部署
./test.sh all

# 启动系统
cd local-daemon && npm start
```

### 方式 2: 手动部署

```bash
# 1. 安装依赖
cd local-daemon && npm install
cd ../cloud-worker && npm install

# 2. 配置环境变量
cd ../local-daemon
cp .env.example .env
# 编辑 .env 填入配置

# 3. 部署 Worker
cd ../cloud-worker
wrangler kv:namespace create GOOFISH_KV
# 更新 wrangler.toml 中的 KV ID
wrangler deploy

# 4. 启动守护程序
cd ../local-daemon
npm start
```

详细步骤请查看 [快速启动指南](docs/quick-start.md) 或 [完整部署指南](docs/deployment.md)。

## 核心组件

### 本地守护程序

- 管理 tmux 会话和 Claude 进程
- 接收云端消息通知
- 向 Claude 发送处理指令
- 监控执行状态

### 云端同步程序

- 接收浏览器消息报告
- 通过 Cloudflare Queue 消息队列
- 管理客户端 SSE 连接
- 监控在线状态
- 发送 Telegram 告警

### Claude Agent

- 使用 devtools-mcp 操作浏览器
- 自动处理买家消息
- 管理订单流程
- 调用闲鱼 API

### 浏览器注入脚本

- 拦截 Fetch 请求检测新消息
- DOM 监听作为备用方案
- 向云端报告消息
- 定期发送心跳

## 消息处理流程

```
买家消息 → 闲鱼页面
         → 注入脚本检测
         → 云端同步程序
         → 本地守护程序
         → Claude Agent
         → 浏览器操作回复
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| CLOUD_WORKER_URL | Worker 地址 | ✅ |
| API_KEY | API 密钥 | ✅ |
| TMUX_SESSION | tmux 会话名 | ✅ |
| TELEGRAM_BOT_TOKEN | Telegram Bot Token | ❌ |
| TELEGRAM_CHAT_ID | Telegram Chat ID | ❌ |

### wrangler.toml

详见 [cloud-worker/wrangler.toml](cloud-worker/wrangler.toml)

## API 文档

详见 [API 文档](docs/api.md)

## 监控和告警

### 状态页面

访问 Worker 的 `/status` 端点查看系统状态。

### Telegram 告警

配置 Telegram Bot 后，系统会在以下情况发送告警：
- 浏览器离线
- 守护程序离线
- 消息处理失败

### 日志查看

```bash
# 守护程序日志
tail -f /tmp/goofish-daemon.log

# Worker 日志
cd cloud-worker && wrangler tail
```

## 开发指南

### 本地开发

```bash
# 启动守护程序（开发模式）
cd local-daemon
npm run dev

# 启动 Worker（本地）
cd cloud-worker
wrangler dev
```

### 测试

```bash
# 测试 Worker API
curl -X POST http://localhost:8787/api/message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test" \
  -d '{"type":"test"}'

# 测试 Telegram 通知
curl -X POST http://localhost:8787/admin/test-notification \
  -H "X-API-Key: test"
```

## 故障排查

详见 [部署指南 - 故障排查](docs/deployment.md#8-故障排查)

## 安全建议

- 使用强随机 API Key
- 定期更换密钥
- Telegram Bot 设置为私有
- 敏感信息使用 `wrangler secret`

## 更新日志

### v1.0.0 (2026-03-08)
- 初始版本
- 实现消息自动处理
- 实现监控告警
- 实现状态页面

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request。

## 联系方式

- 项目主页: [GitHub](https://github.com/your-repo/goofish-agent)
- 问题反馈: [Issues](https://github.com/your-repo/goofish-agent/issues)
