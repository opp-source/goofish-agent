# 闲鱼消息通知监听指南

## 核心目标

通过 Chrome DevTools MCP 工具实现闲鱼消息的实时监听，以便 goofish-manager 能够及时响应客户消息。

---

## 方案对比

| 方案 | 实时性 | 实现难度 | 可靠性 | 推荐 |
|------|--------|----------|--------|------|
| ACCS 推送 | ⭐⭐⭐⭐⭐ | 高 | 高 | 最佳 |
| 轮询 API | ⭐⭐⭐ | 低 | 中 | 推荐 |
| DOM 监听 | ⭐⭐⭐⭐ | 中 | 高 | 推荐 |
| 浏览器通知 | ⭐⭐⭐⭐⭐ | 低 | 中 | 可用 |

---

## 方案一：轮询消息 API（推荐）

### 原理

定时调用闲鱼的消息同步 API，检查是否有新消息。

### API 接口

```
POST https://h5api.m.goofish.com/h5/mtop.taobao.idlemessage.pc.message.sync/1.0/
```

### 实现代码

```javascript
// 在页面中执行的轮询函数
async function pollMessages(sessionId, lastMessageId = null) {
  const response = await fetch('https://h5api.m.goofish.com/h5/mtop.taobao.idlemessage.pc.message.sync/1.0/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      jsv: '2.7.2',
      appKey: '34839810',
      t: Date.now().toString(),
      sign: '动态签名',
      v: '1.0',
      type: 'originaljson',
      accountSite: 'xianyu',
      dataType: 'json',
      api: 'mtop.taobao.idlemessage.pc.message.sync',
      data: JSON.stringify({
        type: 1,
        fetchs: 10,
        sessionId: sessionId,
        start: 0,
        includeRequestMsg: true
      })
    }),
    credentials: 'include'
  });

  const data = await response.json();
  return data.data.messages;
}
```

### 轮询策略

```javascript
class MessagePoller {
  constructor(interval = 5000) {
    this.interval = interval;
    this.timer = null;
    this.lastMessageId = null;
  }

  start(callback) {
    this.timer = setInterval(async () => {
      const messages = await this.checkNewMessages();
      if (messages.length > 0) {
        callback(messages);
      }
    }, this.interval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
```

### 优缺点

**优点**:
- 实现简单，无需理解底层协议
- 可控的轮询频率
- 不依赖特定浏览器功能

**缺点**:
- 有一定延迟（取决于轮询间隔）
- 频繁请求可能触发风控
- 占用网络资源

---

## 方案二：DOM 变化监听

### 原理

闲鱼页面使用 React/Vue 等框架，新消息到达时会更新 DOM。通过 MutationObserver 监听 DOM 变化，检测新消息。

### 实现代码

```javascript
// 使用 evaluate_script 在页面中执行
function setupDOMListener() {
  // 消息列表容器选择器（需要根据实际页面调整）
  const messageContainer = document.querySelector('[role="main"]') ||
                           document.querySelector('.message-list') ||
                           document.querySelector('[class*="chat"]');

  if (!messageContainer) {
    console.log('未找到消息容器');
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // 检测到新节点
        mutation.addedNodes.forEach(node => {
          // 分析新节点内容
          const textContent = node.textContent || node.innerText;
          if (textContent && !textContent.includes('系统消息')) {
            console.log('新消息:', textContent);
            // 触发通知
            notifyNewMessage(node);
          }
        });
      }
    }
  });

  observer.observe(messageContainer, {
    childList: true,
    subtree: true
  });

  console.log('DOM 监听已启动');
  return observer;
}
```

### 使用 DevTools MCP 执行

```
使用 mcp__chrome-devtools__evaluate_script 执行上述代码
```

### 优缺点

**优点**:
- 实时性好，无延迟
- 不产生网络请求
- 页面原生行为，不触发风控

**缺点**:
- 依赖页面结构，可能因页面更新失效
- 需要页面保持打开状态
- 无法获取消息的完整结构化数据

---

## 方案三：红点检测

### 原理

闲鱼消息页面有红点（未读标记），通过检测红点变化来判断是否有新消息。

### API 接口

```
POST https://h5api.m.goofish.com/h5/mtop.taobao.idlemessage.pc.redpoint.query/1.0/
```

### 实现

```javascript
async function checkUnreadCount() {
  const response = await fetch('https://h5api.m.goofish.com/h5/mtop.taobao.idlemessage.pc.redpoint.query/1.0/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      // ... 参数同上
      data: JSON.stringify({
        sessionTypes: "1,19,15,32,3,44,51,52,24",
        fetch: 50
      })
    }),
    credentials: 'include'
  });

  const data = await response.json();
  return data.data.total;  // 总未读数
}

// 定时检测
let lastUnreadCount = 0;
setInterval(async () => {
  const currentCount = await checkUnreadCount();
  if (currentCount > lastUnreadCount) {
    console.log('有新消息！未读数:', currentCount);
    // 触发新消息处理
  }
  lastUnreadCount = currentCount;
}, 5000);
```

### 优缺点

**优点**:
- 请求量小
- 可快速判断是否有新消息
- 不需要知道具体会话 ID

**缺点**:
- 只能知道有新消息，不知道具体内容
- 需要额外请求获取消息详情

---

## 方案四：浏览器通知拦截

### 原理

闲鱼可能使用 Web Notification API 发送桌面通知。通过重写 Notification API 拦截通知。

### 前提条件

- 用户已授权通知权限
- 闲鱼启用了浏览器通知

### 实现代码

```javascript
// 在页面加载前注入（需要通过 initScript 参数）
const originalNotification = window.Notification;

window.Notification = function(title, options) {
  console.log('拦截到通知:', title, options);

  // 触发自定义事件
  window.dispatchEvent(new CustomEvent('xianyu-notification', {
    detail: { title, options, timestamp: Date.now() }
  }));

  // 仍然显示原通知
  return new originalNotification(title, options);
};

// 继承原型
window.Notification.prototype = originalNotification.prototype;
window.Notification.permission = originalNotification.permission;
window.Notification.requestPermission = originalNotification.requestPermission;
```

### 使用方法

```
// 导航时使用 initScript 参数
mcp__chrome-devtools__navigate_page({
  type: 'url',
  url: 'https://www.goofish.com/im',
  initScript: `上述拦截代码`
})
```

### 优缺点

**优点**:
- 最实时，零延迟
- 不产生额外网络请求
- 可获取通知的完整信息

**缺点**:
- 依赖闲鱼使用浏览器通知功能
- 需要用户授权通知权限
- 通知内容可能不完整

---

## 推荐方案：组合策略

### 实现思路

1. **主方案**: DOM 监听（实时性最好）
2. **备用方案**: 轮询 API（可靠性高）
3. **补充方案**: 红点检测（快速判断）

### 代码示例

```javascript
class XianyuMessageMonitor {
  constructor() {
    this.domObserver = null;
    this.pollTimer = null;
    this.lastUnreadCount = 0;
    this.onMessage = null;
  }

  // 初始化
  async init(callback) {
    this.onMessage = callback;

    // 启动 DOM 监听
    this.startDOMListener();

    // 启动轮询（作为备份）
    this.startPolling();

    console.log('消息监听已启动');
  }

  // DOM 监听
  startDOMListener() {
    const container = document.querySelector('[role="main"]');
    if (!container) return;

    this.domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          this.handleNewNodes(mutation.addedNodes);
        }
      }
    });

    this.domObserver.observe(container, { childList: true, subtree: true });
  }

  // 轮询
  startPolling() {
    this.pollTimer = setInterval(async () => {
      try {
        const count = await this.fetchUnreadCount();
        if (count > this.lastUnreadCount) {
          this.lastUnreadCount = count;
          if (this.onMessage) {
            this.onMessage({ type: 'unread_changed', count });
          }
        }
      } catch (e) {
        console.error('轮询失败:', e);
      }
    }, 10000);  // 10秒轮询
  }

  // 处理新节点
  handleNewNodes(nodes) {
    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const text = node.textContent;
        if (text && this.isCustomerMessage(node)) {
          if (this.onMessage) {
            this.onMessage({ type: 'new_message', content: text, element: node });
          }
        }
      }
    }
  }

  // 判断是否为客户消息
  isCustomerMessage(element) {
    // 排除系统消息
    if (element.textContent.includes('系统消息')) return false;
    if (element.textContent.includes('通知消息')) return false;
    // 其他判断逻辑...
    return true;
  }

  // 获取未读数
  async fetchUnreadCount() {
    // API 调用实现...
    return 0;
  }

  // 停止监听
  stop() {
    if (this.domObserver) {
      this.domObserver.disconnect();
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }
}

// 使用
const monitor = new XianyuMessageMonitor();
monitor.init((event) => {
  console.log('收到事件:', event);
});
```

---

## DevTools MCP 操作流程

### 1. 打开消息页面

```
mcp__chrome-devtools__navigate_page({
  type: 'url',
  url: 'https://www.goofish.com/im'
})
```

### 2. 注入监听脚本

```
mcp__chrome-devtools__evaluate_script({
  function: `() => {
    // 注入消息监听代码
    window.xianyuMonitor = new XianyuMessageMonitor();
    window.xianyuMonitor.init((event) => {
      console.log('[XIANYU_MSG]', JSON.stringify(event));
    });
    return '监听已启动';
  }`
})
```

### 3. 定期检查日志

```
mcp__chrome-devtools__list_console_messages({
  types: ['log']
})
```

### 4. 过滤消息

查找包含 `[XIANYU_MSG]` 的日志，解析消息内容。

---

## 最佳实践

### 轮询频率建议

| 场景 | 建议频率 |
|------|----------|
| 高优先级（待处理订单） | 5 秒 |
| 普通监控 | 10-15 秒 |
| 低优先级 | 30-60 秒 |

### 风控规避

1. 随机化轮询间隔（±2秒）
2. 模拟人类行为模式
3. 避免批量操作
4. 使用合理的 User-Agent

### 错误处理

```javascript
async function safePoll() {
  try {
    const messages = await fetchMessages();
    return messages;
  } catch (error) {
    if (error.status === 403) {
      console.log('可能触发风控，暂停5分钟');
      await sleep(5 * 60 * 1000);
    } else if (error.status === 401) {
      console.log('登录态失效，需要重新登录');
    }
    throw error;
  }
}
```

---

## 更新记录

- 2026-03-08: 初始版本