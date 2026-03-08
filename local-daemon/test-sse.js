#!/usr/bin/env node

import 'dotenv/config';
import EventSource from 'eventsource';

const workerUrl = process.env.CLOUD_WORKER_URL;
const apiKey = process.env.API_KEY;

console.log('测试 SSE 连接...');
console.log('Worker URL:', workerUrl);
console.log('API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'not set');

const url = `${workerUrl}/events`;

const eventSource = new EventSource(url);

eventSource.onopen = (event) => {
  console.log('✅ SSE 连接已建立', event);
};

eventSource.onmessage = (event) => {
  console.log('📨 收到消息:', event.data);
  const data = JSON.parse(event.data);
  console.log('解析后的数据:', data);
};

eventSource.onerror = (error) => {
  console.error('❌ SSE 连接错误:', error);
  if (eventSource.readyState === EventSource.CLOSED) {
    console.error('连接已关闭');
  } else if (eventSource.readyState === EventSource.CONNECTING) {
    console.error('正在重连...');
  }
};

console.log('EventSource readyState:', eventSource.readyState);
console.log('EventSource url:', eventSource.url);

// 10秒后关闭
setTimeout(() => {
  console.log('\n测试完成，关闭连接');
  eventSource.close();
  process.exit(0);
}, 10000);

console.log('等待 SSE 消息（10秒）...');
