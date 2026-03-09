# 闲鱼销售 Agent 系统

自动化闲鱼店铺客服系统，基于 Claude Code 实现。

## 功能特性

- ✅ 自动监控买家消息
- ✅ 智能回复客户咨询
- ✅ 订单流程管理（待发货、待收货等）
- ✅ Web 状态监控页面（实时更新）
- ✅ 实时屏幕输出显示
- ✅ HTTP API 接口
- ✅ SSE 实时事件推送
- ✅ 状态持久化存储

## 系统架构

```
浏览器（闲鱼）+ 注入脚本
    ↓ HTTPS
Cloudflare Tunnel (goofish-agent.wgy.us.kg)
    ↓ HTTP localhost:8888
Agent Server (Node.js HTTP)
    ↓ tmux
Claude Agent
    ↓ devtools-mcp
浏览器回复客户
```

## 快速开始

### 1. 安装依赖

```bash
cd local-daemon
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件
```

关键配置：
- `PORT`: HTTP 服务端口（默认 8888）
- `API_KEY`: API 密钥（浏览器注入脚本需要使用）
- `TMUX_SESSION`: tmux 会话名称
- `CLAUDE_PATH`: Claude 可执行文件路径
- `WORK_DIR`: 工作目录（sales-agent 路径）

### 3. 启动服务

```bash
npm start
```

服务将在 `http://localhost:8888` 启动。

### 4. 访问控制台

- 本地访问：`http://localhost:8888/`
- 公网访问：`https://goofish-agent.wgy.us.kg/`

## 目录结构

```
goofish-agent/
├── local-daemon/              # Agent 服务端
│   ├── src/
│   │   ├── index.js          # HTTP Server 主程序
│   │   ├── tmux-manager.js   # tmux 管理
│   │   └── state-manager.js  # 状态持久化
│   ├── data/
│   │   └── state.json        # 状态数据文件
│   ├── package.json
│   └── .env
├── sales-agent/              # Claude Agent 配置
│   └── .claude/
│       ├── agents/
│       │   └── goofish-agent/
│       │       └── AGENT.md
│       └── skills/
│           └── goofish-web/
│               └── scripts/
│                   └── cloud-integration.js
└── README.md
```

## HTTP API 接口

### 健康检查

```bash
GET /health
```

### 状态查询

```bash
GET /status
```

### 接收消息

```bash
POST /api/message
Headers:
  X-API-Key: your-api-key
Body:
{
  "sessionId": "xxx",
  "buyerName": "买家名称",
  "buyerId": "xxx",
  "lastMessage": "最新消息",
  "unreadCount": 1,
  "timestamp": 1234567890
}
```

### 浏览器心跳

```bash
POST /heartbeat/browser
Body:
{
  "timestamp": 1234567890,
  "status": "active",
  "unreadCount": 1
}
```

### 获取 Agent 屏幕内容

```bash
GET /api/agent/screen
返回:
{
  "success": true,
  "screen": "Agent 的屏幕输出内容",
  "status": "running",
  "timestamp": 1234567890
}
```

### 浏览器上报消息列表

```bash
POST /api/browser/messages
Body:
{
  "messages": [
    {
      "sessionId": "xxx",
      "buyerName": "买家名称",
      "buyerId": "xxx",
      "lastMessage": "最新消息",
      "unreadCount": 1,
      "timestamp": 1234567890
    }
  ]
}
```

### 实时事件流（SSE）

```bash
GET /events
返回: Server-Sent Events 流，每 2 秒推送一次完整状态更新

Event 格式:
data: {
  "server": {...},
  "browser": {...},
  "claude": {...},
  "messages": {...},
  "agent": {
    "screen": "屏幕内容",
    "status": "运行状态"
  }
}
```

## 工作流程

### 初始化流程

1. 启动 Agent Server
2. 创建 tmux 会话
3. 启动 Claude Agent
4. Claude 打开闲鱼页面并注入脚本
5. 系统进入待命状态

### 消息处理流程

```
浏览器检测到新消息
    ↓
POST /api/message
    ↓
Agent Server 接收消息
    ↓
通过 tmux 发送指令给 Claude
    ↓
Claude 通过 devtools-mcp 操作浏览器回复
    ↓
继续监听新消息
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 必填 | 默认值 |
|--------|------|------|--------|
| PORT | HTTP 服务端口 | 否 | 8888 |
| API_KEY | API 密钥 | 是 | - |
| TMUX_SESSION | tmux 会话名 | 否 | goofish-agent |
| CLAUDE_PATH | Claude 路径 | 否 | /usr/local/bin/claude |
| WORK_DIR | 工作目录 | 否 | 当前目录 |
| LOG_LEVEL | 日志级别 | 否 | info |
| MESSAGE_TIMEOUT | 处理超时 | 否 | 300000 |

## 公网访问

系统通过 Cloudflare Tunnel 提供公网 HTTPS 访问：

- 域名：`https://goofish-agent.wgy.us.kg`
- 指向：`http://localhost:8888`

## 故障排查

### 端口被占用

```bash
lsof -i :8888
```

### Claude 启动失败

检查 Claude 路径：
```bash
which claude
```

### 浏览器注入失败

确保：
1. 在正确的页面（`https://www.goofish.com/im`）
2. API_KEY 配置正确
3. 域名可访问

## 更新日志

### v2.1.0 (2026-03-09)

- ✨ 新增实时屏幕监控：自动刷新 Cloud Agent 屏幕输出
- ✨ 新增 SSE 实时推送：页面自动更新，无需手动刷新
- ✨ 新增浏览器上报消息 API：支持批量上报最近消息
- 🎨 改进控制台界面：增加屏幕输出显示，去掉手动刷新按钮
- ⚡ 优化性能：使用 SSE 替代轮询，减少服务器负载

### v2.0.0 (2026-03-09)

- 🎉 架构重构：取消云端 Worker，简化为单一服务端
- ✨ 新增 HTTP API 接口
- ✨ 新增 Web 控制台
- ✨ 新增状态持久化
- 🗑️ 移除云端依赖

### v1.0.0 (2026-03-08)

- 初始版本
- 实现消息自动处理

## 许可证

MIT
