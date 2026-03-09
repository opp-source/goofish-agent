export class MessagePubSub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/events') {
      return this.handleSSE(request);
    }
    
    if (url.pathname === '/broadcast') {
      return this.handleBroadcast(request);
    }
    
    if (url.pathname === '/status') {
      return new Response(JSON.stringify({
        connected: this.sessions.size,
        timestamp: Date.now()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }

  async handleSSE(request) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== this.env.API_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    
    this.sessions.add(writer);
    
    writer.write(encoder.encode(`data: ${JSON.stringify({ 
      type: 'connected', 
      timestamp: Date.now() 
    })}\n\n`));
    
    const heartbeatInterval = setInterval(async () => {
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          type: 'heartbeat', 
          timestamp: Date.now() 
        })}\n\n`));
      } catch (err) {
        clearInterval(heartbeatInterval);
        this.sessions.delete(writer);
      }
    }, 30000);
    
    request.signal.addEventListener('abort', async () => {
      clearInterval(heartbeatInterval);
      this.sessions.delete(writer);
      try {
        await writer.close();
      } catch (err) {
        // Ignore
      }
    });
    
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  async handleBroadcast(request) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== this.env.API_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }

    const message = await request.json();
    const data = `data: ${JSON.stringify(message)}\n\n`;
    const encoder = new TextEncoder();
    
    let delivered = 0;
    const failed = [];
    
    for (const writer of this.sessions) {
      try {
        await writer.write(encoder.encode(data));
        delivered++;
      } catch (err) {
        failed.push(writer);
      }
    }
    
    failed.forEach(writer => this.sessions.delete(writer));
    
    return new Response(JSON.stringify({
      success: true,
      delivered,
      total: this.sessions.size
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}