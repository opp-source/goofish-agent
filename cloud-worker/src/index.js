import { sendTelegramMessage } from './telegram.js';
import { MessagePubSub } from './durable-object.js';

export { MessagePubSub };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    try {
      if (url.pathname === '/' && method === 'GET') {
        return await handleStatusPage(env);
      }

      if (url.pathname === '/events' && method === 'GET') {
        const id = env.MESSAGE_PUBSUB.idFromName('global');
        const stub = env.MESSAGE_PUBSUB.get(id);
        return stub.fetch(request);
      }

      const apiKey = request.headers.get('X-API-Key');
      if (apiKey !== env.API_KEY) {
        return jsonResponse({ success: false, error: 'Invalid API key' }, 401);
      }

      if (url.pathname === '/api/message' && method === 'POST') {
        return await handleMessage(request, env);
      }

      if (url.pathname === '/api/error' && method === 'POST') {
        return await handleError(request, env);
      }

      if (url.pathname === '/admin/test-notification' && method === 'POST') {
        return await handleTestNotification(env);
      }

      if (url.pathname === '/admin/status' && method === 'GET') {
        return await handleStatus(env);
      }

      return jsonResponse({ error: 'Not Found' }, 404);

    } catch (error) {
      console.error('处理请求失败:', error);
      return jsonResponse({ 
        success: false, 
        error: error.message 
      }, 500);
    }
  },

  async queue(batch, env, ctx) {
    const id = env.MESSAGE_PUBSUB.idFromName('global');
    const stub = env.MESSAGE_PUBSUB.get(id);
    
    for (const message of batch.messages) {
      try {
        console.log('处理队列消息:', message.body);
        
        const response = await stub.fetch('http://internal/broadcast', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': env.API_KEY
          },
          body: JSON.stringify(message.body)
        });
        
        const result = await response.json();
        
        if (result.delivered > 0) {
          message.ack();
        } else {
          console.log('无 SSE 连接，消息将重试');
          message.retry();
        }
        
      } catch (error) {
        console.error('队列消息处理失败:', error);
        message.retry();
      }
    }
  }
};

async function handleMessage(request, env) {
  const message = await request.json();
  
  console.log('收到消息:', message);

  const id = env.MESSAGE_PUBSUB.idFromName('global');
  const stub = env.MESSAGE_PUBSUB.get(id);
  
  const response = await stub.fetch('http://internal/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': env.API_KEY
    },
    body: JSON.stringify({
      type: 'new_message',
      data: message,
      timestamp: Date.now()
    })
  });
  
  const result = await response.json();
  
  if (result.delivered > 0) {
    console.log(`消息已通过 SSE 推送给 ${result.delivered} 个客户端`);
    return jsonResponse({ 
      success: true, 
      delivered: 'sse', 
      clients: result.delivered 
    });
  }

  console.log('无 SSE 连接，消息存入队列');
  await env.MESSAGE_QUEUE.send({
    type: 'new_message',
    data: message,
    timestamp: Date.now()
  });

  return jsonResponse({ success: true, delivered: 'queue' });
}

async function handleError(request, env) {
  const errorData = await request.json();
  
  console.error('收到错误报告:', errorData);

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      env.TELEGRAM_CHAT_ID,
      `⚠️ 错误报告\n\n类型: ${errorData.type}\n消息: ${errorData.message}`
    );
  }

  return jsonResponse({ success: true });
}

async function handleTestNotification(env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return jsonResponse({ 
      success: false, 
      error: 'Telegram 配置缺失' 
    }, 400);
  }

  await sendTelegramMessage(
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_CHAT_ID,
    '✅ 测试消息：闲鱼 Agent 系统通知功能正常'
  );

  return jsonResponse({ success: true, message: '测试消息已发送' });
}

async function handleStatus(env) {
  const id = env.MESSAGE_PUBSUB.idFromName('global');
  const stub = env.MESSAGE_PUBSUB.get(id);
  
  const response = await stub.fetch('http://internal/status');
  const status = await response.json();
  
  return jsonResponse({
    success: true,
    ...status
  });
}

async function handleStatusPage(env) {
  const id = env.MESSAGE_PUBSUB.idFromName('global');
  const stub = env.MESSAGE_PUBSUB.get(id);
  
  const response = await stub.fetch('http://internal/status');
  const status = await response.json();
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>闲鱼 Agent 状态</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      margin: 0 0 20px 0;
      color: #333;
    }
    .status-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #eee;
    }
    .status-item:last-child {
      border-bottom: none;
    }
    .label {
      color: #666;
    }
    .value {
      font-weight: 600;
      color: #333;
    }
    .online {
      color: #4caf50;
    }
    .offline {
      color: #f44336;
    }
    .refresh-btn {
      background: #2196f3;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 20px;
    }
    .refresh-btn:hover {
      background: #1976d2;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>🐟 闲鱼 Agent 状态</h1>
    <div class="status-item">
      <span class="label">SSE 连接数</span>
      <span class="value ${status.connected > 0 ? 'online' : 'offline'}">${status.connected}</span>
    </div>
    <div class="status-item">
      <span class="label">守护程序状态</span>
      <span class="value ${status.connected > 0 ? 'online' : 'offline'}">${status.connected > 0 ? '在线' : '离线'}</span>
    </div>
    <div class="status-item">
      <span class="label">最后更新</span>
      <span class="value">${new Date(status.timestamp).toLocaleString('zh-CN')}</span>
    </div>
    <button class="refresh-btn" onclick="location.reload()">刷新状态</button>
  </div>
  
  <div class="card">
    <h2>系统架构</h2>
    <p>浏览器 → Worker → Durable Object → SSE → 本地守护程序 → Claude</p>
    <p style="color: #666; font-size: 14px;">Queue 作为备用通道（SSE 断开时使用）</p>
  </div>
</body>
</html>
  `;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
}

function jsonResponse(data, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };
  
  return new Response(JSON.stringify(data), { status, headers });
}