import 'dotenv/config';
import http from 'http';
import { TmuxManager } from './tmux-manager.js';
import { StateManager } from './state-manager.js';

class AgentServer {
  constructor() {
    this.tmuxManager = new TmuxManager();
    this.stateManager = new StateManager();
    this.server = null;
    this.isProcessing = false;
    this.sseClients = new Set();
    this.lastScreenContent = '';
    this.lastScreenChangeTime = 0;
    this.screenPollTimeout = null;
    this.config = {
      port: parseInt(process.env.PORT) || 8888,
      apiKey: process.env.API_KEY,
      tmuxSession: process.env.TMUX_SESSION || 'goofish-agent',
      claudePath: process.env.CLAUDE_PATH || '/usr/local/bin/claude',
      workDir: process.env.WORK_DIR || process.cwd(),
      logLevel: process.env.LOG_LEVEL || 'info',
      messageTimeout: parseInt(process.env.MESSAGE_TIMEOUT) || 300000,
      initCommand: process.env.INIT_COMMAND || '/init'
    };
  }

  log(level, message) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[this.config.logLevel]) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  async start() {
    this.log('info', '闲鱼销售 Agent 服务启动');
    this.log('debug', `配置: ${JSON.stringify(this.config, null, 2)}`);

    try {
      await this.stateManager.init();
      this.stateManager.state.config = this.config;
      await this.stateManager.save();

      this.setupEventListeners();

      const sessionExists = await this.tmuxManager.checkSession();
      let claudeRunning = false;

      if (sessionExists) {
        this.log('info', '检测到已存在的 tmux 会话');
        const claudeIsActive = await this.tmuxManager.isClaudeRunning();
        if (claudeIsActive) {
          claudeRunning = true;
          this.log('info', 'Claude 已在运行');
          this.stateManager.updateClaudeStatus('running');
        }
      }

      if (!sessionExists) {
        await this.tmuxManager.init(this.config.tmuxSession);
        this.log('info', 'tmux 会话已初始化');
      }

      if (!claudeRunning) {
        await this.tmuxManager.startClaude(this.config.claudePath, this.config.workDir);
        this.log('info', 'Claude 已启动');
        this.stateManager.updateClaudeStatus('starting');
        await this.sleep(3000);
      }

      await this.startHttpServer();

      this.log('info', `HTTP 服务已启动: http://localhost:${this.config.port}`);
      this.log('info', '系统已就绪，等待消息...');

    } catch (error) {
      this.log('error', `启动失败: ${error.message}`);
      process.exit(1);
    }
  }

  setupEventListeners() {
    this.stateManager.on('change', (event) => {
      this.broadcastToSSEClients(event);
    });

    this.startScreenPolling();
  }

  startScreenPolling() {
    this.pollScreen();
  }

  async pollScreen() {
    try {
      const screen = await this.tmuxManager.captureOutput();
      const now = Date.now();
      
      if (screen !== this.lastScreenContent) {
        this.lastScreenContent = screen;
        this.lastScreenChangeTime = now;
        this.stateManager.notifyAgentScreenUpdate(screen);
      }
      
      const interval = this.calculatePollInterval(now);
      this.screenPollTimeout = setTimeout(() => this.pollScreen(), interval);
      
    } catch (error) {
      this.log('error', `获取 Agent 屏幕失败: ${error.message}`);
      this.screenPollTimeout = setTimeout(() => this.pollScreen(), 5000);
    }
  }

  calculatePollInterval(now) {
    const MIN_INTERVAL = 42;
    const MAX_INTERVAL = 5000;
    const IDLE_THRESHOLD = 3000;
    
    const timeSinceChange = now - this.lastScreenChangeTime;
    
    if (timeSinceChange < IDLE_THRESHOLD) {
      return MIN_INTERVAL;
    }
    
    const idleFactor = Math.min(timeSinceChange / IDLE_THRESHOLD, 10);
    return Math.min(MIN_INTERVAL * idleFactor, MAX_INTERVAL);
  }

  async startHttpServer() {
    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, () => {
        this.stateManager.state.server.port = this.config.port;
        this.stateManager.save();
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  async handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.config.port}`);
    const method = req.method;

    this.setCorsHeaders(res);

    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      if (url.pathname === '/health' && method === 'GET') {
        await this.handleHealth(req, res);
        return;
      }

      if (url.pathname === '/status' && method === 'GET') {
        await this.handleStatus(req, res);
        return;
      }

      if (url.pathname === '/' && method === 'GET') {
        await this.handleStatusPage(req, res);
        return;
      }

      if (url.pathname === '/api/message' && method === 'POST') {
        await this.handleMessage(req, res);
        return;
      }

      if (url.pathname === '/heartbeat/browser' && method === 'POST') {
        await this.handleBrowserHeartbeat(req, res);
        return;
      }

      if (url.pathname === '/api/config' && method === 'GET') {
        await this.handleGetConfig(req, res);
        return;
      }

      if (url.pathname === '/api/messages' && method === 'GET') {
        await this.handleGetMessages(req, res);
        return;
      }

      if (url.pathname === '/api/claude/status' && method === 'GET') {
        await this.handleClaudeStatus(req, res);
        return;
      }

      if (url.pathname === '/api/agent/screen' && method === 'GET') {
        await this.handleAgentScreen(req, res);
        return;
      }

      if (url.pathname === '/events' && method === 'GET') {
        await this.handleSSE(req, res);
        return;
      }

      if (url.pathname === '/api/browser/messages' && method === 'POST') {
        await this.handleBrowserMessages(req, res);
        return;
      }

      if (url.pathname === '/api/command' && method === 'POST') {
        await this.handleCommand(req, res);
        return;
      }

      this.sendJson(res, { error: 'Not Found' }, 404);

    } catch (error) {
      this.log('error', `请求处理失败: ${error.message}`);
      this.sendJson(res, { success: false, error: error.message }, 500);
    }
  }

  setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  }

  async handleHealth(req, res) {
    this.sendJson(res, {
      success: true,
      status: 'healthy',
      timestamp: Date.now()
    });
  }

  async handleStatus(req, res) {
    const status = this.stateManager.getStatus();
    this.sendJson(res, {
      success: true,
      ...status
    });
  }

  async handleStatusPage(req, res) {
    const status = this.stateManager.getStatus();
    const html = this.generateStatusPageHTML(status);
    
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8'
    });
    res.end(html);
  }

  async handleMessage(req, res) {
    const apiKey = req.headers['x-api-key'];
    if (this.config.apiKey && apiKey !== this.config.apiKey) {
      this.sendJson(res, { success: false, error: 'Invalid API key' }, 401);
      return;
    }

    const message = await this.parseBody(req);
    this.log('info', `收到消息: ${JSON.stringify(message)}`);

    this.stateManager.addMessage(message);
    this.stateManager.incrementReportedCount();

    this.sendJson(res, { 
      success: true, 
      message: '消息已接收'
    });

    this.processMessageAsync(message);
  }

  async processMessageAsync(message) {
    if (this.isProcessing) {
      this.log('warn', '正在处理其他消息，排队等待');
      return;
    }

    this.isProcessing = true;

    try {
      const command = this.buildCommand(message);
      await this.tmuxManager.sendToClaude(command);
      this.log('info', '已向 Claude 发送处理指令');

      await this.waitForCompletion();
      this.stateManager.incrementMessageProcessed();

    } catch (error) {
      this.log('error', `处理消息失败: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  async handleBrowserHeartbeat(req, res) {
    const data = await this.parseBody(req);
    
    this.stateManager.updateBrowserHeartbeat(data);
    
    this.log('debug', `浏览器心跳: ${JSON.stringify(data)}`);
    
    this.sendJson(res, { 
      success: true, 
      timestamp: Date.now()
    });
  }

  async handleGetConfig(req, res) {
    this.sendJson(res, {
      success: true,
      config: {
        port: this.config.port,
        tmuxSession: this.config.tmuxSession,
        logLevel: this.config.logLevel
      }
    });
  }

  async handleGetMessages(req, res) {
    const status = this.stateManager.getStatus();
    this.sendJson(res, {
      success: true,
      messages: status.messages.recent,
      total: status.messages.total
    });
  }

  async handleClaudeStatus(req, res) {
    const claudeStatus = await this.checkClaudeStatus();
    this.stateManager.updateClaudeStatus(claudeStatus);
    
    this.sendJson(res, {
      success: true,
      status: claudeStatus
    });
  }

  async handleAgentScreen(req, res) {
    try {
      const screen = await this.tmuxManager.captureOutput();
      const status = await this.checkClaudeStatus();
      this.stateManager.updateClaudeStatus(status);
      this.stateManager.notifyAgentScreenUpdate(screen);
      
      this.sendJson(res, {
        success: true,
        screen: screen,
        status: status,
        timestamp: Date.now()
      });
    } catch (error) {
      this.log('error', `获取 Agent 屏幕失败: ${error.message}`);
      this.sendJson(res, { 
        success: false, 
        error: error.message 
      }, 500);
    }
  }

  async handleSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const clientId = Date.now();
    const client = { id: clientId, res };
    this.sseClients.add(client);
    this.log('debug', `SSE 客户端连接: ${clientId}, 当前连接数: ${this.sseClients.size}`);

    const sendInitial = async () => {
      try {
        const status = this.stateManager.getStatus();
        const screen = await this.tmuxManager.captureOutput();
        
        const data = {
          ...status,
          agent: {
            screen: screen,
            status: this.stateManager.state.claude.status,
            timestamp: Date.now()
          }
        };
        
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        this.log('error', `SSE 初始数据发送失败: ${error.message}`);
      }
    };

    await sendInitial();

    req.on('close', () => {
      this.sseClients.delete(client);
      this.log('debug', `SSE 客户端断开: ${clientId}, 当前连接数: ${this.sseClients.size}`);
    });
  }

  broadcastToSSEClients(event) {
    if (this.sseClients.size === 0) return;

    const status = this.stateManager.getStatus();
    let data = { ...status };

    if (event.type === 'agent') {
      data.agent = event.data;
    } else {
      data.agent = {
        screen: null,
        status: this.stateManager.state.claude.status,
        timestamp: Date.now()
      };
    }

    const message = `data: ${JSON.stringify(data)}\n\n`;
    
    this.sseClients.forEach(client => {
      try {
        client.res.write(message);
      } catch (error) {
        this.log('debug', `发送 SSE 消息失败，移除客户端: ${client.id}`);
        this.sseClients.delete(client);
      }
    });
  }

  async handleBrowserMessages(req, res) {
    const data = await this.parseBody(req);
    
    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach(msg => {
        this.stateManager.addMessage(msg);
      });
      this.log('info', `收到浏览器上报的 ${data.messages.length} 条消息`);
    }
    
    this.sendJson(res, {
      success: true,
      timestamp: Date.now()
    });
  }

  async handleCommand(req, res) {
    const data = await this.parseBody(req);
    
    if (!data.command || typeof data.command !== 'string') {
      this.sendJson(res, { success: false, error: '无效的命令' }, 400);
      return;
    }
    
    try {
      await this.tmuxManager.sendToClaude(data.command);
      this.log('info', `已发送命令: ${data.command}`);
      
      this.sendJson(res, {
        success: true,
        message: '命令已发送',
        timestamp: Date.now()
      });
    } catch (error) {
      this.log('error', `发送命令失败: ${error.message}`);
      this.sendJson(res, { success: false, error: error.message }, 500);
    }
  }

  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  sendJson(res, data, status = 200) {
    res.writeHead(status, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify(data));
  }

  buildCommand(message) {
    const parts = [
      `有新的买家消息，请处理：`,
      `会话ID: ${message.sessionId || 'unknown'}`,
      `买家: ${message.buyerName || '未知'} (ID: ${message.buyerId || 'unknown'})`,
      `最新消息: ${message.lastMessage || '无内容'}`,
      `时间: ${new Date(message.timestamp || Date.now()).toLocaleString()}`,
      `未读数: ${message.unreadCount || 0}`,
      message.itemPrice ? `商品价格: ${message.itemPrice}` : null,
      message.itemUrl ? `商品链接: ${message.itemUrl}` : null,
      `请打开聊天窗口查看详情并回复。`
    ].filter(Boolean).join(' | ');
    
    return parts;
  }

  async waitForCompletion(isInit = false) {
    const checkInterval = 20000;
    const timeout = isInit ? 300000 : 60000;
    const startTime = Date.now();

    this.log('info', isInit ? '等待初始化完成...' : '等待 Claude 处理完成...');

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        const elapsed = Date.now() - startTime;

        if (elapsed >= timeout) {
          this.log('error', `等待超时 (${timeout/1000}秒)`);
          if (isInit) {
            this.log('warn', '初始化可能未完成，但继续启动');
            resolve();
          } else {
            reject(new Error('Claude 处理超时'));
          }
          return;
        }

        try {
          const status = await this.checkClaudeStatus();
          
          if (status === 'ready') {
            this.log('info', 'Claude 已就绪');
            resolve();
            return;
          }

          if (status === 'idle' && !isInit) {
            this.log('info', 'Claude 处理完成');
            resolve();
            return;
          }

          this.log('debug', `Claude 状态: ${status}, 继续等待...`);

        } catch (error) {
          this.log('warn', `检查状态失败: ${error.message}`);
        }

        setTimeout(checkStatus, checkInterval);
      };

      checkStatus();
    });
  }

  async checkClaudeStatus() {
    try {
      const output = await this.tmuxManager.captureOutput();
      
      const lastLines = output.split('\n').slice(-20).join('\n');
      
      if (output.includes('系统已就绪') || output.includes('正在监听买家消息')) {
        return 'ready';
      }

      if (output.includes('✔ 初始化闲鱼销售 Agent')) {
        return 'ready';
      }

      if (output.includes('Agent ready') || output.includes('I am goofish-agent')) {
        return 'ready';
      }

      const lines = output.split('\n');
      const recentContent = lines.slice(-10).join('\n');

      if (recentContent.includes('初始化闲鱼销售 Agent') && recentContent.includes('⏺')) {
        return 'initializing';
      }

      if (recentContent.includes('Thinking') || recentContent.includes('Analyzing') || 
          recentContent.includes('Processing') || recentContent.includes('Working')) {
        return 'busy';
      }

      if (recentContent.includes('What would you like') || recentContent.includes('I can help')) {
        return 'idle';
      }

      if (recentContent.includes('Error') || recentContent.includes('Failed')) {
        return 'error';
      }

      return 'unknown';
    } catch (error) {
      this.log('warn', `检查 Claude 状态失败: ${error.message}`);
      return 'error';
    }
  }

  generateStatusPageHTML(status) {
    const uptimeHours = Math.floor(status.server.uptime / 3600);
    const uptimeMinutes = Math.floor((status.server.uptime % 3600) / 60);
    
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>闲鱼 Agent 控制台</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 12px;
    }
    .container {
      max-width: 1800px;
      margin: 0 auto;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .browser-status {
      background: white;
      border-radius: 8px;
      padding: 8px 15px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      color: #333;
      font-size: 13px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
      flex-shrink: 0;
    }
    .browser-status .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      animation: pulse 2s infinite;
      vertical-align: middle;
      margin-right: 4px;
    }
    .browser-status .status-indicator.online { background: #4caf50; }
    .browser-status .status-indicator.offline { background: #f44336; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .screen-card {
      flex: 0 0 auto;
      background: white;
      border-radius: 12px;
      padding: 15px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
    }
    .screen-container {
      background: #1e1e1e;
      border-radius: 8px;
      padding: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Menlo', 'Consolas', 'Liberation Mono', monospace;
      font-size: 13px;
      color: #d4d4d4;
      overflow: auto;
      white-space: pre;
      word-break: keep-all;
      line-height: 1.5;
      letter-spacing: 0.5px;
    }
    .command-input {
      display: flex;
      gap: 10px;
      margin-top: 12px;
      flex-shrink: 0;
    }
    .command-input input {
      flex: 1;
      padding: 10px 15px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.3s;
    }
    .command-input input:focus {
      border-color: #667eea;
    }
    .command-input button {
      padding: 10px 25px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .command-input button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .messages-card {
      flex: 1;
      background: white;
      border-radius: 12px;
      padding: 15px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .messages-card h3 {
      font-size: 14px;
      margin-bottom: 10px;
      color: #666;
    }
    .message-list {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      overflow-y: auto;
    }
    .message-item {
      padding: 8px 10px;
      background: #f8f9fa;
      border-radius: 5px;
      font-size: 12px;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      font-size: 11px;
    }
    .message-buyer {
      font-weight: 600;
      color: #667eea;
    }
    .message-time {
      color: #999;
    }
    .message-content {
      color: #333;
      word-break: break-all;
      line-height: 1.3;
    }
    .empty-state {
      grid-column: 1 / -1;
      text-align: center;
      padding: 30px;
      color: #999;
    }
    @media (max-width: 1200px) {
      .message-list {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    @media (max-width: 800px) {
      .message-list {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="browser-status" id="browserStatusRow">
      <span>🌐 浏览器: <span class="status-indicator ${status.browser.status}"></span><span id="browserStatusText">${status.browser.status === 'online' ? '在线' : '离线'}</span></span>
      <span>未读 <strong id="browserUnread">${status.browser.unreadCount}</strong></span>
      <span>已上报 <strong id="browserReported">${status.browser.reportedCount}</strong></span>
      <span>运行 <strong id="serverUptime">${uptimeHours}h ${uptimeMinutes}m</strong></span>
      <span>v<strong id="serverVersion">${status.server.version}</strong></span>
    </div>
    
    <div class="screen-card">
      <div class="screen-container" id="agentScreen">正在加载...</div>
      <div class="command-input">
        <input type="text" id="commandInput" placeholder="输入命令发送给 Claude..." />
        <button onclick="sendCommand()">发送</button>
      </div>
    </div>
    
    <div class="messages-card">
      <h3>最近消息</h3>
      <div class="message-list" id="messagesList">
        ${status.messages.recent.length > 0 ? 
          status.messages.recent.slice(-20).map(msg => `
            <div class="message-item">
              <div class="message-header">
                <span class="message-buyer">${msg.buyerName || '未知买家'}</span>
                <span class="message-time">${new Date(msg.receivedAt).toLocaleString()}</span>
              </div>
              <div class="message-content">${msg.lastMessage || '无内容'}</div>
            </div>
          `).join('') :
          '<div class="empty-state">暂无消息</div>'
        }
      </div>
    </div>
  </div>
  
  <script>
    let eventSource = null;
    
    function connectSSE() {
      eventSource = new EventSource('/events');
      
      eventSource.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          updateUI(data);
        } catch (error) {
          console.error('解析 SSE 数据失败:', error);
        }
      };
      
      eventSource.onerror = function(error) {
        console.error('SSE 连接错误:', error);
        eventSource.close();
        setTimeout(connectSSE, 3000);
      };
    }
    
    var prevState = {
      browser: null,
      screen: null,
      messages: null
    };
    
    function updateUI(data) {
      if (data.browser) {
        var statusClass = data.browser.status === 'online' ? 'online' : 'offline';
        var statusText = data.browser.status === 'online' ? '在线' : '离线';
        
        var statusIndicator = document.querySelector('#browserStatusRow .status-indicator');
        if (statusIndicator) {
          statusIndicator.className = 'status-indicator ' + statusClass;
        }
        updateTextIfChanged('browserStatusText', statusText);
        updateTextIfChanged('browserUnread', data.browser.unreadCount);
        updateTextIfChanged('browserReported', data.browser.reportedCount);
      }
      
      if (data.server) {
        var hours = Math.floor(data.server.uptime / 3600);
        var minutes = Math.floor((data.server.uptime % 3600) / 60);
        updateTextIfChanged('serverUptime', hours + 'h ' + minutes + 'm');
        updateTextIfChanged('serverVersion', data.server.version);
      }
      
      if (data.agent && data.agent.screen) {
        if (prevState.screen !== data.agent.screen) {
          var screenEl = document.getElementById('agentScreen');
          screenEl.textContent = data.agent.screen;
          prevState.screen = data.agent.screen;
          adjustScreenFontSize(screenEl);
        }
      }
      
      if (data.messages && data.messages.recent) {
        var messagesKey = JSON.stringify(data.messages.recent.slice(-20).map(function(m) { return m.receivedAt; }));
        if (prevState.messages !== messagesKey) {
          var messagesEl = document.getElementById('messagesList');
          var recentMessages = data.messages.recent.slice(-20);
          if (recentMessages.length > 0) {
            messagesEl.innerHTML = recentMessages.map(function(msg) {
              return '<div class="message-item">' +
                '<div class="message-header">' +
                  '<span class="message-buyer">' + (msg.buyerName || '未知买家') + '</span>' +
                  '<span class="message-time">' + new Date(msg.receivedAt).toLocaleString() + '</span>' +
                '</div>' +
                '<div class="message-content">' + (msg.lastMessage || '无内容') + '</div>' +
              '</div>';
            }).join('');
          } else {
            messagesEl.innerHTML = '<div class="empty-state">暂无消息</div>';
          }
          prevState.messages = messagesKey;
        }
      }
    }
    
    function updateTextIfChanged(id, newValue) {
      var el = document.getElementById(id);
      if (el && el.textContent !== String(newValue)) {
        el.textContent = newValue;
      }
    }
    
    function adjustScreenFontSize(screenEl) {
      var minFontSize = 9;
      var maxFontSize = 15;
      var currentFontSize = maxFontSize;
      
      screenEl.style.fontSize = currentFontSize + 'px';
      
      var hasOverflow = screenEl.scrollWidth > screenEl.clientWidth || screenEl.scrollHeight > screenEl.clientHeight;
      
      while (hasOverflow && currentFontSize > minFontSize) {
        currentFontSize--;
        screenEl.style.fontSize = currentFontSize + 'px';
        hasOverflow = screenEl.scrollWidth > screenEl.clientWidth || screenEl.scrollHeight > screenEl.clientHeight;
      }
    }
    
    function sendCommand() {
      var input = document.getElementById('commandInput');
      var command = input.value.trim();
      
      if (!command) {
        return;
      }
      
      fetch('/api/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: command })
      })
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        if (data.success) {
          input.value = '';
        } else {
          alert('发送失败: ' + data.error);
        }
      })
      .catch(function(error) {
        alert('发送失败: ' + error.message);
      });
    }
    
    document.getElementById('commandInput').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        sendCommand();
      }
    });
    
    connectSSE();
    
    window.addEventListener('resize', function() {
      var screenEl = document.getElementById('agentScreen');
      if (screenEl && screenEl.textContent) {
        adjustScreenFontSize(screenEl);
      }
    });
  </script>
</body>
</html>
    `;
  }

  getStatusText(status) {
    const texts = {
      'running': '运行中',
      'online': '在线',
      'offline': '离线',
      'busy': '忙碌',
      'idle': '空闲',
      'ready': '就绪',
      'initializing': '初始化中',
      'error': '错误',
      'unknown': '未知'
    };
    return texts[status] || status;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    this.log('info', '正在关闭服务...');
    
    if (this.screenPollTimeout) {
      clearTimeout(this.screenPollTimeout);
    }
    
    this.sseClients.forEach(client => {
      try {
        client.res.end();
      } catch (e) {}
    });
    this.sseClients.clear();
    
    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
      this.log('info', 'HTTP 服务已关闭');
    }
    
    process.exit(0);
  }
}

const agentServer = new AgentServer();
agentServer.start();

process.on('SIGINT', async () => {
  console.log('\n收到 SIGINT 信号');
  await agentServer.shutdown();
});

process.on('SIGTERM', async () => {
  console.log('\n收到 SIGTERM 信号');
  await agentServer.shutdown();
});
