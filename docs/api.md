# API 接口文档

## 1. 云端同步程序 API

### 1.1 消息上报

**接口**: `POST /api/message`

**描述**: 浏览器注入脚本向云端报告新消息

**请求头**:
```
Content-Type: application/json
X-API-Key: <your-api-key>
```

**请求体**:
```json
{
  "type": "new_message",
  "sessionId": "53178218440",
  "buyerId": "2643375480",
  "buyerName": "买家昵称",
  "lastMessage": "您好，请问还在吗？",
  "timestamp": 1709900000000,
  "unreadCount": 3,
  "tradeStatus": "待发货",
  "itemId": "950735244178"
}
```

**响应**:
```json
{
  "success": true,
  "message": "消息已接收"
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "Invalid API key"
}
```

---

### 1.2 消息轮询

**接口**: `GET /events/poll`

**描述**: 本地守护程序通过轮询获取新消息

**查询参数**:
- `lastTimestamp`: 上次获取的最后消息时间戳（可选，默认为 0）

**请求头**:
```
X-API-Key: <your-api-key>
```

**响应**:
```json
{
  "success": true,
  "messages": [
    {
      "type": "new_message",
      "sessionId": "53178218440",
      "timestamp": 1709900000000
    }
  ],
  "timestamp": 1709900100000
}
```

---

### 1.3 SSE 连接

**接口**: `GET /events`

**描述**: 建立 SSE 连接接收实时消息推送（兼容旧客户端）

**请求头**:
```
Accept: text/event-stream
X-API-Key: <your-api-key>
```

**响应头**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**响应格式**:
```
data: {"type":"connected"}

data: {"type":"new_message","sessionId":"53178218440",...}
```

**注意**: SSE 连接会在 60 秒后自动断开，建议使用轮询接口 `/events/poll` 获取消息。

---

### 1.4 浏览器心跳

**接口**: `POST /heartbeat/browser`

**描述**: 浏览器注入脚本定期发送心跳

**请求头**:
```
X-API-Key: <your-api-key>
```

**响应**:
```json
{
  "success": true
}
```

---

### 1.5 获取系统状态

**接口**: `GET /status`

**描述**: 获取当前系统状态，用于状态页面展示

**响应**:
```json
{
  "browser": {
    "status": "online",
    "lastHeartbeat": 1709900000000
  },
  "daemon": {
    "status": "online",
    "lastHeartbeat": 1709900000000
  },
  "recentMessages": [
    {
      "sessionId": "53178218440",
      "buyerName": "买家昵称",
      "lastMessage": "您好",
      "timestamp": 1709900000000
    }
  ],
  "lastError": null
}
```

---

### 1.6 错误报告

**接口**: `POST /api/error`

**描述**: 本地守护程序报告错误

**请求体**:
```json
{
  "type": "processing_error",
  "message": "Claude 处理超时",
  "sessionId": "53178218440",
  "timestamp": 1709900000000
}
```

**响应**:
```json
{
  "success": true
}
```

---

## 2. 管理接口

### 2.1 手动重启浏览器

**接口**: `POST /admin/restart-browser`

**描述**: 手动触发浏览器重启流程

**请求头**:
```
X-API-Key: <your-api-key>
```

**响应**:
```json
{
  "success": true,
  "message": "重启指令已发送"
}
```

---

### 2.2 测试 Telegram 通知

**接口**: `POST /admin/test-notification`

**描述**: 测试 Telegram Bot 通知功能

**请求头**:
```
X-API-Key: <your-api-key>
```

**响应**:
```json
{
  "success": true,
  "message": "测试消息已发送"
}
```

---

### 2.3 手动触发消息处理

**接口**: `POST /admin/trigger-message`

**描述**: 手动触发一条测试消息

**请求体**:
```json
{
  "sessionId": "test-session",
  "buyerName": "测试买家",
  "lastMessage": "这是一条测试消息"
}
```

**响应**:
```json
{
  "success": true
}
```

---

## 3. 本地守护程序内部接口

### 3.1 tmux 管理

#### 启动 Claude
```javascript
tmuxManager.startClaude()
```

#### 发送消息
```javascript
tmuxManager.sendToClaude(message)
```

#### 检查会话状态
```javascript
tmuxManager.checkSession()
```

### 3.2 云端客户端

#### 连接 SSE
```javascript
cloudClient.connect()
```

#### 断开连接
```javascript
cloudClient.disconnect()
```

#### 事件监听
```javascript
cloudClient.on('new_message', handler)
cloudClient.on('heartbeat', handler)
cloudClient.on('error', handler)
```

---

## 4. 浏览器注入脚本 API

### 4.1 初始化

注入脚本会在页面加载后自动初始化，拦截 fetch 请求。

### 4.2 手动报告消息

```javascript
window.GoofishAgent.reportMessage({
  sessionId: 'xxx',
  buyerId: 'xxx',
  lastMessage: 'xxx'
});
```

### 4.3 获取状态

```javascript
const status = window.GoofishAgent.getStatus();
console.log(status);
// {
//   isRunning: true,
//   messageCount: 10,
//   lastHeartbeat: 1709900000000
// }
```

---

## 5. 数据结构定义

### 5.1 消息对象

```typescript
interface Message {
  type: 'new_message' | 'system_notification';
  sessionId: string;           // 会话ID
  buyerId: string;             // 买家用户ID
  buyerName: string;           // 买家昵称
  lastMessage: string;         // 最新消息内容
  timestamp: number;           // 时间戳
  unreadCount: number;         // 未读数
  tradeStatus?: string;        // 交易状态（可选）
  itemId?: string;             // 商品ID（可选）
}
```

### 5.2 系统状态

```typescript
interface SystemStatus {
  browser: {
    status: 'online' | 'offline';
    lastHeartbeat: number;
  };
  daemon: {
    status: 'online' | 'offline';
    lastHeartbeat: number;
  };
  recentMessages: Message[];
  lastError: {
    type: string;
    message: string;
    timestamp: number;
  } | null;
}
```

### 5.3 错误报告

```typescript
interface ErrorReport {
  type: string;
  message: string;
  sessionId?: string;
  timestamp: number;
  stack?: string;
}
```

---

## 6. 错误码定义

| 错误码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 认证失败（API Key 无效） |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

---

## 7. 限流策略

### 7.1 API 限流
- 每个客户端每分钟最多 60 次请求
- 超出限制返回 429 状态码

### 7.2 SSE 连接
- 每个 API Key 最多 1 个活跃连接
- 新连接会断开旧连接

---

## 8. 调试模式

### 8.1 开启详细日志

在 Worker 中设置环境变量：
```toml
[vars]
DEBUG_MODE = "true"
```

### 8.2 查看实时日志

```bash
wrangler tail
```

---

**文档版本**: v1.0  
**最后更新**: 2026-03-08
