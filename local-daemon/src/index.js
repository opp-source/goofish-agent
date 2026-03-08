import 'dotenv/config';
import { TmuxManager } from './tmux-manager.js';
import { CloudClient } from './cloud-client.js';

class LocalDaemon {
  constructor() {
    this.tmuxManager = new TmuxManager();
    this.cloudClient = new CloudClient();
    this.isProcessing = false;
    this.config = {
      workerUrl: process.env.CLOUD_WORKER_URL,
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
    this.log('info', '闲鱼销售 Agent 本地守护程序启动');
    this.log('debug', `配置: ${JSON.stringify(this.config, null, 2)}`);

    try {
      const sessionExists = await this.tmuxManager.checkSession();
      let claudeRunning = false;
      let claudeInitialized = false;

      if (sessionExists) {
        this.log('info', '检测到已存在的 tmux 会话');
        try {
          const claudeIsActive = await this.tmuxManager.isClaudeRunning();
          
          if (claudeIsActive) {
            claudeRunning = true;
            
            const status = await this.checkClaudeStatus();
            
            if (status === 'ready' || status === 'idle' || status === 'initializing' || status === 'busy') {
              claudeInitialized = true;
              this.log('info', `Claude 已在运行并${status === 'ready' || status === 'idle' ? '已就绪' : '正在处理'} (状态: ${status})`);
            } else {
              this.log('info', `Claude 已在运行，状态: ${status}，将发送初始化指令`);
            }
          }
        } catch (error) {
          this.log('warn', `检查 Claude 状态失败: ${error.message}`);
        }
      }

      if (!sessionExists) {
        await this.tmuxManager.init(this.config.tmuxSession);
        this.log('info', 'tmux 会话已初始化');
      }

      if (!claudeRunning) {
        await this.tmuxManager.startClaude(this.config.claudePath, this.config.workDir);
        this.log('info', 'Claude 已启动');

        await this.sleep(3000);
      }

      if (this.config.initCommand && !claudeInitialized) {
        await this.tmuxManager.sendToClaude(this.config.initCommand);
        this.log('info', '已发送初始化指令');

        await this.waitForCompletion(true);
      } else if (claudeInitialized) {
        this.log('info', '跳过初始化步骤（Claude 已就绪）');
      }

      await this.cloudClient.connect(this.config.workerUrl, this.config.apiKey);
      this.log('info', '已连接云端同步程序');

      this.cloudClient.on('new_message', (message) => this.handleNewMessage(message));
      this.cloudClient.on('error', (error) => this.handleError(error));

      this.log('info', '系统已就绪，等待消息...');

      this.startHeartbeat();

    } catch (error) {
      this.log('error', `启动失败: ${error.message}`);
      process.exit(1);
    }
  }

  async isClaudeActive() {
    try {
      const output = await this.tmuxManager.captureOutput();
      
      if (!output || output.trim() === '') {
        return false;
      }

      if (output.includes('opencode') || output.includes('I can help') || output.includes('What would you like')) {
        return true;
      }

      if (output.includes('sales-agent') && output.includes('Agent') && !output.includes('cd ')) {
        return true;
      }

      return false;
    } catch (error) {
      this.log('warn', `检测 Claude 活跃状态失败: ${error.message}`);
      return false;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async handleNewMessage(message) {
    this.log('info', `收到新消息: ${JSON.stringify(message)}`);

    if (this.isProcessing) {
      this.log('warn', '正在处理其他消息，忽略');
      return;
    }

    this.isProcessing = true;

    try {
      // 发送指令给 Claude
      const command = this.buildCommand(message);
      await this.tmuxManager.sendToClaude(command);
      this.log('info', '已向 Claude 发送处理指令');

      // 等待处理完成
      await this.waitForCompletion();

    } catch (error) {
      this.log('error', `处理消息失败: ${error.message}`);
      await this.cloudClient.reportError({
        type: 'processing_error',
        message: error.message,
        sessionId: message.sessionId,
        timestamp: Date.now()
      });
    } finally {
      this.isProcessing = false;
    }
  }

  buildCommand(message) {
    const parts = [
      `有新的买家消息，请处理：`,
      `会话ID: ${message.sessionId}`,
      `买家: ${message.buyerName} (ID: ${message.buyerId})`,
      `最新消息: ${message.lastMessage}`,
      `时间: ${new Date(message.timestamp).toLocaleString()}`,
      `未读数: ${message.unreadCount}`,
      message.tradeStatus ? `交易状态: ${message.tradeStatus}` : null,
      message.itemId ? `商品ID: ${message.itemId}` : null,
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
      this.log('debug', `tmux 输出 (最后20行):\n${lastLines}`);
      
      if (output.includes('系统已就绪') || output.includes('正在监听买家消息')) {
        this.log('debug', '检测到 ready 状态: 系统已就绪/监听买家消息');
        return 'ready';
      }

      if (output.includes('✔ 初始化闲鱼销售 Agent')) {
        this.log('debug', '检测到 ready 状态: 初始化完成');
        return 'ready';
      }

      if (output.includes('Agent ready') || output.includes('I am goofish-agent') || output.includes('system initialized')) {
        this.log('debug', '检测到 ready 状态');
        return 'ready';
      }

      const lines = output.split('\n');
      const recentContent = lines.slice(-10).join('\n');

      if (recentContent.includes('初始化闲鱼销售 Agent') && recentContent.includes('⏺')) {
        this.log('debug', '检测到 initializing 状态');
        return 'initializing';
      }

      if (recentContent.includes('Thinking') || recentContent.includes('Analyzing') || recentContent.includes('Processing') || recentContent.includes('Working') || recentContent.includes('思考中') || recentContent.includes('处理中') || recentContent.includes('Propagating') && !recentContent.includes('Churned')) {
        this.log('debug', '检测到 busy 状态');
        return 'busy';
      }

      if (recentContent.includes('What would you like') || recentContent.includes('I can help') || recentContent.match(/>$/m) || recentContent.includes('什么可以帮')) {
        this.log('debug', '检测到 idle 状态');
        return 'idle';
      }

      if (recentContent.includes('Error') || recentContent.includes('Failed') || recentContent.includes('错误')) {
        this.log('debug', '检测到 error 状态');
        return 'error';
      }

      this.log('debug', '状态未知');
      return 'unknown';
    } catch (error) {
      this.log('warn', `检查 Claude 状态失败: ${error.message}`);
      return 'error';
    }
  }

  handleError(error) {
    this.log('error', `云端连接错误: ${error.message}`);
  }

  startHeartbeat() {
    setInterval(async () => {
      try {
        await this.cloudClient.sendHeartbeat();
        this.log('debug', '心跳已发送');
      } catch (error) {
        this.log('error', `心跳发送失败: ${error.message}`);
      }
    }, 60000);
  }
}

// 启动守护程序
const daemon = new LocalDaemon();
daemon.start();

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭守护程序...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n正在关闭守护程序...');
  process.exit(0);
});
