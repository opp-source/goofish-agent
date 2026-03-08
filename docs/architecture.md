# 咸鱼销售 Agent 系统架构设计

## 1. 系统概述

### 1.1 系统目标
构建一个自动化的闲鱼销售客服系统，能够：
- 自动监控买家消息
- 智能回复客户咨询
- 管理订单流程（待发货、待收货等）
- 异常情况及时通知人工

### 1.2 核心组件
```
┌─────────────────────────────────────────────────────────────┐
│                     闲鱼销售 Agent 系统                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐       ┌──────────────┐                   │
│  │ 本地守护程序  │◄─────►│ 云端同步程序  │                   │
│  │  (Node.js)   │  SSE  │ (CF Worker)  │                   │
│  └──────┬───────┘       └──────┬───────┘                   │
│         │                       │                           │
│         │ tmux                  │ 监控                      │
│         ▼                       ▼                           │
│  ┌──────────────┐       ┌──────────────┐                   │
│  │ Claude Agent │       │ Telegram Bot │                   │
│  │  (浏览器)    │       │   (告警)     │                   │
│  └──────┬───────┘       └──────────────┘                   │
│         │                                                     │
│         │ devtools-mcp                                        │
│         ▼                                                     │
│  ┌──────────────┐                                            │
│  │ 闲鱼网页     │                                            │
│  │ + 注入脚本   │                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

## 2. 数据流设计

### 2.1 初始化流程
```
1. launchd 启动本地守护程序
   ↓
2. 本地守护程序检查 tmux 会话
   ↓
3. 通过 tmux 启动 Claude
   ↓
4. Claude 加载 .claude/agents/goofish-agent/AGENT.md
   ↓
5. Agent 调用 devtools-mcp 打开闲鱼页面
   ↓
6. 注入消息监听脚本
   ↓
7. 脚本向云端同步程序报告在线
   ↓
8. 系统进入待命状态
```

### 2.2 消息处理流程
```
买家消息
   ↓
闲鱼页面 (Fetch拦截/DOM监听)
   ↓
注入脚本检测
   ↓
调用云端同步程序 API
   ↓
云端通过 Durable Objects Pub/Sub
   ↓
本地守护程序 SSE 接收
   ↓
tmux send-keys 向 Claude 发送指令
   ↓
Claude Agent 处理消息
   ↓
通过 devtools-mcp 操作浏览器回复
   ↓
处理完成
```

### 2.3 监控告警流程
```
定时任务 (每分钟)
   ↓
检查浏览器心跳 (3分钟间隔)
   ↓
检查本地守护程序心跳 (SSE连接状态)
   ↓
任一离线？
   ├─ 是 → 发送 Telegram 告警
   └─ 否 → 更新 KV 状态
```

## 3. 核心技术方案

### 3.1 消息检测方案

#### 主方案：Fetch拦截
```javascript
// 在闲鱼页面中注入
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  const url = args[0];
  
  if (typeof url === 'string' && url.includes('idlemessage')) {
    const clonedResponse = response.clone();
    const data = await clonedResponse.json();
    
    if (url.includes('message.sync')) {
      // 检测到新消息，向云端报告
      await reportToCloud(data);
    }
  }
  
  return response;
};
```

#### 备用方案：DOM监听
```javascript
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      // 检测新消息
      checkNewMessages(mutation.addedNodes);
    }
  }
});
```

### 3.2 通信机制

#### 本地守护程序 ↔ 云端同步程序
- **方案**：SSE (Server-Sent Events)
- **优势**：
  - 单向推送，实时性好
  - 自动重连
  - 节省资源

```javascript
// 本地守护程序
const eventSource = new EventSource('https://worker.example.com/events');

eventSource.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleNewMessage(message);
};
```

#### 浏览器注入脚本 → 云端同步程序
- **方案**：HTTP POST
- **跨域**：在 Worker 中设置 CORS 头允许闲鱼域

```javascript
// Worker 响应头
headers: {
  'Access-Control-Allow-Origin': 'https://www.goofish.com',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type'
}
```

#### Claude ↔ 本地守护程序
- **方案**：tmux send-keys
- **实现**：
```javascript
// 本地守护程序发送命令
exec(`tmux send-keys -t goofish-agent "请处理买家消息：${messageContent}" Enter`);
```

### 3.3 Durable Objects 设计

#### Pub/Sub 实现
```javascript
export class MessagePubSub {
  constructor(state) {
    this.state = state;
    this.connections = new Set();
  }
  
  // 发布消息
  async publish(message) {
    for (const connection of this.connections) {
      connection.send(JSON.stringify(message));
    }
  }
  
  // 订阅
  subscribe(connection) {
    this.connections.add(connection);
  }
}
```

### 3.4 心跳机制

#### 浏览器心跳
- **间隔**：3分钟
- **检测**：6分钟未收到心跳则判定离线
- **实现**：
```javascript
// 注入脚本中
setInterval(async () => {
  await fetch('https://worker.example.com/heartbeat/browser', {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY }
  });
}, 3 * 60 * 1000);
```

#### 本地守护程序心跳
- **方式**：SSE 连接状态
- **实现**：Worker 检测 SSE 连接是否存活

### 3.5 超时处理

#### tmux send-keys 超时
```javascript
function sendKeysWithTimeout(command, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('tmux send-keys timeout'));
    }, timeout);
    
    exec(`tmux send-keys -t goofish-agent "${command}" Enter`, (error) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    });
  });
}
```

## 4. 组件详细设计

### 4.1 本地守护程序 (local-daemon)

#### 职责
- 管理 tmux 会话和 Claude 进程
- 接收云端消息通知
- 向 Claude 发送处理指令
- 监控 Claude 执行状态

#### 主要模块
```
local-daemon/
├── src/
│   ├── index.js           # 主进程
│   ├── tmux-manager.js    # tmux 管理
│   ├── claude-bridge.js   # Claude 通信桥接
│   ├── cloud-client.js    # 云端客户端 (SSE)
│   └── config.js          # 配置管理
├── package.json
└── .env.example           # 环境变量模板
```

#### 关键代码结构
```javascript
// index.js
class LocalDaemon {
  constructor() {
    this.tmuxManager = new TmuxManager();
    this.cloudClient = new CloudClient();
    this.isProcessing = false;
  }
  
  async start() {
    // 1. 初始化 tmux 会话
    await this.tmuxManager.init();
    
    // 2. 启动 Claude
    await this.tmuxManager.startClaude();
    
    // 3. 连接云端
    await this.cloudClient.connect();
    
    // 4. 监听消息
    this.cloudClient.on('new_message', this.handleNewMessage.bind(this));
  }
  
  async handleNewMessage(message) {
    if (this.isProcessing) {
      console.log('正在处理其他消息，忽略');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // 发送指令给 Claude
      await this.tmuxManager.sendToClaude(
        `有新的买家消息，请处理：\n${JSON.stringify(message, null, 2)}`
      );
      
      // 等待处理完成（通过检测 Claude 输出或设置超时）
      await this.waitForCompletion();
      
    } catch (error) {
      console.error('处理失败:', error);
      // 发送失败通知到云端
      await this.cloudClient.reportError(error);
    } finally {
      this.isProcessing = false;
    }
  }
}
```

### 4.2 云端同步程序 (cloud-worker)

#### 职责
- 接收浏览器消息报告
- 通过 Durable Objects 发布消息
- 管理客户端 SSE 连接
- 监控在线状态
- 发送 Telegram 告警

#### 主要模块
```
cloud-worker/
├── src/
│   ├── index.js            # Worker 入口
│   ├── durable-object.js   # Durable Object 实现
│   ├── monitor.js          # 监控任务
│   ├── telegram.js         # Telegram 通知
│   └── status-page.js      # 状态页面
├── wrangler.toml           # Worker 配置
└── package.json
```

#### API 设计
```
POST /api/message
  - 接收浏览器消息报告
  - Body: { type, sessionId, buyerId, ... }
  - 通过 Durable Objects 发布

GET /events
  - SSE 连接端点
  - 返回实时消息推送

POST /heartbeat/browser
  - 浏览器心跳
  - 更新 KV 存储

GET /status
  - 获取系统状态
  - 返回：浏览器在线、守护程序在线、最近消息

POST /admin/restart-browser
  - 手动触发重启浏览器

POST /admin/test-notification
  - 测试 Telegram 通知
```

#### Durable Objects 实现
```javascript
export class MessagePubSub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }
  
  async fetch(request) {
    const url = new URL(request.url);
    
    // SSE 连接
    if (url.pathname === '/connect') {
      return this.handleSSE(request);
    }
    
    // 发布消息
    if (url.pathname === '/publish') {
      const message = await request.json();
      return this.publish(message);
    }
    
    return new Response('Not Found', { status: 404 });
  }
  
  async handleSSE(request) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    
    // 保存连接
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, writer);
    
    // 发送初始消息
    await writer.write(new TextEncoder().encode('data: connected\n\n'));
    
    // 返回 SSE 流
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
  
  async publish(message) {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    
    for (const [sessionId, writer] of this.sessions) {
      try {
        await writer.write(new TextEncoder().encode(data));
      } catch (error) {
        // 连接已断开
        this.sessions.delete(sessionId);
      }
    }
    
    return new Response('OK');
  }
}
```

#### 监控任务
```javascript
export async function scheduled(event, env, ctx) {
  const kv = env.GOOFISH_KV;
  
  // 获取最后心跳时间
  const lastBrowserHeartbeat = await kv.get('heartbeat:browser');
  const lastDaemonHeartbeat = await kv.get('heartbeat:daemon');
  
  const now = Date.now();
  
  // 检查浏览器状态 (6分钟无心跳则离线)
  if (lastBrowserHeartbeat && now - parseInt(lastBrowserHeartbeat) > 6 * 60 * 1000) {
    await sendTelegramAlert(env, '⚠️ 浏览器已离线，请检查');
    
    // 更新状态
    await kv.put('status:browser', 'offline');
  }
  
  // 检查守护程序状态 (SSE 连接断开则离线)
  const daemonConnected = await checkDaemonConnection(env);
  if (!daemonConnected) {
    await sendTelegramAlert(env, '⚠️ 本地守护程序已离线');
    await kv.put('status:daemon', 'offline');
  }
}
```

### 4.3 Agent 文件结构

#### 目录结构
```
.claude/
├── CLAUDE.md                     # Claude 职责规则
├── .mcp.json                     # MCP 配置
├── skills/                       # 技能目录
│   └── goofish-web/
│       ├── SKILL.md             # 闲鱼 Web 操作技能
│       ├── references/
│       │   ├── xianyu-site-guide.md
│       │   ├── goofish-api-reference.md
│       │   └── message-listening-guide.md
│       └── scripts/
│           ├── message-listener.js
│           └── goofish-api.js
└── agents/                       # Agent 目录
    └── goofish-agent/
        └── AGENT.md             # Agent 定义
```

#### AGENT.md 内容
```markdown
---
name: goofish-agent
description: 闲鱼销售客服Agent，自动处理买家消息和订单管理
---

# 闲鱼销售 Agent

你是一名闲鱼店铺的自动客服，负责实时处理买家消息和订单管理。

## 核心职责

1. 监控消息：检测新买家消息
2. 智能回复：根据买家意图提供回复
3. 订单管理：处理发货、确认收货等流程
4. 异常上报：遇到问题及时通知

## 工作流程

### 初始化
1. 使用 devtools-mcp 打开闲鱼消息页面
2. 注入消息监听脚本
3. 等待用户确认登录

### 消息处理
当收到新消息时：
1. 打开对应聊天窗口
2. 分析买家意图
3. 查看订单状态
4. 构造回复内容
5. 发送回复
6. 确认是否需要后续操作

## 可用工具

- chrome-devtools 系列工具：操作浏览器
- goofish-web 技能：闲鱼操作指南

## 注意事项

- 发货前需确认订单已付款
- 发送链接等敏感操作需谨慎
- 遇到无法处理的问题报告云端
```

### 4.4 浏览器注入脚本

#### 消息监听脚本
```javascript
(function() {
  'use strict';
  
  const API_KEY = 'YOUR_API_KEY';
  const CLOUD_URL = 'https://worker.example.com';
  
  // 拦截 fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const url = args[0];
    
    if (typeof url === 'string' && url.includes('idlemessage')) {
      const clonedResponse = response.clone();
      
      try {
        const data = await clonedResponse.json();
        
        if (url.includes('message.sync')) {
          await handleMessageSync(data);
        } else if (url.includes('session.sync')) {
          await handleSessionSync(data);
        }
      } catch (e) {
        console.error('[Goofish Agent] 解析响应失败:', e);
      }
    }
    
    return response;
  };
  
  // 处理新消息
  async function handleMessageSync(data) {
    if (!data.data || !data.data.messages) return;
    
    const messages = data.data.messages;
    
    for (const msg of messages) {
      // 过滤系统消息
      if (msg.fromUserId === '系统') continue;
      
      // 向云端报告
      await reportToCloud({
        type: 'new_message',
        sessionId: msg.sessionId,
        buyerId: msg.fromUserId,
        buyerName: msg.fromUserNick,
        lastMessage: msg.content,
        timestamp: msg.timestamp,
        unreadCount: data.data.unreadCount || 1
      });
    }
  }
  
  // 向云端报告
  async function reportToCloud(message) {
    try {
      await fetch(`${CLOUD_URL}/api/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify(message)
      });
    } catch (e) {
      console.error('[Goofish Agent] 报告失败:', e);
    }
  }
  
  // 心跳
  setInterval(async () => {
    try {
      await fetch(`${CLOUD_URL}/heartbeat/browser`, {
        method: 'POST',
        headers: { 'X-API-Key': API_KEY }
      });
    } catch (e) {
      console.error('[Goofish Agent] 心跳失败:', e);
    }
  }, 3 * 60 * 1000);
  
  console.log('[Goofish Agent] 监听脚本已启动');
})();
```

## 5. 状态管理

### 5.1 Cloudflare KV 存储

#### 数据结构
```
heartbeat:browser         # 浏览器最后心跳时间戳
heartbeat:daemon          # 守护程序最后心跳时间戳
status:browser            # 浏览器状态 (online/offline)
status:daemon             # 守护程序状态 (online/offline)
recent_messages           # 最近消息列表 (JSON数组)
last_error                # 最后错误信息
```

#### TTL 设置
- 心跳数据：10分钟
- 状态数据：无过期
- 消息历史：1天

### 5.2 本地状态

#### 守护程序状态
```javascript
{
  isProcessing: false,      // 是否正在处理消息
  lastMessageTime: null,    // 最后消息时间
  errorCount: 0,            // 错误计数
  uptime: 0                 // 运行时长
}
```

## 6. 安全机制

### 6.1 API 认证
- 使用 X-API-Key 头认证
- 密钥存储在 Worker 环境变量中

```toml
# wrangler.toml
[vars]
API_KEY = "your-secret-key"

# 敏感信息
[secrets]
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

### 6.2 CORS 配置
```javascript
// Worker 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.goofish.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Max-Age': '86400'
};
```

## 7. 部署方案

### 7.1 本地守护程序

#### launchd 配置
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.goofish.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/local-daemon/src/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/goofish-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/goofish-daemon-error.log</string>
</dict>
</plist>
```

#### 启动命令
```bash
# 安装
cp com.goofish.daemon.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.goofish.daemon.plist

# 卸载
launchctl unload ~/Library/LaunchAgents/com.goofish.daemon.plist
```

### 7.2 Cloudflare Worker

#### 部署命令
```bash
cd cloud-worker
wrangler deploy
```

#### wrangler.toml 配置
```toml
name = "goofish-agent-worker"
main = "src/index.js"
compatibility_date = "2026-03-08"

[[durable_objects.bindings]]
name = "MESSAGE_PUBSUB"
class_name = "MessagePubSub"

[[migrations]]
tag = "v1"
new_classes = ["MessagePubSub"]

[[kv_namespaces]]
binding = "GOOFISH_KV"
id = "your-kv-namespace-id"

[triggers]
crons = ["* * * * *"]  # 每分钟执行监控

[vars]
API_KEY = "your-api-key"

# 敏感信息使用 wrangler secret put 设置
```

## 8. 监控和日志

### 8.1 日志级别

#### 本地守护程序
- DEBUG: 详细调试信息
- INFO: 正常操作日志
- WARN: 警告信息
- ERROR: 错误信息

#### Worker 日志
- 使用 Cloudflare 内置日志
- console.log 自动上传到 Cloudflare

### 8.2 指标收集

#### 关键指标
- 消息处理数量
- 平均响应时间
- 错误率
- 在线时长

#### 实现方式
```javascript
// Worker 中记录指标
async function recordMetric(env, name, value) {
  const metrics = await env.GOOFISH_KV.get('metrics', { type: 'json' }) || {};
  metrics[name] = {
    value,
    timestamp: Date.now()
  };
  await env.GOOFISH_KV.put('metrics', JSON.stringify(metrics));
}
```

## 9. 错误处理

### 9.1 错误分类

| 错误类型 | 处理方式 |
|---------|---------|
| 浏览器离线 | 通知 Claude 重启 |
| 守护程序离线 | 发送 Telegram 告警 |
| 消息处理失败 | 记录日志，发送 Telegram |
| 网络错误 | 不重试，等待下次消息 |
| 认证失败 | 记录错误，停止服务 |

### 9.2 恢复机制

```
错误发生
   ↓
记录错误日志
   ↓
更新状态到 KV
   ↓
发送 Telegram 通知
   ↓
等待人工介入或自动恢复
```

## 10. 扩展性考虑

### 10.1 多账号支持
- 每个 Agent 实例独立运行
- 使用不同的 tmux 会话
- Worker 支持多租户

### 10.2 高可用
- 本地守护程序支持热重启
- Worker 无状态，自动扩容
- Durable Objects 保证消息不丢失

### 10.3 性能优化
- 消息批量处理
- SSE 连接池
- KV 缓存策略

---

**文档版本**: v1.0  
**最后更新**: 2026-03-08
