import EventSource from 'eventsource';

export class CloudClient {
  constructor() {
    this.eventSource = null;
    this.handlers = {
      new_message: [],
      heartbeat: [],
      error: []
    };
    this.workerUrl = null;
    this.apiKey = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.isConnecting = false;
  }

  async connect(workerUrl, apiKey) {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.workerUrl = workerUrl;
    this.apiKey = apiKey;

    const url = `${workerUrl}/events`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.isConnecting = false;
        reject(new Error('SSE 连接超时'));
      }, 30000);

      try {
        this.eventSource = new EventSource(url, {
          headers: {
            'X-API-Key': apiKey
          }
        });

        this.eventSource.onopen = () => {
          console.log('SSE 连接已建立');
          clearTimeout(timeout);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('解析消息失败:', error);
          }
        };

        this.eventSource.onerror = (error) => {
          console.error('SSE 连接错误:', error);
          clearTimeout(timeout);
          this.isConnecting = false;
          
          if (this.reconnectAttempts === 0) {
            this.handlers.error.forEach(handler => handler(error));
            reject(error);
          }
          
          this.autoReconnect();
        };

      } catch (error) {
        clearTimeout(timeout);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  async autoReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`重连失败次数达到上限 (${this.maxReconnectAttempts})，停止重连`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 6);
    
    console.log(`${delay/1000}秒后尝试第 ${this.reconnectAttempts} 次重连...`);
    
    await this.sleep(delay);
    
    try {
      await this.connect(this.workerUrl, this.apiKey);
      console.log('重连成功');
    } catch (error) {
      console.error(`第 ${this.reconnectAttempts} 次重连失败:`, error.message);
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'connected':
        console.log('已连接到云端服务');
        break;
      case 'new_message':
      case 'unread_conversation':
        this.handlers.new_message.forEach(handler => handler(data));
        break;
      case 'heartbeat':
        console.log('收到心跳:', data.timestamp);
        this.handlers.heartbeat.forEach(handler => handler(data));
        break;
      default:
        console.log('未知消息类型:', data.type);
    }
  }

  on(event, handler) {
    if (this.handlers[event]) {
      this.handlers[event].push(handler);
    }
  }

  off(event, handler) {
    if (this.handlers[event]) {
      const index = this.handlers[event].indexOf(handler);
      if (index > -1) {
        this.handlers[event].splice(index, 1);
      }
    }
  }

  async reportError(errorData) {
    if (!this.workerUrl || !this.apiKey) {
      console.error('无法报告错误：未连接到云端');
      return;
    }

    try {
      const response = await fetch(`${this.workerUrl}/api/error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify(errorData)
      });

      if (!response.ok) {
        throw new Error(`错误报告失败: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('报告错误失败:', error.message);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('SSE 连接已断开');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}