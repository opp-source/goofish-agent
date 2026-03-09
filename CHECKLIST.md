# 开发检查清单

## 🚀 架构重构（v2.0.0）- 2026-03-09

### ✅ 已完成

**架构简化**
- ✅ 取消云端 Worker（Cloudflare Worker）
- ✅ 重构为单一 HTTP Server
- ✅ 移除 SSE 连接逻辑
- ✅ 删除 cloud-worker 目录
- ✅ 删除 cloud-client.js

**HTTP Server 实现**
- ✅ 端口：8888
- ✅ 健康检查接口：GET /health
- ✅ 状态查询接口：GET /status
- ✅ 消息接收接口：POST /api/message
- ✅ 浏览器心跳接口：POST /heartbeat/browser
- ✅ 配置查询接口：GET /api/config
- ✅ 消息列表接口：GET /api/messages
- ✅ Claude 状态接口：GET /api/claude/status

**状态管理**
- ✅ 状态持久化到 JSON 文件
- ✅ 服务器状态监控
- ✅ 浏览器状态监控
- ✅ Claude 状态监控
- ✅ 消息历史记录（最近 100 条）

**Web 控制台**
- ✅ 服务器运行状态
- ✅ 浏览器连接状态
- ✅ Claude Agent 状态
- ✅ 最近消息列表
- ✅ 自动刷新（30秒）

**浏览器注入脚本**
- ✅ 更新域名配置
- ✅ 心跳上报（60秒）
- ✅ 消息检测和上报

**文档更新**
- ✅ 更新 README.md
- ✅ 创建 Cloudflare Tunnel 配置指南
- ✅ 创建测试脚本

### 📝 待测试

- [x] 启动服务完整流程
- [ ] 浏览器注入脚本实际运行
- [ ] 端到端消息流转
- [ ] 状态持久化验证

### 🎯 下一步

1. **启动测试**
   ```bash
   cd local-daemon
   npm start
   ```

2. **运行测试脚本**
   ```bash
   ./test-server.sh
   ```

3. **测试浏览器注入**
   - 打开 https://www.goofish.com/im
   - 注入 cloud-integration.js
   - 验证心跳和消息上报

---

## 项目结构（v2.0.0）

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
│   ├── .env                  # 配置文件
│   └── .env.example          # 配置模板
├── sales-agent/              # Claude Agent 配置
│   └── .claude/
│       ├── agents/
│       │   └── goofish-agent/
│       │       └── AGENT.md  # Agent 定义
│       └── skills/
│           └── goofish-web/
│               └── scripts/
│                   └── cloud-integration.js  # 浏览器注入脚本
├── docs/                     # 文档
│   ├── architecture.md       # 架构设计
│   ├── api.md               # API 文档
│   └── quick-start.md       # 快速开始
├── test-server.sh           # 测试脚本
└── README.md                # 项目说明
```

## API 接口

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
Headers: X-API-Key: <your-api-key>
Body: {
  "sessionId": "xxx",
  "buyerName": "买家名称",
  "lastMessage": "最新消息",
  "unreadCount": 1,
  "timestamp": 1234567890
}
```

### 浏览器心跳
```bash
POST /heartbeat/browser
Body: {
  "timestamp": 1234567890,
  "status": "active",
  "unreadCount": 1
}
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| PORT | HTTP 服务端口 | 8888 |
| API_KEY | API 密钥 | - |
| TMUX_SESSION | tmux 会话名 | goofish-agent |
| CLAUDE_PATH | Claude 路径 | /usr/local/bin/claude |
| WORK_DIR | 工作目录 | 当前目录 |
| LOG_LEVEL | 日志级别 | info |
| MESSAGE_TIMEOUT | 处理超时(ms) | 300000 |

## 重要文件位置

### 配置文件
- 服务配置: `local-daemon/.env`
- Agent 配置: `sales-agent/.claude/agents/goofish-agent/AGENT.md`
- 状态数据: `local-daemon/data/state.json`

### 脚本文件
- 测试脚本: `test-server.sh`
- 浏览器注入: `sales-agent/.claude/skills/goofish-web/scripts/cloud-integration.js`

### 核心代码
- HTTP Server: `local-daemon/src/index.js`
- 状态管理: `local-daemon/src/state-manager.js`
- tmux 管理: `local-daemon/src/tmux-manager.js`

---

## 历史版本

### v1.0.0 (2026-03-08)
- 初始版本
- 云端 + 本地架构
- SSE 连接
- Durable Objects
- Queue 消息队列

### v2.0.0 (2026-03-09)
- 架构重构：取消云端
- 简化为单一 HTTP Server
- 状态持久化
- Web 控制台
- Cloudflare Tunnel 支持
