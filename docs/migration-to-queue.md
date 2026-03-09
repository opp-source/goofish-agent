# 迁移指南：从 Durable Objects 到 Cloudflare Queue

本文档说明如何将闲鱼 Agent 系统从 Durable Objects 迁移到 Cloudflare Queue。

## 迁移原因

从 Durable Objects 迁移到 Cloudflare Queue 的主要原因：

1. **成本优化**: Cloudflare Queue 比 Durable Objects 更经济，特别是对于轻量级消息传递场景
2. **简化架构**: Queue 提供了更简单的消息队列模型，无需管理状态
3. **更好的扩展性**: Queue 可以轻松处理高并发消息
4. **可靠性**: Queue 提供消息持久化和重试机制

## 主要变更

### 1. 架构变更

**之前 (Durable Objects)**:
```
消息 → Worker → Durable Objects → SSE 连接 → 客户端
```

**现在 (Cloudflare Queue)**:
```
消息 → Worker → Queue → Consumer → 处理逻辑
              ↓
            KV 存储
              ↓
         轮询接口 → 客户端
```

### 2. 文件变更

#### 删除的文件
- `cloud-worker/src/durable-object.js` - Durable Objects 类定义

#### 修改的文件
- `cloud-worker/src/index.js` - 移除 Durable Objects 导入和调用
- `cloud-worker/wrangler.toml` - 更新配置

### 3. 配置变更

#### wrangler.toml

**删除**:
```toml
# Durable Objects 配置
[[durable_objects.bindings]]
name = "MESSAGE_PUBSUB"
class_name = "MessagePubSub"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["MessagePubSub"]
```

**新增**:
```toml
# Queue 配置
[[queues.producers]]
queue = "message-queue"
binding = "MESSAGE_QUEUE"

[[queues.consumers]]
queue = "message-queue"
max_batch_size = 10
max_batch_timeout = 30
```

### 4. 代码变更

#### index.js 主要变更

1. **移除 Durable Objects 导入**:
```javascript
// 删除
import { MessagePubSub } from './durable-object.js';
export { MessagePubSub };
```

2. **消息发送改为 Queue**:
```javascript
// 之前
const id = env.MESSAGE_PUBSUB.idFromName('global');
const stub = env.MESSAGE_PUBSUB.get(id);
await stub.fetch('https://internal/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(message)
});

// 现在
await env.MESSAGE_QUEUE.send({
  type: 'new_message',
  data: message,
  timestamp: Date.now()
});
```

3. **添加 Queue Consumer**:
```javascript
async queue(batch, env, ctx) {
  for (const message of batch.messages) {
    try {
      console.log('处理队列消息:', message.body);
      await processQueueMessage(message.body, env);
      message.ack();
    } catch (error) {
      console.error('队列消息处理失败:', error);
      message.retry();
    }
  }
}
```

4. **SSE 改为基于 KV 的实现**:
```javascript
// 新增轮询接口
async function handleEventsPoll(request, env) {
  const url = new URL(request.url);
  const lastTimestamp = parseInt(url.searchParams.get('lastTimestamp') || '0');
  
  const messages = await env.GOOFISH_KV.get('recent_messages', { type: 'json' }) || [];
  const newMessages = messages.filter(msg => msg.timestamp > lastTimestamp);
  
  return jsonResponse({
    success: true,
    messages: newMessages,
    timestamp: Date.now()
  });
}
```

### 5. API 变更

#### 新增接口
- `GET /events/poll` - 消息轮询接口（推荐使用）

#### 保留接口
- `GET /events` - SSE 连接（兼容旧客户端，60 秒后自动断开）

## 迁移步骤

### 步骤 1: 创建 Cloudflare Queue

```bash
cd cloud-worker
wrangler queues create message-queue
```

### 步骤 2: 更新代码

```bash
# 拉取最新代码
git pull
```

### 步骤 3: 更新配置

确保 `wrangler.toml` 中包含正确的 Queue 配置。

### 步骤 4: 部署

```bash
wrangler deploy
```

### 步骤 5: 更新客户端代码

如果使用了 SSE 连接，建议更新为轮询方式：

**之前**:
```javascript
const eventSource = new EventSource(`${workerUrl}/events`);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // 处理消息
};
```

**现在**:
```javascript
let lastTimestamp = 0;

async function pollMessages() {
  const response = await fetch(`${workerUrl}/events/poll?lastTimestamp=${lastTimestamp}`, {
    headers: { 'X-API-Key': apiKey }
  });
  const data = await response.json();
  
  if (data.success && data.messages.length > 0) {
    data.messages.forEach(msg => {
      // 处理消息
    });
    lastTimestamp = data.timestamp;
  }
  
  // 每 5 秒轮询一次
  setTimeout(pollMessages, 5000);
}

pollMessages();
```

## 性能对比

### Durable Objects
- 优点: 实时推送，延迟低
- 缺点: 成本高，状态管理复杂

### Cloudflare Queue
- 优点: 成本低，架构简单，可靠性高
- 缺点: 需要轮询，轻微延迟（可接受）

## 成本对比

假设每天处理 1000 条消息：

### Durable Objects
- 请求次数: ~100,000/月
- 状态存储: 持续计费
- 预估成本: $5-10/月

### Cloudflare Queue
- 消息操作: ~30,000/月（免费额度）
- KV 读写: ~60,000/月（免费额度内）
- 预估成本: $0/月（免费额度内）

## 注意事项

1. **消息顺序**: Queue 不保证严格的消息顺序，但闲鱼场景可接受
2. **消息延迟**: 轮询方式会有轻微延迟（通常 < 5 秒）
3. **客户端更新**: 建议客户端改用轮询接口
4. **兼容性**: SSE 接口保留以兼容旧客户端

## 回滚方案

如需回滚到 Durable Objects：

1. 恢复 `durable-object.js` 文件
2. 恢复 `index.js` 和 `wrangler.toml` 配置
3. 重新部署

## 常见问题

### Q: 消息会丢失吗？
A: 不会。Queue 提供消息持久化，即使 Consumer 失败也会自动重试。

### Q: 轮询会不会增加延迟？
A: 会有轻微延迟（< 5 秒），但对闲鱼客服场景完全可接受。

### Q: 需要删除 Durable Objects 吗？
A: 不需要，Cloudflare 会自动清理未使用的资源。

### Q: 客户端需要更新吗？
A: 建议更新到轮询接口，但 SSE 接口仍可使用。

## 总结

从 Durable Objects 迁移到 Cloudflare Queue 简化了架构，降低了成本，同时保持了系统的可靠性。对于闲鱼 Agent 这种轻量级消息处理场景，Queue 是更合适的选择。

---

**文档版本**: v1.0  
**最后更新**: 2026-03-09