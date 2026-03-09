#!/usr/bin/env node

const SERVER_URL = 'http://localhost:8888';

async function testBrowserReport() {
  const messages = [
    {
      sessionId: 'test-session-' + Date.now(),
      buyerName: '测试买家 ' + Math.floor(Math.random() * 100),
      buyerId: 'buyer-' + Math.floor(Math.random() * 1000),
      lastMessage: '这是一条测试消息，时间: ' + new Date().toLocaleTimeString(),
      unreadCount: 1,
      timestamp: Date.now()
    }
  ];

  try {
    const response = await fetch(`${SERVER_URL}/api/browser/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages })
    });

    const result = await response.json();
    console.log('上报成功:', result);
  } catch (error) {
    console.error('上报失败:', error.message);
  }
}

async function testHeartbeat() {
  const data = {
    timestamp: Date.now(),
    status: 'active',
    unreadCount: Math.floor(Math.random() * 5)
  };

  try {
    const response = await fetch(`${SERVER_URL}/heartbeat/browser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('心跳成功:', result);
  } catch (error) {
    console.error('心跳失败:', error.message);
  }
}

console.log('测试浏览器上报功能...\n');

setInterval(async () => {
  await testHeartbeat();
  await testBrowserReport();
}, 10000);

testHeartbeat();
testBrowserReport();
