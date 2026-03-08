/**
 * 闲鱼消息监听器
 * 在闲鱼消息页面中运行，监听新消息到达
 */

(function() {
  'use strict';

  // 配置
  const CONFIG = {
    // 轮询间隔（毫秒）
    pollInterval: 5000,
    // 是否启用 DOM 监听
    enableDOMListener: true,
    // 是否启用轮询
    enablePolling: true,
    // 调试模式
    debug: true
  };

  // 消息处理器
  const handlers = {
    onNewMessage: null,
    onUnreadChange: null,
    onSessionChange: null
  };

  // 状态
  let state = {
    lastUnreadCount: 0,
    lastSessionId: null,
    isRunning: false,
    pollTimer: null,
    domObserver: null
  };

  // 日志
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[闲鱼监听器]', ...args);
    }
  }

  // 拦截 fetch 请求
  function interceptFetch() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);

      // 检查是否是消息相关 API
      const url = args[0];
      if (typeof url === 'string' && url.includes('idlemessage')) {
        log('拦截到 API 请求:', url);

        // 克隆响应以便读取
        const clonedResponse = response.clone();

        try {
          const data = await clonedResponse.json();

          // 处理不同类型的 API 响应
          if (url.includes('message.sync')) {
            handleMessageSync(data);
          } else if (url.includes('session.sync')) {
            handleSessionSync(data);
          } else if (url.includes('redpoint.query')) {
            handleRedpointQuery(data);
          }
        } catch (e) {
          log('解析响应失败:', e);
        }
      }

      return response;
    };

    log('Fetch 拦截已启用');
  }

  // 处理消息同步
  function handleMessageSync(data) {
    if (data.data && data.data.messages) {
      log('新消息:', data.data.messages.length);

      if (handlers.onNewMessage) {
        handlers.onNewMessage(data.data.messages);
      }
    }
  }

  // 处理会话同步
  function handleSessionSync(data) {
    if (data.data && data.data.sessions) {
      log('会话更新:', data.data.sessions.length);

      if (handlers.onSessionChange) {
        handlers.onSessionChange(data.data.sessions);
      }
    }
  }

  // 处理红点查询
  function handleRedpointQuery(data) {
    if (data.data && typeof data.data.total !== 'undefined') {
      const total = data.data.total;

      if (total !== state.lastUnreadCount) {
        log('未读数变化:', state.lastUnreadCount, '->', total);
        state.lastUnreadCount = total;

        if (handlers.onUnreadChange) {
          handlers.onUnreadChange(total);
        }
      }
    }
  }

  // DOM 监听器
  function startDOMListener() {
    if (!CONFIG.enableDOMListener) return;

    // 查找消息容器
    const findMessageContainer = () => {
      // 尝试多种选择器
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

    // 创建观察器
    state.domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const text = node.textContent || '';
              log('DOM 变化:', text.substring(0, 50));

              if (handlers.onNewMessage) {
                handlers.onNewMessage({
                  type: 'dom',
                  content: text,
                  element: node
                });
              }
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

    // 检查未读数的函数
    const checkUnread = async () => {
      try {
        // 从页面获取未读数
        const unreadBadge = document.querySelector('[class*="unread"]') ||
                           document.querySelector('[class*="badge"]');

        if (unreadBadge) {
          const count = parseInt(unreadBadge.textContent) || 0;

          if (count !== state.lastUnreadCount) {
            log('未读数变化 (轮询):', state.lastUnreadCount, '->', count);
            state.lastUnreadCount = count;

            if (handlers.onUnreadChange) {
              handlers.onUnreadChange(count);
            }
          }
        }
      } catch (e) {
        log('轮询错误:', e);
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

  // 浏览器通知监听
  function setupNotificationListener() {
    // 检查通知权限
    if ('Notification' in window) {
      log('通知权限:', Notification.permission);

      // 重写 Notification 构造函数
      const OriginalNotification = window.Notification;

      window.Notification = function(title, options) {
        log('浏览器通知:', title, options);

        if (handlers.onNewMessage) {
          handlers.onNewMessage({
            type: 'notification',
            title: title,
            body: options ? options.body : null
          });
        }

        return new OriginalNotification(title, options);
      };

      window.Notification.prototype = OriginalNotification.prototype;
      window.Notification.permission = OriginalNotification.permission;
      window.Notification.requestPermission = OriginalNotification.requestPermission;

      log('通知拦截已启用');
    }
  }

  // 公开 API
  window.XianyuMessageListener = {
    // 启动监听
    start: function() {
      if (state.isRunning) {
        log('监听器已在运行');
        return;
      }

      state.isRunning = true;

      // 启用各种监听方式
      interceptFetch();
      startDOMListener();
      startPolling();
      setupNotificationListener();

      log('监听器已启动');
    },

    // 停止监听
    stop: function() {
      stopDOMListener();
      stopPolling();
      state.isRunning = false;
      log('监听器已停止');
    },

    // 设置消息处理器
    onMessage: function(callback) {
      handlers.onNewMessage = callback;
    },

    onUnreadChange: function(callback) {
      handlers.onUnreadChange = callback;
    },

    onSessionChange: function(callback) {
      handlers.onSessionChange = callback;
    },

    // 获取当前状态
    getState: function() {
      return { ...state };
    },

    // 更新配置
    setConfig: function(newConfig) {
      Object.assign(CONFIG, newConfig);
      log('配置已更新:', CONFIG);
    }
  };

  // 自动启动
  log('脚本已加载，调用 XianyuMessageListener.start() 启动监听');
})();

// 使用示例:
// XianyuMessageListener.onMessage((msg) => console.log('新消息:', msg));
// XianyuMessageListener.start();