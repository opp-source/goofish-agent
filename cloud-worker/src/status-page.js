export async function handleStatusPage(request, env) {
  const kv = env.GOOFISH_KV;

  // 获取状态
  const browserStatus = await kv.get('status:browser') || 'offline';
  const daemonStatus = await kv.get('status:daemon') || 'offline';
  const lastBrowserHeartbeat = await kv.get('heartbeat:browser');
  const lastDaemonHeartbeat = await kv.get('heartbeat:daemon');
  const recentMessages = await kv.get('recent_messages', { type: 'json' }) || [];
  const lastError = await kv.get('last_error', { type: 'json' });

  // 返回 JSON 状态
  const status = {
    browser: {
      status: browserStatus,
      lastHeartbeat: lastBrowserHeartbeat ? parseInt(lastBrowserHeartbeat) : null
    },
    daemon: {
      status: daemonStatus,
      lastHeartbeat: lastDaemonHeartbeat ? parseInt(lastDaemonHeartbeat) : null
    },
    recentMessages: recentMessages.slice(0, 10),
    lastError: lastError
  };

  // 如果是浏览器请求，返回 HTML 页面
  const accept = request?.headers?.get('Accept') || '';
  if (accept.includes('text/html')) {
    return new Response(generateHTML(status), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // 否则返回 JSON
  return new Response(JSON.stringify(status, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function generateHTML(status) {
  const browserStatus = status.browser.status === 'online' ? '✅ 在线' : '❌ 离线';
  const daemonStatus = status.daemon.status === 'online' ? '✅ 在线' : '❌ 离线';

  const browserTime = status.browser.lastHeartbeat 
    ? new Date(status.browser.lastHeartbeat).toLocaleString('zh-CN')
    : '无';

  const daemonTime = status.daemon.lastHeartbeat
    ? new Date(status.daemon.lastHeartbeat).toLocaleString('zh-CN')
    : '无';

  const messages = status.recentMessages.map(msg => `
    <tr>
      <td>${msg.buyerName || '-'}</td>
      <td>${msg.lastMessage ? msg.lastMessage.substring(0, 50) : '-'}</td>
      <td>${new Date(msg.timestamp).toLocaleString('zh-CN')}</td>
    </tr>
  `).join('') || '<tr><td colspan="3">暂无消息</td></tr>';

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>闲鱼 Agent 状态监控</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
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
      margin: 0 0 20px;
      font-size: 24px;
    }
    h2 {
      margin: 0 0 15px;
      font-size: 18px;
      border-bottom: 2px solid #4CAF50;
      padding-bottom: 10px;
    }
    .status-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
    .status-item {
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .status-label {
      font-weight: bold;
      color: #666;
      margin-bottom: 5px;
    }
    .status-value {
      font-size: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th {
      background: #f5f5f5;
      font-weight: bold;
    }
    .error {
      background: #fff3cd;
      padding: 10px;
      border-radius: 4px;
      margin-top: 10px;
    }
    .refresh-btn {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 10px;
    }
    .refresh-btn:hover {
      background: #45a049;
    }
    .actions {
      margin-top: 20px;
    }
    .action-btn {
      background: #2196F3;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 10px;
    }
    .action-btn:hover {
      background: #0b7dda;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>🐟 闲鱼 Agent 状态监控</h1>
    
    <h2>系统状态</h2>
    <div class="status-grid">
      <div class="status-item">
        <div class="status-label">浏览器</div>
        <div class="status-value">${browserStatus}</div>
        <div style="font-size: 12px; color: #999; margin-top: 5px;">
          最后心跳: ${browserTime}
        </div>
      </div>
      <div class="status-item">
        <div class="status-label">守护程序</div>
        <div class="status-value">${daemonStatus}</div>
        <div style="font-size: 12px; color: #999; margin-top: 5px;">
          最后心跳: ${daemonTime}
        </div>
      </div>
    </div>

    ${status.lastError ? `
    <div class="error">
      <strong>最后错误:</strong> ${status.lastError.type}<br>
      ${status.lastError.message}<br>
      <small>${new Date(status.lastError.timestamp).toLocaleString('zh-CN')}</small>
    </div>
    ` : ''}

    <div class="actions">
      <button class="action-btn" onclick="location.reload()">刷新状态</button>
      <button class="action-btn" onclick="testNotification()">测试通知</button>
      <button class="action-btn" onclick="restartBrowser()">重启浏览器</button>
    </div>
  </div>

  <div class="card">
    <h2>最近消息</h2>
    <table>
      <thead>
        <tr>
          <th>买家</th>
          <th>消息</th>
          <th>时间</th>
        </tr>
      </thead>
      <tbody>
        ${messages}
      </tbody>
    </table>
  </div>

  <script>
    async function testNotification() {
      try {
        const response = await fetch('/admin/test-notification', {
          method: 'POST',
          headers: { 'X-API-Key': 'admin' }
        });
        const result = await response.json();
        alert(result.message || result.error);
      } catch (error) {
        alert('操作失败: ' + error.message);
      }
    }

    async function restartBrowser() {
      if (!confirm('确定要重启浏览器吗？')) return;
      
      try {
        const response = await fetch('/admin/restart-browser', {
          method: 'POST',
          headers: { 'X-API-Key': 'admin' }
        });
        const result = await response.json();
        alert(result.message);
      } catch (error) {
        alert('操作失败: ' + error.message);
      }
    }

    // 自动刷新
    setTimeout(() => location.reload(), 60000);
  </script>
</body>
</html>
  `.trim();
}
