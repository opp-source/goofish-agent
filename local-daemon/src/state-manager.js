import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import EventEmitter from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATE_FILE = join(__dirname, '../data/state.json');

export class StateManager extends EventEmitter {
  constructor() {
    super();
    this.state = {
      server: {
        startTime: null,
        port: null,
        version: '2.0.0',
        status: 'stopped'
      },
      browser: {
        lastHeartbeat: null,
        status: 'offline',
        unreadCount: 0,
        reportedCount: 0,
        lastMessage: null
      },
      claude: {
        status: 'unknown',
        lastCheck: null,
        messageProcessed: 0
      },
      messages: [],
      config: {}
    };
  }

  async init() {
    await this.load();
    this.state.server.startTime = Date.now();
    this.state.server.status = 'running';
    await this.save();
  }

  async load() {
    try {
      const data = await fs.readFile(STATE_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      this.state = { ...this.state, ...loaded };
      console.log('状态已从文件加载');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('状态文件不存在，使用默认状态');
        await this.ensureDataDir();
      } else {
        console.error('加载状态失败:', error.message);
      }
    }
  }

  async save() {
    try {
      await this.ensureDataDir();
      await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('保存状态失败:', error.message);
    }
  }

  async ensureDataDir() {
    const dataDir = dirname(STATE_FILE);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
    }
  }

  updateBrowserHeartbeat(data) {
    this.state.browser = {
      ...this.state.browser,
      lastHeartbeat: Date.now(),
      status: 'online',
      unreadCount: data.unreadCount || 0,
      lastMessage: data.lastMessage || null
    };
    this.save();
    this.emit('change', { type: 'browser', data: this.state.browser });
  }

  incrementReportedCount() {
    this.state.browser.reportedCount++;
    this.save();
    this.emit('change', { type: 'browser', data: this.state.browser });
  }

  updateClaudeStatus(status) {
    this.state.claude.status = status;
    this.state.claude.lastCheck = Date.now();
    this.save();
    this.emit('change', { type: 'claude', data: this.state.claude });
  }

  incrementMessageProcessed() {
    this.state.claude.messageProcessed++;
    this.save();
    this.emit('change', { type: 'claude', data: this.state.claude });
  }

  addMessage(message) {
    this.state.messages.unshift({
      ...message,
      receivedAt: Date.now()
    });
    
    if (this.state.messages.length > 100) {
      this.state.messages = this.state.messages.slice(0, 100);
    }
    
    this.save();
    this.emit('change', { type: 'messages', data: this.state.messages.slice(0, 10) });
  }

  getStatus() {
    const now = Date.now();
    
    const browserOnline = this.state.browser.lastHeartbeat && 
      (now - this.state.browser.lastHeartbeat < 120000);
    
    return {
      server: {
        ...this.state.server,
        uptime: this.state.server.startTime ? 
          Math.floor((now - this.state.server.startTime) / 1000) : 0,
        currentTime: now
      },
      browser: {
        ...this.state.browser,
        status: browserOnline ? 'online' : 'offline',
        lastHeartbeatAgo: this.state.browser.lastHeartbeat ? 
          Math.floor((now - this.state.browser.lastHeartbeat) / 1000) : null
      },
      claude: {
        ...this.state.claude,
        lastCheckAgo: this.state.claude.lastCheck ? 
          Math.floor((now - this.state.claude.lastCheck) / 1000) : null
      },
      messages: {
        total: this.state.messages.length,
        recent: this.state.messages.slice(0, 10)
      }
    };
  }

  notifyAgentScreenUpdate(screen) {
    this.emit('change', { type: 'agent', data: { screen, timestamp: Date.now() } });
  }

  notifyServerUpdate() {
    this.emit('change', { type: 'server', data: this.getStatus().server });
  }
}
