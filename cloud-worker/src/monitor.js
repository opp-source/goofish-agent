import { sendTelegramMessage } from './telegram.js';

export async function checkHeartbeats(env) {
  const now = Date.now();
  const kv = env.GOOFISH_KV;

  // 获取最后心跳时间
  const lastBrowserHeartbeat = await kv.get('heartbeat:browser');
  const lastDaemonHeartbeat = await kv.get('heartbeat:daemon');

  const alerts = [];

  // 检查浏览器状态 (6分钟无心跳则离线)
  if (lastBrowserHeartbeat) {
    const elapsed = now - parseInt(lastBrowserHeartbeat);
    if (elapsed > 6 * 60 * 1000) {
      const status = await kv.get('status:browser');
      if (status !== 'offline') {
        await kv.put('status:browser', 'offline');
        alerts.push('⚠️ 浏览器已离线，请检查');
      }
    }
  } else {
    // 从未收到心跳
    const status = await kv.get('status:browser');
    if (!status) {
      await kv.put('status:browser', 'offline');
    }
  }

  // 检查守护程序状态
  if (lastDaemonHeartbeat) {
    const elapsed = now - parseInt(lastDaemonHeartbeat);
    if (elapsed > 2 * 60 * 1000) {
      const status = await kv.get('status:daemon');
      if (status !== 'offline') {
        await kv.put('status:daemon', 'offline');
        alerts.push('⚠️ 本地守护程序已离线');
      }
    }
  } else {
    const status = await kv.get('status:daemon');
    if (!status) {
      await kv.put('status:daemon', 'offline');
    }
  }

  // 发送 Telegram 告警
  if (alerts.length > 0 && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    for (const alert of alerts) {
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, alert);
    }
  }

  console.log('心跳检查完成');
}
