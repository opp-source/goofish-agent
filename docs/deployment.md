# 部署指南

## 1. 前置要求

### 1.1 系统要求
- macOS 10.15+ 或 Linux
- Node.js 18+
- npm 或 yarn
- tmux
- Chrome/Chromium 浏览器

### 1.2 账号要求
- Cloudflare 账号（用于 Workers）
- Telegram Bot（可选，用于告警）
- 闲鱼账号（已登录状态）

---

## 2. 本地环境配置

### 2.1 克隆项目

```bash
cd /Users/wenguoyin/Public
git clone <your-repo> goofish-agent
cd goofish-agent
```

### 2.2 安装依赖

```bash
# 安装本地守护程序依赖
cd local-daemon
npm install

# 安装 Worker 依赖
cd ../cloud-worker
npm install
```

### 2.3 配置环境变量

```bash
cd local-daemon
cp .env.example .env
```

编辑 `.env` 文件：
```bash
# 云端 Worker 地址
CLOUD_WORKER_URL=https://your-worker.your-subdomain.workers.dev

# API Key
API_KEY=your-secret-api-key

# tmux 会话名称
TMUX_SESSION=goofish-agent

# Claude 命令路径
CLAUDE_PATH=/usr/local/bin/claude

# 日志级别
LOG_LEVEL=info
```

---

## 3. Cloudflare Worker 部署

### 3.1 创建 KV Namespace

```bash
cd cloud-worker
wrangler kv:namespace create GOOFISH_KV
```

记录返回的 namespace ID，更新到 `wrangler.toml`。

### 3.2 配置 wrangler.toml

```toml
name = "goofish-agent-worker"
main = "src/index.js"
compatibility_date = "2026-03-08"

# Durable Objects
[[durable_objects.bindings]]
name = "MESSAGE_PUBSUB"
class_name = "MessagePubSub"

[[migrations]]
tag = "v1"
new_classes = ["MessagePubSub"]

# KV Namespace
[[kv_namespaces]]
binding = "GOOFISH_KV"
id = "your-kv-namespace-id-here"

# 定时任务
[triggers]
crons = ["* * * * *"]  # 每分钟检查心跳

# 环境变量
[vars]
API_KEY = "change-this-to-your-secret-key"

# 敏感信息使用 secrets
```

### 3.3 设置 Secrets

```bash
# Telegram Bot Token（可选）
wrangler secret put TELEGRAM_BOT_TOKEN

# Telegram Chat ID（可选）
wrangler secret put TELEGRAM_CHAT_ID
```

### 3.4 部署 Worker

```bash
wrangler deploy
```

部署成功后会输出 Worker URL，例如：
```
https://goofish-agent-worker.your-subdomain.workers.dev
```

### 3.5 更新本地配置

将 Worker URL 更新到本地守护程序的 `.env` 文件中。

---

## 4. 本地守护程序部署

### 4.1 测试运行

```bash
cd local-daemon
npm start
```

检查日志输出是否正常。

### 4.2 配置 launchd（macOS）

创建 plist 文件：

```bash
cat > ~/Library/LaunchAgents/com.goofish.daemon.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.goofish.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/wenguoyin/Public/goofish-agent/local-daemon/src/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/goofish-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/goofish-daemon-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
EOF
```

### 4.3 加载服务

```bash
launchctl load ~/Library/LaunchAgents/com.goofish.daemon.plist
```

### 4.4 检查状态

```bash
launchctl list | grep goofish
```

### 4.5 查看日志

```bash
tail -f /tmp/goofish-daemon.log
tail -f /tmp/goofish-daemon-error.log
```

---

## 5. Claude Agent 配置

### 5.1 确保文件结构正确

```
.claude/
├── CLAUDE.md
├── .mcp.json
├── skills/
│   └── goofish-web/
│       ├── SKILL.md
│       ├── references/
│       └── scripts/
└── agents/
    └── goofish-agent/
        └── AGENT.md
```

### 5.2 配置 .mcp.json

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "mcp-server-chrome-devtools",
      "args": []
    }
  }
}
```

### 5.3 确保 Claude 已安装

```bash
which claude
```

如未安装，参考 Claude Code 官方文档安装。

---

## 6. 验证部署

### 6.1 检查 Worker 状态

访问状态页面：
```
https://your-worker.your-subdomain.workers.dev/status
```

应返回类似：
```json
{
  "browser": {
    "status": "offline"
  },
  "daemon": {
    "status": "online"
  }
}
```

### 6.2 检查守护程序

```bash
# 查看进程
ps aux | grep goofish-daemon

# 查看日志
tail -f /tmp/goofish-daemon.log
```

### 6.3 手动测试

```bash
# 测试 Worker API
curl -X POST https://your-worker.your-subdomain.workers.dev/api/message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"type":"new_message","sessionId":"test"}'

# 测试 Telegram 通知
curl -X POST https://your-worker.your-subdomain.workers.dev/admin/test-notification \
  -H "X-API-Key: your-api-key"
```

---

## 7. 日常运维

### 7.1 重启守护程序

```bash
launchctl unload ~/Library/LaunchAgents/com.goofish.daemon.plist
launchctl load ~/Library/LaunchAgents/com.goofish.daemon.plist
```

### 7.2 查看实时日志

```bash
# 守护程序日志
tail -f /tmp/goofish-daemon.log

# Worker 日志
cd cloud-worker
wrangler tail
```

### 7.3 更新代码

```bash
# 更新守护程序
cd local-daemon
git pull
npm install
launchctl unload ~/Library/LaunchAgents/com.goofish.daemon.plist
launchctl load ~/Library/LaunchAgents/com.goofish.daemon.plist

# 更新 Worker
cd cloud-worker
git pull
npm install
wrangler deploy
```

### 7.4 监控命令

```bash
# 检查 tmux 会话
tmux ls

# 进入 Claude 会话
tmux attach -t goofish-agent

# 查看在线状态
curl https://your-worker.workers.dev/status | jq
```

---

## 8. 故障排查

### 8.1 守护程序无法启动

**检查日志**:
```bash
tail -f /tmp/goofish-daemon-error.log
```

**常见问题**:
- Node.js 版本不对：升级到 18+
- 依赖未安装：运行 `npm install`
- 环境变量未配置：检查 `.env` 文件

### 8.2 Worker 部署失败

**检查配置**:
```bash
wrangler whoami
```

**常见问题**:
- 未登录：运行 `wrangler login`
- KV namespace 不存在：重新创建
- 语法错误：检查 JavaScript 代码

### 8.3 Claude 未响应

**检查 tmux 会话**:
```bash
tmux ls
tmux attach -t goofish-agent
```

**手动启动**:
```bash
tmux new -s goofish-agent
cd /Users/wenguoyin/Public/goofish-agent
claude
```

### 8.4 浏览器离线

**检查注入脚本**:
- 在闲鱼页面打开开发者工具
- 查看 Console 是否有错误
- 检查 `[Goofish Agent]` 日志

**手动注入**:
```javascript
// 在闲鱼页面 Console 中执行
// 复制 .claude/skills/goofish-web/scripts/message-listener.js 内容
```

### 8.5 Telegram 通知未收到

**检查配置**:
```bash
wrangler secret list
```

**测试 Bot**:
```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage \
  -d "chat_id=<YOUR_CHAT_ID>" \
  -d "text=Test message"
```

---

## 9. 安全建议

### 9.1 API Key 管理
- 使用强随机字符串（至少 32 位）
- 定期更换
- 不要提交到 Git

### 9.2 Telegram Bot
- 使用私有 Bot
- 限制 Chat ID
- 不要公开 Bot Token

### 9.3 敏感信息
- 所有密钥使用 `wrangler secret`
- 本地 `.env` 添加到 `.gitignore`
- 定期审查访问日志

---

## 10. 备份和恢复

### 10.1 备份配置

```bash
# 备份本地配置
tar -czf goofish-config.tar.gz \
  local-daemon/.env \
  cloud-worker/wrangler.toml \
  .claude/CLAUDE.md

# 备份 KV 数据
wrangler kv:key list --namespace-id=<your-kv-id> > kv-backup.json
```

### 10.2 恢复配置

```bash
# 解压配置
tar -xzf goofish-config.tar.gz

# 恢复 KV 数据
# 需要手动逐条导入
```

---

## 11. 性能优化

### 11.1 Worker 优化
- 使用 KV 缓存减少计算
- 合理设置 TTL
- 启用 Cloudflare CDN

### 11.2 本地优化
- 日志轮转，避免日志文件过大
- 定期清理 tmux 会话
- 监控内存使用

---

**文档版本**: v1.0  
**最后更新**: 2026-03-08
