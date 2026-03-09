/**
 * 闲鱼云端集成脚本（XHR + WebSocket 拦截版）
 * 通过拦截 XHR 和 WebSocket 请求获取消息数据
 *
 * 发现：
 * - 闲鱼使用 XMLHttpRequest (XHR) 而不是 fetch
 * - session.sync 默认只请求 sessionTypes: [3] (系统消息)
 * - 买家消息会话列表通过 WebSocket (ACCS) 推送
 * - 具体消息内容通过 user.query API 获取
 *
 * 功能：
 * 1. 拦截 XHR 请求 (session.sync, user.query)
 * 2. 拦截 WebSocket 消息
 * 3. 解析会话同步和用户消息
 * 4. 上报买家消息到云端
 * 5. 心跳保活
 * 6. 状态面板显示
 */

(function() {
  'use strict';

  // 配置
  const CONFIG = {
    cloudWorkerUrl: 'https://goofish-agent.wgy.us.kg',
    apiKey: 'a9441d97d2e940752a5780111ec6e36588975ad9d4f6c1af88a2e987ce8daa04',
    heartbeatInterval: 60,
    showStatusPanel: true,
    debug: true
  };

  // 状态
  let state = {
    isRunning: false,
    heartbeatTimer: null,
    connectionStatus: 'disconnected',
    lastHeartbeatTime: null,
    reportedCount: 0,
    processedMessages: new Set(),
    sessions: new Map(),
    wsConnections: []
  };

  let statusPanel = null;

  // 日志
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[闲鱼Agent]', new Date().toISOString(), ...args);
    }
  }

  // ================== 状态面板 ==================

  function createStatusPanel() {
    if (!CONFIG.showStatusPanel) return;

    const existingPanel = document.getElementById('xianyu-agent-status-panel');
    if (existingPanel) {
      existingPanel.remove();
    }

    statusPanel = document.createElement('div');
    statusPanel.id = 'xianyu-agent-status-panel';
    statusPanel.innerHTML = `
      <style>
        #xianyu-agent-status-panel {
          position: fixed;
          top: 10px;
          right: 10px;
          z-index: 99999;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 16px;
          border-radius: 12px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
          min-width: 180px;
        }
        .xianyu-panel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          font-weight: 600;
        }
        .xianyu-panel-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 12px;
        }
        .xianyu-status-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 6px;
          animation: pulse 2s infinite;
        }
        .xianyu-status-dot.connected {
          background: #4ade80;
          box-shadow: 0 0 8px #4ade80;
        }
        .xianyu-status-dot.disconnected {
          background: #fbbf24;
        }
        .xianyu-status-dot.error {
          background: #f87171;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      </style>
      <div class="xianyu-panel-header">
        <span>🤖</span>
        <span>闲鱼 Agent</span>
      </div>
      <div class="xianyu-panel-row">
        <span>状态</span>
        <span id="xianyu-status-text">
          <span class="xianyu-status-dot disconnected"></span>
          未连接
        </span>
      </div>
      <div class="xianyu-panel-row">
        <span>心跳</span>
        <span id="xianyu-heartbeat-time">--</span>
      </div>
      <div class="xianyu-panel-row">
        <span>会话</span>
        <span id="xianyu-session-count">0</span>
      </div>
      <div class="xianyu-panel-row">
        <span>上报</span>
        <span id="xianyu-reported-count">0</span>
      </div>
    `;

    document.body.appendChild(statusPanel);
    log('状态面板已创建');
  }

  function updateStatusPanel() {
    if (!statusPanel) return;

    const statusDot = statusPanel.querySelector('.xianyu-status-dot');
    const statusText = statusPanel.querySelector('#xianyu-status-text');
    const heartbeatTime = statusPanel.querySelector('#xianyu-heartbeat-time');
    const sessionCount = statusPanel.querySelector('#xianyu-session-count');
    const reportedCount = statusPanel.querySelector('#xianyu-reported-count');

    // 更新状态点
    statusDot.className = 'xianyu-status-dot ' + state.connectionStatus;

    const labels = {
      'connected': '已连接',
      'disconnected': '未连接',
      'error': '错误'
    };
    statusText.innerHTML = `<span class="xianyu-status-dot ${state.connectionStatus}"></span>${labels[state.connectionStatus] || '未知'}`;

    // 更新心跳时间
    if (state.lastHeartbeatTime) {
      const seconds = Math.floor((Date.now() - state.lastHeartbeatTime) / 1000);
      heartbeatTime.textContent = seconds < 60 ? `${seconds}秒前` : `${Math.floor(seconds / 60)}分钟前`;
    }

    // 更新统计
    sessionCount.textContent = state.sessions.size;
    reportedCount.textContent = state.reportedCount;
  }

  let statusUpdateTimer = null;
  function startStatusUpdater() {
    if (statusUpdateTimer) return;
    statusUpdateTimer = setInterval(updateStatusPanel, 1000);
  }

  function stopStatusUpdater() {
    if (statusUpdateTimer) {
      clearInterval(statusUpdateTimer);
      statusUpdateTimer = null;
    }
  }

  // ================== 云端 API ==================

  const CloudAPI = {
    // 发送心跳
    async sendHeartbeat() {
      try {
        const response = await fetch(`${CONFIG.cloudWorkerUrl}/heartbeat/browser`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CONFIG.apiKey
          },
          body: JSON.stringify({
            timestamp: Date.now(),
            status: 'active'
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        log('心跳成功');
        state.connectionStatus = 'connected';
        state.lastHeartbeatTime = Date.now();
        return data;
      } catch (err) {
        console.error('[闲鱼Agent] 心跳失败:', err.message);
        state.connectionStatus = 'error';
        return null;
      }
    },

    // 上报消息到云端
    async reportMessage(messageData) {
      try {
        const response = await fetch(`${CONFIG.cloudWorkerUrl}/api/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CONFIG.apiKey
          },
          body: JSON.stringify({
            timestamp: Date.now(),
            ...messageData
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        log('消息上报成功:', messageData.type, messageData.buyerName || '', messageData.lastMessage || messageData.message || '');
        state.reportedCount++;
        return data;
      } catch (err) {
        console.error('[闲鱼Agent] 消息上报失败:', err.message);
        return null;
      }
    }
  };

  // ================== 网络请求处理 ==================

  /**
   * 处理会话同步响应
   * API: mtop.taobao.idlemessage.pc.session.sync
   * 返回会话列表，包含未读数和最新消息摘要
   */
  function handleSessionSync(data) {
    const sessions = data?.sessions || [];
    log('会话同步:', sessions.length, '个会话');

    sessions.forEach(session => {
      const sessionId = session.session?.sessionId;
      const summary = session.message?.summary || {};
      const userInfo = session.session?.userInfo || {};
      const ownerInfo = session.session?.ownerInfo || {};

      // 存储会话信息
      state.sessions.set(sessionId, {
        sessionId,
        sessionType: session.session?.sessionType,
        buyerName: userInfo.nick || ownerInfo.fishNick || '未知',
        buyerId: userInfo.userId || ownerInfo.userId,
        lastMessage: summary.summary,
        unreadCount: summary.unread || 0,
        timestamp: summary.ts
      });

      // 上报有未读的会话（排除系统消息 sessionType=3 或 userInfo.type=10）
      if (summary.unread > 0 && session.session?.sessionType !== 3 && userInfo.type !== 10) {
        const msgKey = `session-${sessionId}-${summary.ts}`;
        if (!state.processedMessages.has(msgKey)) {
          state.processedMessages.add(msgKey);

          CloudAPI.reportMessage({
            type: 'buyer_message',
            sessionId: String(sessionId),
            buyerName: userInfo.nick || ownerInfo.fishNick || '未知',
            buyerId: userInfo.userId || ownerInfo.userId,
            lastMessage: summary.summary,
            unreadCount: summary.unread,
            timestamp: summary.ts
          });
        }
      }
    });
  }

  /**
   * 处理用户消息查询响应
   * API: mtop.taobao.idlemessage.pc.user.query
   * 返回具体聊天消息
   */
  function handleUserQuery(data) {
    const userInfo = data?.userInfo || {};
    const messages = data?.messages || [];

    log('用户消息查询:', userInfo.nick, '消息数:', messages.length);

    messages.forEach(msg => {
      // fromType: 0=对方发送(买家), 1=我发送(卖家)
      if (msg.fromType === 0) {
        const msgKey = `msg-${msg.msgId || msg.uuid}`;
        if (!state.processedMessages.has(msgKey)) {
          state.processedMessages.add(msgKey);

          CloudAPI.reportMessage({
            type: 'buyer_message',
            buyerName: userInfo.nick || userInfo.fishNick || '未知',
            buyerId: userInfo.userId,
            message: msg.content,
            contentType: msg.contentType,
            timestamp: msg.gmtCreate
          });
        }
      }
    });
  }

  // ================== XHR 拦截 ==================

  /**
   * 拦截 XMLHttpRequest
   * 闲鱼使用 XHR 而不是 fetch API
   */
  function interceptXHR() {
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
      this._url = url;
      return originalXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
      const xhr = this;
      const url = xhr._url;

      if (url && url.includes('mtop.taobao.idlemessage')) {
        xhr.addEventListener('load', function() {
          try {
            const json = JSON.parse(xhr.responseText);
            if (json.ret && json.ret[0] && json.ret[0].includes('SUCCESS')) {
              // 会话同步 API
              if (url.includes('session.sync')) {
                handleSessionSync(json.data);
              }
              // 用户消息查询 API
              else if (url.includes('user.query')) {
                handleUserQuery(json.data);
              }
            }
          } catch (err) {
            // 忽略解析错误
          }
        });
      }

      return originalXHRSend.apply(this, arguments);
    };

    log('XHR 拦截已启用');
  }

  // ================== WebSocket 拦截 ==================

  /**
   * 拦截 WebSocket
   * 闲鱼通过 ACCS WebSocket 推送会话列表更新
   */
  function interceptWebSocket() {
    const OriginalWebSocket = window.WebSocket;

    window.WebSocket = function(url, protocols) {
      log('WebSocket 连接:', url);

      const ws = new OriginalWebSocket(url, protocols);
      state.wsConnections.push(ws);

      // 拦截消息
      ws.addEventListener('message', function(event) {
        const data = event.data;

        // 记录消息（截断长消息）
        if (typeof data === 'string') {
          const preview = data.length > 200 ? data.substring(0, 200) + '...' : data;
          log('WebSocket 消息:', preview);

          // 尝试解析 JSON
          try {
            const json = JSON.parse(data);

            // 检查是否包含会话信息
            if (json.sessionId || json.sessions) {
              log('WebSocket 会话数据:', json);
            }

            // 检查是否是新消息通知
            if (json.type === 'message' || json.msgId) {
              log('WebSocket 新消息通知');
            }
          } catch (e) {
            // 可能是二进制数据或其他格式
            if (data.includes('session') || data.includes('message')) {
              log('WebSocket 可能包含会话/消息数据');
            }
          }
        } else if (data instanceof ArrayBuffer) {
          // 二进制数据
          log('WebSocket 二进制消息, 大小:', data.byteLength);
        }
      });

      // 拦截 send
      const originalSend = ws.send;
      ws.send = function(data) {
        log('WebSocket 发送:', typeof data === 'string' ? data.substring(0, 100) : 'binary');
        return originalSend.apply(this, arguments);
      };

      return ws;
    };

    // 复制原型和静态属性
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);

    log('WebSocket 拦截已启用');
  }

  /**
   * 拦截 fetch 请求（备用，闲鱼主要用 XHR）
   */
  function interceptFetch() {
    const originalFetch = window.fetch;

    window.fetch = async function(input, init) {
      const response = await originalFetch.call(window, input, init);
      const url = typeof input === 'string' ? input : input.url;

      // 检查是否是闲鱼消息 API
      if (url.includes('mtop.taobao.idlemessage')) {
        const clonedResponse = response.clone();

        try {
          const text = await clonedResponse.text();
          const json = JSON.parse(text);

          // 检查响应是否成功
          if (json.ret && json.ret[0]?.includes('SUCCESS')) {
            // 会话同步 API
            if (url.includes('session.sync')) {
              handleSessionSync(json.data);
            }
            // 用户消息查询 API
            else if (url.includes('user.query')) {
              handleUserQuery(json.data);
            }
          }
        } catch (err) {
          // 忽略解析错误
        }
      }

      return response;
    };

    log('Fetch 拦截已启用');
  }

  // ================== 心跳定时器 ==================

  function startHeartbeat() {
    // 立即发送一次
    CloudAPI.sendHeartbeat();

    // 定时发送
    state.heartbeatTimer = setInterval(() => {
      CloudAPI.sendHeartbeat();
    }, CONFIG.heartbeatInterval * 1000);

    log('心跳已启动，间隔:', CONFIG.heartbeatInterval, '秒');
  }

  function stopHeartbeat() {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
  }

  // ================== 公开 API ==================

  window.XianyuCloudIntegration = {
    // 启动
    start(options = {}) {
      if (state.isRunning) {
        log('已在运行中');
        return;
      }

      // 合并配置
      Object.assign(CONFIG, options);

      state.isRunning = true;

      // 初始化拦截器（顺序重要：WebSocket 需要在页面加载前拦截）
      interceptWebSocket();
      interceptXHR();
      interceptFetch();

      // 初始化 UI
      createStatusPanel();
      startStatusUpdater();
      startHeartbeat();

      log('集成已启动（XHR + WebSocket 拦截版）');
    },

    // 停止
    stop() {
      stopHeartbeat();
      stopStatusUpdater();

      if (statusPanel) {
        statusPanel.remove();
        statusPanel = null;
      }

      state.isRunning = false;
      log('集成已停止');
    },

    // 配置
    configure(options) {
      Object.assign(CONFIG, options);
      log('配置已更新');
    },

    // 获取状态
    getState() {
      return {
        connectionStatus: state.connectionStatus,
        lastHeartbeatTime: state.lastHeartbeatTime,
        reportedCount: state.reportedCount,
        sessions: Array.from(state.sessions.entries()).map(([k, v]) => v),
        processedMessages: Array.from(state.processedMessages)
      };
    },

    // 手动发送心跳
    sendHeartbeat: CloudAPI.sendHeartbeat,

    // 手动上报消息
    reportMessage: CloudAPI.reportMessage
  };

  log('脚本已加载（网络拦截版）');
  log('使用: XianyuCloudIntegration.start()');
})();

// 使用示例:
// XianyuCloudIntegration.start();
// 或自定义配置:
// XianyuCloudIntegration.start({
//   cloudWorkerUrl: 'https://your-worker.example.com',
//   apiKey: 'your-api-key'
// });