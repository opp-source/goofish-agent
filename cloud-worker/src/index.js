import { MessagePubSub } from './durable-object.js';
import { handleStatusPage } from './status-page.js';
import { sendTelegramMessage } from './telegram.js';
import { checkHeartbeats } from './monitor.js';

export { MessagePubSub };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS 预检请求
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': 'https://www.goofish.com',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // 路由处理
    try {
      // API 认证（除了状态页面）
      if (!url.pathname.startsWith('/status') && !url.pathname.startsWith('/events')) {
        const apiKey = request.headers.get('X-API-Key');
        if (apiKey !== env.API_KEY) {
          return jsonResponse({ success: false, error: 'Invalid API key' }, 401);
        }
      }

      // 路由匹配
      if (url.pathname === '/api/message' && method === 'POST') {
        return await handleMessage(request, env);
      }

      if (url.pathname === '/api/error' && method === 'POST') {
        return await handleError(request, env);
      }

      if (url.pathname === '/events' && method === 'GET') {
        return await handleSSE(request, env);
      }

      if (url.pathname === '/heartbeat/browser' && method === 'POST') {
        return await handleBrowserHeartbeat(request, env);
      }

      if (url.pathname === '/heartbeat/daemon' && method === 'POST') {
        return await handleDaemonHeartbeat(request, env);
      }

      if (url.pathname === '/status' && method === 'GET') {
        return await handleStatusPage(request, env);
      }

      // 管理接口
      if (url.pathname === '/admin/restart-browser' && method === 'POST') {
        return await handleRestartBrowser(env);
      }

      if (url.pathname === '/admin/test-notification' && method === 'POST') {
        return await handleTestNotification(env);
      }

      // 404
      return jsonResponse({ error: 'Not Found' }, 404);

    } catch (error) {
      console.error('处理请求失败:', error);
      return jsonResponse({ 
        success: false, 
        error: error.message 
      }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkHeartbeats(env));
  }
};

async function handleMessage(request, env) {
  const message = await request.json();
  
  console.log('收到消息:', message);

  // 保存最近消息
  const recentMessages = await env.GOOFISH_KV.get('recent_messages', { type: 'json' }) || [];
  recentMessages.unshift({
    ...message,
    timestamp: Date.now()
  });
  // 只保留最近 20 条
  if (recentMessages.length > 20) {
    recentMessages.pop();
  }
  await env.GOOFISH_KV.put('recent_messages', JSON.stringify(recentMessages));

  // 发布到 Durable Objects
  const id = env.MESSAGE_PUBSUB.idFromName('global');
  const stub = env.MESSAGE_PUBSUB.get(id);
  
  await stub.fetch('https://internal/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });

  return jsonResponse({ success: true, message: '消息已接收' });
}

async function handleError(request, env) {
  const errorData = await request.json();
  
  console.error('收到错误报告:', errorData);

  // 保存错误信息
  await env.GOOFISH_KV.put('last_error', JSON.stringify({
    ...errorData,
    timestamp: Date.now()
  }));

  // 发送 Telegram 通知
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      env.TELEGRAM_CHAT_ID,
      `⚠️ 错误报告\n\n类型: ${errorData.type}\n消息: ${errorData.message}`
    );
  }

  return jsonResponse({ success: true });
}

async function handleSSE(request, env) {
  const id = env.MESSAGE_PUBSUB.idFromName('global');
  const stub = env.MESSAGE_PUBSUB.get(id);
  
  return stub.fetch('https://internal/connect', {
    headers: request.headers
  });
}

async function handleBrowserHeartbeat(request, env) {
  const timestamp = Date.now().toString();
  await env.GOOFISH_KV.put('heartbeat:browser', timestamp, { expirationTtl: 600 });
  await env.GOOFISH_KV.put('status:browser', 'online');
  
  return jsonResponse({ success: true });
}

async function handleDaemonHeartbeat(request, env) {
  const timestamp = Date.now().toString();
  await env.GOOFISH_KV.put('heartbeat:daemon', timestamp, { expirationTtl: 600 });
  await env.GOOFISH_KV.put('status:daemon', 'online');
  
  return jsonResponse({ success: true });
}

async function handleRestartBrowser(env) {
  // 发布重启指令到 Durable Objects
  const id = env.MESSAGE_PUBSUB.idFromName('global');
  const stub = env.MESSAGE_PUBSUB.get(id);
  
  await stub.fetch('https://internal/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'restart_browser',
      timestamp: Date.now()
    })
  });

  return jsonResponse({ success: true, message: '重启指令已发送' });
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

function jsonResponse(data, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };
  
  return new Response(JSON.stringify(data), { status, headers });
}
