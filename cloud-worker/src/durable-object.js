export class MessagePubSub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    console.log('Durable Object fetch:', url.pathname);

    // SSE 连接
    if (url.pathname === '/connect') {
      return this.handleSSE(request);
    }

    // 发布消息
    if (url.pathname === '/publish') {
      const message = await request.json();
      return this.publish(message);
    }

    return new Response('Not Found', { status: 404 });
  }

  async handleSSE(request) {
    const sessionId = crypto.randomUUID();
    const self = this; // 保存 this 引用
    
    // 创建自定义的 ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        const writer = {
          write: async (data) => {
            try {
              controller.enqueue(encoder.encode(data));
            } catch (e) {
              console.error('Write error:', e);
            }
          },
          close: () => {
            try {
              controller.close();
            } catch (e) {}
          }
        };
        
        self.sessions.set(sessionId, writer);
        
        // 发送初始消息
        await writer.write('data: {"type":"connected"}\n\n');
        console.log(`SSE session ${sessionId} started`);
      },
      
      cancel() {
        console.log(`SSE session ${sessionId} cancelled`);
        self.sessions.delete(sessionId);
      }
    });

    // 返回 SSE 流
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  async publish(message) {
    const data = `data: ${JSON.stringify(message)}\n\n`;

    const disconnected = [];

    for (const [sessionId, writer] of this.sessions) {
      try {
        await writer.write(data);
      } catch (error) {
        // 连接已断开
        disconnected.push(sessionId);
      }
    }

    // 清理断开的连接
    for (const sessionId of disconnected) {
      this.sessions.delete(sessionId);
    }

    return new Response('OK');
  }
}
