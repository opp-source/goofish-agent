/**
 * 闲鱼云端集成脚本
 * 在闲鱼消息页面中运行，集成云端通信和心跳功能
 *
 * 功能：
 * 1. 心跳上报到云端
 * 2. 消息检测和上报
 * 3. 未读会话扫描
 * 4. 状态面板显示
 */

(function() {
  'use strict';

  // 配置
  const CONFIG = {
    // 云端 Worker 地址
    cloudWorkerUrl: 'https://goofish-agent-worker.wgy.us.kg',
    // API Key
    apiKey: 'a9441d97d2e940752a5780111ec6e36588975ad9d4f6c1af88a2e987ce8daa04',
    // 心跳间隔（秒）
    heartbeatInterval: 60,
    // 消息检测间隔（毫秒）
    messagePollInterval: 10000,
    // 是否显示状态浮窗
    showStatusPanel: true,
    // 调试模式
    debug: true
  };

  // 状态
  let state = {
    isRunning: false,
    lastUnreadCount: 0,
    heartbeatTimer: null,
    messagePollTimer: null,
    connectionStatus: 'disconnected',
    lastHeartbeatTime: null,
    reportedCount: 0
  };

  // 状态面板元素
  let statusPanel = null;

  // 日志
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[闲鱼Agent]', new Date().toISOString(), ...args);
    }
  }

  function error(...args) {
    console.error('[闲鱼Agent]', new Date().toISOString(), ...args);
  }

  // ================== 状态面板 ==================

  function createStatusPanel() {
    if (!CONFIG.showStatusPanel) return;

    // 移除已存在的面板
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
        <span>未读</span>
        <span id="xianyu-unread-count">0</span>
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
    const unreadCount = statusPanel.querySelector('#xianyu-unread-count');
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
    unreadCount.textContent = state.lastUnreadCount;
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
            status: 'active',
            unreadCount: state.lastUnreadCount
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        log('心跳成功:', data);
        state.connectionStatus = 'connected';
        state.lastHeartbeatTime = Date.now();
        return data;
      } catch (err) {
        error('心跳失败:', err.message);
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
        log('消息上报成功:', data);
        state.reportedCount++;
        return data;
      } catch (err) {
        error('消息上报失败:', err.message);
        return null;
      }
    }
  };

  // ================== 消息检测器 ==================

  const MessageReporter = {
    // 获取当前聊天窗口信息
    getCurrentChatInfo() {
      const main = document.querySelector('main');
      if (!main) return null;

      const allText = main.innerText || '';
      const lines = allText.split('\n').filter(l => l.trim());

      // 第一行通常是买家名 (格式: "猫猫狗狗 (x***6)")
      let buyerName = lines[0] || '';
      if (buyerName.includes('(')) {
        buyerName = buyerName.split('(')[0].trim();
      }

      // 提取商品链接
      const itemLink = main.querySelector('a[href*="item?id="]');
      const itemUrl = itemLink ? itemLink.href : '';

      // 提取商品价格
      const priceMatch = allText.match(/¥([\d.]+)/);
      const itemPrice = priceMatch ? priceMatch[1] : '';

      return { buyerName, itemUrl, itemPrice };
    },

    // 扫描未读会话
    scanUnreadConversations() {
      const sidebar = document.querySelector('[role="complementary"]');
      if (!sidebar) return [];

      const unreadList = [];

      // 查找未读标记
      const badges = sidebar.querySelectorAll('[class*="badge"]');
      badges.forEach(badge => {
        const count = parseInt(badge.textContent);
        if (count > 0) {
          // 查找会话名称
          let parent = badge.parentElement;
          let sessionName = '未知会话';

          for (let i = 0; i < 5 && parent; i++) {
            const text = parent.textContent || '';
            const lines = text.split('\n').filter(l => l.trim());
            if (lines.length > 0 && lines[0] !== count.toString()) {
              sessionName = lines[0];
              break;
            }
            parent = parent.parentElement;
          }

          unreadList.push({
            sessionName,
            unreadCount: count
          });
        }
      });

      return unreadList;
    },

    // 获取最新买家消息
    getLatestBuyerMessage() {
      const main = document.querySelector('main');
      if (!main) return null;

      const allText = main.innerText || '';
      const lines = allText.split('\n').filter(l => l.trim());

      // 从后往前找买家消息
      // 逻辑：找到"未读"标记，往前找第一条非卖家消息
      const unreadIndex = lines.findIndex(l => l === '未读');

      if (unreadIndex > 0) {
        for (let i = unreadIndex - 1; i >= 0; i--) {
          const line = lines[i].trim();

          // 跳过时间和状态
          if (/^\d{1,2}:\d{2}$/.test(line)) continue;
          if (line === '已读' || line === '未读') continue;

          // 卖家消息，停止
          if (line === '我说停停') break;

          // 可能是买家消息
          if (line.length > 0 && line.length < 200) {
            // 获取聊天信息
            const chatInfo = this.getCurrentChatInfo();

            // 排除买家名自己
            if (chatInfo && line === chatInfo.buyerName) continue;

            return {
              buyerName: chatInfo ? chatInfo.buyerName : '未知',
              message: line,
              itemUrl: chatInfo ? chatInfo.itemUrl : '',
              itemPrice: chatInfo ? chatInfo.itemPrice : ''
            };
          }
        }
      }

      return null;
    },

    // 检查并上报
    async checkAndReport() {
      const unread = this.scanUnreadConversations();
      const totalUnread = unread.reduce((sum, u) => sum + u.unreadCount, 0);

      // 更新未读数
      if (totalUnread !== state.lastUnreadCount) {
        state.lastUnreadCount = totalUnread;
        log('未读数变化:', totalUnread);
      }

      // 检查最新消息
      const latestMsg = this.getLatestBuyerMessage();
      if (latestMsg) {
        log('检测到买家消息:', latestMsg);

        // 上报到云端
        await CloudAPI.reportMessage({
          type: 'buyer_message',
          sessionId: latestMsg.itemUrl || 'unknown',
          buyerName: latestMsg.buyerName || '未知买家',
          buyerId: 'unknown',
          lastMessage: latestMsg.message || '',
          unreadCount: totalUnread,
          itemPrice: latestMsg.itemPrice || '',
          itemUrl: latestMsg.itemUrl || '',
          timestamp: Date.now()
        });
      }

      return { unread, latestMsg };
    }
  };

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

  // ================== 消息检测定时器 ==================

  function startMessagePolling() {
    // 立即检查一次
    MessageReporter.checkAndReport();

    // 定时检查
    state.messagePollTimer = setInterval(() => {
      MessageReporter.checkAndReport();
    }, CONFIG.messagePollInterval);

    log('消息检测已启动，间隔:', CONFIG.messagePollInterval, 'ms');
  }

  function stopMessagePolling() {
    if (state.messagePollTimer) {
      clearInterval(state.messagePollTimer);
      state.messagePollTimer = null;
    }
  }

  // ================== WebSocket 拦截 ==================

  function interceptWebSocket() {
    // 保存原始 WebSocket
    const OriginalWebSocket = window.WebSocket;

    window.WebSocket = function(url, protocols) {
      log('WebSocket 创建:', url);

      const ws = new OriginalWebSocket(url, protocols);

      // 检查是否是闲鱼消息相关的 WebSocket
      if (url && (url.includes('accs') || url.includes('message'))) {
        log('检测到闲鱼消息 WebSocket');

        ws.addEventListener('message', (event) => {
          log('WebSocket 消息:', event.data);
          // 可以在这里解析消息并上报
        });
      }

      return ws;
    };

    window.WebSocket.prototype = OriginalWebSocket.prototype;
    log('WebSocket 拦截已启用');
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

      // 初始化
      createStatusPanel();
      startStatusUpdater();
      interceptWebSocket();
      startHeartbeat();
      startMessagePolling();

      log('集成已启动');
    },

    // 停止
    stop() {
      stopHeartbeat();
      stopMessagePolling();
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
      return { ...state };
    },

    // 手动发送心跳
    sendHeartbeat: CloudAPI.sendHeartbeat,

    // 手动上报消息
    reportMessage: CloudAPI.reportMessage,

    // 消息检测器
    reporter: MessageReporter
  };

  log('脚本已加载');
  log('使用: XianyuCloudIntegration.start()');
})();

// 使用示例:
// XianyuCloudIntegration.start();
// 或自定义配置:
// XianyuCloudIntegration.start({
//   cloudWorkerUrl: 'https://your-worker.example.com',
//   apiKey: 'your-api-key'
// });