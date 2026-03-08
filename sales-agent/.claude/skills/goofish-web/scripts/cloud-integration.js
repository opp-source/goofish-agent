/**
 * 闲鱼云端集成脚本
 * 在闲鱼消息页面中运行，集成云端通信和心跳功能
 */

(function() {
  'use strict';

  // 配置
  const CONFIG = {
    // 云端 Worker 地址（需要配置）
    cloudWorkerUrl: window.CLOUD_WORKER_URL || '',
    // API Key（需要配置）
    apiKey: window.CLOUD_API_KEY || '',
    // 心跳间隔（秒）
    heartbeatInterval: 60,
    // 消息同步间隔（毫秒）
    messageSyncInterval: 5000,
    // 轮询间隔（毫秒）
    pollInterval: 10000,
    // 是否启用 DOM 监听
    enableDOMListener: true,
    // 是否启用轮询
    enablePolling: true,
    // 是否启用心跳
    enableHeartbeat: true,
    // 是否启用云端同步
    enableCloudSync: true,
    // 是否显示状态浮窗
    showStatusPanel: true,
    // 调试模式
    debug: true
  };

  // 状态
  let state = {
    isRunning: false,
    lastUnreadCount: 0,
    lastSessionId: null,
    pollTimer: null,
    heartbeatTimer: null,
    domObserver: null,
    connectionStatus: 'disconnected',
    lastHeartbeatTime: null,
    messageCount: 0
  };

  // 状态面板元素
  let statusPanel = null;

  // 日志
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[闲鱼云端]', new Date().toISOString(), ...args);
    }
  }

  // 错误日志
  function error(...args) {
    console.error('[闲鱼云端]', new Date().toISOString(), ...args);
  }

  // 创建状态面板
  function createStatusPanel() {
    if (!CONFIG.showStatusPanel) return;

    // 移除已存在的面板
    const existingPanel = document.getElementById('xianyu-agent-status-panel');
    if (existingPanel) {
      existingPanel.remove();
    }

    // 创建面板
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
          min-width: 200px;
          transition: all 0.3s ease;
        }
        #xianyu-agent-status-panel:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }
        .xianyu-panel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          font-weight: 600;
          font-size: 14px;
        }
        .xianyu-panel-header .icon {
          width: 20px;
          height: 20px;
          background: rgba(255,255,255,0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .xianyu-panel-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          font-size: 12px;
          opacity: 0.9;
        }
        .xianyu-panel-row .label {
          opacity: 0.8;
        }
        .xianyu-panel-row .value {
          font-weight: 500;
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
          box-shadow: 0 0 8px #fbbf24;
        }
        .xianyu-status-dot.error {
          background: #f87171;
          box-shadow: 0 0 8px #f87171;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .xianyu-panel-footer {
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(255,255,255,0.2);
          font-size: 11px;
          opacity: 0.7;
        }
      </style>
      <div class="xianyu-panel-header">
        <span class="icon">🤖</span>
        <span>闲鱼 Agent</span>
      </div>
      <div class="xianyu-panel-row">
        <span class="label">状态</span>
        <span class="value" id="xianyu-status-text">
          <span class="xianyu-status-dot disconnected"></span>
          等待连接
        </span>
      </div>
      <div class="xianyu-panel-row">
        <span class="label">心跳</span>
        <span class="value" id="xianyu-heartbeat-time">--</span>
      </div>
      <div class="xianyu-panel-row">
        <span class="label">消息数</span>
        <span class="value" id="xianyu-message-count">0</span>
      </div>
      <div class="xianyu-panel-footer">
        每 ${CONFIG.heartbeatInterval} 秒发送心跳
      </div>
    `;

    document.body.appendChild(statusPanel);
    log('状态面板已创建');
  }

  // 更新状态面板
  function updateStatusPanel() {
    if (!statusPanel) return;

    const statusDot = statusPanel.querySelector('.xianyu-status-dot');
    const statusText = statusPanel.querySelector('#xianyu-status-text');
    const heartbeatTime = statusPanel.querySelector('#xianyu-heartbeat-time');
    const messageCount = statusPanel.querySelector('#xianyu-message-count');

    // 更新连接状态
    statusDot.className = 'xianyu-status-dot ' + state.connectionStatus;

    const statusLabels = {
      'connected': '已连接',
      'disconnected': '未连接',
      'error': '连接错误'
    };
    statusText.innerHTML = `<span class="xianyu-status-dot ${state.connectionStatus}"></span>${statusLabels[state.connectionStatus] || '未知'}`;

    // 更新心跳时间
    if (state.lastHeartbeatTime) {
      const seconds = Math.floor((Date.now() - state.lastHeartbeatTime) / 1000);
      heartbeatTime.textContent = seconds < 60 ? `${seconds}秒前` : `${Math.floor(seconds / 60)}分钟前`;
    }

    // 更新消息数
    messageCount.textContent = state.messageCount;
  }

  // 移除状态面板
  function removeStatusPanel() {
    if (statusPanel) {
      statusPanel.remove();
      statusPanel = null;
    }
  }

  // 启动状态面板更新定时器
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

  // 云端 API 客户端
  const CloudAPI = {
    // 发送心跳
    async sendHeartbeat() {
      if (!CONFIG.enableCloudSync || !CONFIG.cloudWorkerUrl) {
        return null;
      }

      try {
        // 使用正确的端点: /heartbeat/browser
        const response = await fetch(`${CONFIG.cloudWorkerUrl}/heartbeat/browser`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CONFIG.apiKey
          },
          body: JSON.stringify({
            timestamp: Date.now(),
            status: 'active',
            unreadCount: state.lastUnreadCount
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        log('心跳发送成功:', data);
        state.connectionStatus = 'connected';
        state.lastHeartbeatTime = Date.now();
        updateStatusPanel();
        return data;
      } catch (err) {
        error('心跳发送失败:', err.message);
        state.connectionStatus = 'error';
        updateStatusPanel();
        return null;
      }
    },

    // 发送消息
    async sendMessage(message) {
      if (!CONFIG.enableCloudSync || !CONFIG.cloudWorkerUrl) {
        return null;
      }

      try {
        // 使用正确的端点: /api/message (单数)
        const response = await fetch(`${CONFIG.cloudWorkerUrl}/api/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CONFIG.apiKey
          },
          body: JSON.stringify({
            timestamp: Date.now(),
            message: message
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        log('消息发送成功:', data);
        state.messageCount++;
        updateStatusPanel();
        return data;
      } catch (err) {
        error('消息发送失败:', err.message);
        return null;
      }
    },

    // 获取指令
    async getCommands() {
      if (!CONFIG.enableCloudSync || !CONFIG.cloudWorkerUrl) {
        return [];
      }

      try {
        const response = await fetch(`${CONFIG.cloudWorkerUrl}/api/commands`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CONFIG.apiKey
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        log('获取指令成功:', data);
        return data.commands || [];
      } catch (err) {
        error('获取指令失败:', err.message);
        return [];
      }
    },

    // 报告指令执行结果
    async reportCommandResult(commandId, result) {
      if (!CONFIG.enableCloudSync || !CONFIG.cloudWorkerUrl) {
        return null;
      }

      try {
        const response = await fetch(`${CONFIG.cloudWorkerUrl}/api/commands/${commandId}/result`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CONFIG.apiKey
          },
          body: JSON.stringify({
            timestamp: Date.now(),
            result: result
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        log('指令结果上报成功:', data);
        return data;
      } catch (err) {
        error('指令结果上报失败:', err.message);
        return null;
      }
    },

    // 建立 SSE 连接
    connectSSE(onMessage) {
      if (!CONFIG.enableCloudSync || !CONFIG.cloudWorkerUrl) {
        return null;
      }

      try {
        // 使用正确的端点: /events
        const eventSource = new EventSource(
          `${CONFIG.cloudWorkerUrl}/events?apiKey=${encodeURIComponent(CONFIG.apiKey)}`
        );

        eventSource.onopen = () => {
          log('SSE 连接已建立');
          state.connectionStatus = 'connected';
          updateStatusPanel();
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            log('SSE 消息:', data);
            if (onMessage) {
              onMessage(data);
            }
          } catch (err) {
            error('SSE 消息解析失败:', err);
          }
        };

        eventSource.onerror = (err) => {
          error('SSE 连接错误:', err);
          state.connectionStatus = 'error';
          updateStatusPanel();
        };

        return eventSource;
      } catch (err) {
        error('SSE 连接失败:', err);
        return null;
      }
    }
  };

  // 消息处理器
  const MessageHandler = {
    // 处理新消息
    async handleNewMessage(message) {
      log('处理新消息:', message);

      // 发送到云端
      await CloudAPI.sendMessage(message);

      // 触发自定义事件
      window.dispatchEvent(new CustomEvent('xianyu:newMessage', {
        detail: message
      }));
    },

    // 处理未读数变化
    handleUnreadChange(count) {
      log('未读数变化:', count);

      if (count !== state.lastUnreadCount) {
        state.lastUnreadCount = count;

        // 触发自定义事件
        window.dispatchEvent(new CustomEvent('xianyu:unreadChange', {
          detail: { count }
        }));
      }
    },

    // 处理会话变化
    handleSessionChange(sessions) {
      log('会话变化:', sessions);

      // 触发自定义事件
      window.dispatchEvent(new CustomEvent('xianyu:sessionChange', {
        detail: { sessions }
      }));
    },

    // 处理云端指令
    async handleCloudCommand(command) {
      log('处理云端指令:', command);

      try {
        let result;

        // 执行指令
        switch (command.type) {
          case 'refresh':
            // 刷新页面
            window.location.reload();
            result = { success: true };
            break;

          case 'sendMessage':
            // 发送消息（需要进一步实现）
            result = { success: false, reason: 'not_implemented' };
            break;

          case 'getUnreadCount':
            // 获取未读数
            result = { success: true, count: state.lastUnreadCount };
            break;

          default:
            result = { success: false, reason: 'unknown_command' };
        }

        // 上报结果
        if (command.id) {
          await CloudAPI.reportCommandResult(command.id, result);
        }

        return result;
      } catch (err) {
        error('指令执行失败:', err);
        return { success: false, error: err.message };
      }
    }
  };

  // 拦截 fetch 请求
  function interceptFetch() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);

      const url = args[0];
      if (typeof url === 'string' && url.includes('idlemessage')) {
        log('拦截到 API 请求:', url);

        const clonedResponse = response.clone();

        try {
          const data = await clonedResponse.json();

          if (url.includes('message.sync')) {
            MessageHandler.handleNewMessage(data.data?.messages || []);
          } else if (url.includes('session.sync')) {
            MessageHandler.handleSessionChange(data.data?.sessions || []);
          } else if (url.includes('redpoint.query')) {
            const total = data.data?.total;
            if (typeof total !== 'undefined') {
              MessageHandler.handleUnreadChange(total);
            }
          }
        } catch (err) {
          log('解析响应失败:', err);
        }
      }

      return response;
    };

    log('Fetch 拦截已启用');
  }

  // DOM 监听器
  function startDOMListener() {
    if (!CONFIG.enableDOMListener) return;

    const findMessageContainer = () => {
      const selectors = [
        '[role="main"]',
        '.message-list',
        '[class*="chat"]',
        '[class*="session"]'
      ];

      for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container) {
          log('找到消息容器:', selector);
          return container;
        }
      }

      return null;
    };

    const container = findMessageContainer();
    if (!container) {
      log('未找到消息容器');
      return;
    }

    state.domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const text = node.textContent || '';
              log('DOM 变化:', text.substring(0, 50));

              MessageHandler.handleNewMessage({
                type: 'dom',
                content: text,
                element: node
              });
            }
          });
        }
      }
    });

    state.domObserver.observe(container, {
      childList: true,
      subtree: true
    });

    log('DOM 监听已启动');
  }

  // 停止 DOM 监听
  function stopDOMListener() {
    if (state.domObserver) {
      state.domObserver.disconnect();
      state.domObserver = null;
      log('DOM 监听已停止');
    }
  }

  // 轮询器
  function startPolling() {
    if (!CONFIG.enablePolling) return;

    const checkUnread = async () => {
      try {
        const unreadBadge = document.querySelector('[class*="unread"]') ||
                           document.querySelector('[class*="badge"]');

        if (unreadBadge) {
          const count = parseInt(unreadBadge.textContent) || 0;
          MessageHandler.handleUnreadChange(count);
        }
      } catch (err) {
        log('轮询错误:', err);
      }
    };

    state.pollTimer = setInterval(checkUnread, CONFIG.pollInterval);
    log('轮询已启动，间隔:', CONFIG.pollInterval, 'ms');
  }

  // 停止轮询
  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
      log('轮询已停止');
    }
  }

  // 心跳定时器
  function startHeartbeat() {
    if (!CONFIG.enableHeartbeat) return;

    // 立即发送一次
    CloudAPI.sendHeartbeat();

    // 定时发送
    state.heartbeatTimer = setInterval(() => {
      CloudAPI.sendHeartbeat();
    }, CONFIG.heartbeatInterval * 1000);

    log('心跳已启动，间隔:', CONFIG.heartbeatInterval, '秒');
  }

  // 停止心跳
  function stopHeartbeat() {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
      log('心跳已停止');
    }
  }

  // SSE 连接
  let eventSource = null;

  function startSSE() {
    if (!CONFIG.enableCloudSync) return;

    eventSource = CloudAPI.connectSSE((data) => {
      MessageHandler.handleCloudCommand(data);
    });
  }

  function stopSSE() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      log('SSE 连接已关闭');
    }
  }

  // 公开 API
  window.XianyuCloudIntegration = {
    // 启动
    start: function(options = {}) {
      if (state.isRunning) {
        log('集成已在运行');
        return;
      }

      // 合并配置
      Object.assign(CONFIG, options);

      state.isRunning = true;

      // 创建状态面板
      createStatusPanel();
      startStatusUpdater();

      // 启动各种功能
      interceptFetch();
      startDOMListener();
      startPolling();
      startHeartbeat();
      startSSE();

      log('集成已启动');
    },

    // 停止
    stop: function() {
      stopDOMListener();
      stopPolling();
      stopHeartbeat();
      stopSSE();
      stopStatusUpdater();
      removeStatusPanel();
      state.isRunning = false;
      log('集成已停止');
    },

    // 配置
    configure: function(options) {
      Object.assign(CONFIG, options);
      log('配置已更新:', CONFIG);
    },

    // 获取状态
    getState: function() {
      return { ...state };
    },

    // 获取配置
    getConfig: function() {
      return { ...CONFIG };
    },

    // 手动发送心跳
    sendHeartbeat: CloudAPI.sendHeartbeat,

    // 手动发送消息
    sendMessage: CloudAPI.sendMessage,

    // 手动获取指令
    getCommands: CloudAPI.getCommands
  };

  // 自动启动
  log('脚本已加载');
  log('使用方法:');
  log('1. 配置: XianyuCloudIntegration.configure({ cloudWorkerUrl: "your-worker-url", apiKey: "your-api-key" })');
  log('2. 启动: XianyuCloudIntegration.start()');
})();

// 使用示例:
// XianyuCloudIntegration.configure({
//   cloudWorkerUrl: 'https://your-worker.your-subdomain.workers.dev',
//   apiKey: 'your-api-key'
// });
// XianyuCloudIntegration.start();