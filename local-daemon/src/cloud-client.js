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
  }

  async connect(workerUrl, apiKey) {
    this.workerUrl = workerUrl;
    this.apiKey = apiKey;

    const url = `${workerUrl}/events`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SSE 连接超时'));
      }, 30000);

      this.eventSource = new EventSource(url, {
        headers: {
          'X-API-Key': apiKey
        }
      });

      this.eventSource.onopen = () => {
        console.log('SSE 连接已建立');
        clearTimeout(timeout);
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
        this.handlers.error.forEach(handler => handler(error));
        reject(error);
      };
    });
  }

  handleMessage(data) {
    switch (data.type) {
      case 'new_message':
        this.handlers.new_message.forEach(handler => handler(data));
        break;
      case 'heartbeat':
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

  async sendHeartbeat() {
    const response = await fetch(`${this.workerUrl}/heartbeat/daemon`, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`心跳发送失败: ${response.status}`);
    }

    return response.json();
  }

  async reportError(errorData) {
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
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('SSE 连接已断开');
    }
  }
}
