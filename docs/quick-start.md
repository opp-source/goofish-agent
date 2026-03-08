# 快速启动指南

本文档帮助你快速部署和启动闲鱼 Agent。

## 前置要求

- Node.js 18+
- npm 9+
- tmux
- wrangler (Cloudflare CLI)
- Claude CLI

## 快速部署

### 1. 部署云端 Worker

```bash
# 运行部署脚本
./deploy.sh worker
```

部署脚本会自动：
- 安装 wrangler
- 创建 KV namespace
- 部署 Worker
- 显示 Worker URL

### 2. 配置本地环境

```bash
# 复制配置文件
cd local-daemon
cp .env.example .env

# 编辑配置
nano .env  # 或使用你喜欢的编辑器
```

必须配置的项：
- `CLOUD_WORKER_URL`: Worker 的 URL（从部署输出获取）
- `API_KEY`: API 密钥（与 Worker 配置一致）

### 3. 部署本地守护程序

```bash
./deploy.sh daemon
```

### 4. 测试部署

```bash
# 测试 API 连接
./test.sh api

# 测试 Worker
./test.sh worker

# 运行完整测试
./test.sh all
```

## 启动系统

### 方式 1: 手动启动

```bash
# 启动守护程序
cd local-daemon
npm start

# 在另一个终端查看日志
tail -f /tmp/goofish-agent.log
```

### 方式 2: 使用 launchd (macOS)

```bash
# 配置自动启动
./deploy.sh launchd

# 加载服务
launchctl load ~/Library/LaunchAgents/com.goofish.agent.plist

# 查看状态
launchctl list | grep goofish

# 停止服务
launchctl unload ~/Library/LaunchAgents/com.goofish.agent.plist
```

### 方式 3: 使用 systemd (Linux)

创建 systemd service 文件：

```bash
sudo nano /etc/systemd/system/goofish-agent.service
```

内容：

```ini
[Unit]
Description=Goofish Agent Daemon
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/goofish-agent/local-daemon
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable goofish-agent
sudo systemctl start goofish-agent
sudo systemctl status goofish-agent
```

## 验证运行

### 1. 检查 Worker 状态

访问 Worker 状态页面：
```
https://your-worker.your-subdomain.workers.dev/status
```

应该看到：
- 守护程序心跳状态
- 最近的消息记录
- 系统运行时间

### 2. 检查本地守护程序

```bash
# 检查进程
ps aux | grep "node.*goofish"

# 检查 tmux 会话
tmux list-sessions

# 查看日志
tail -f /tmp/goofish-agent.log
```

### 3. 测试消息流

```bash
# 发送测试心跳
curl -X POST https://your-worker.your-subdomain.workers.dev/api/heartbeat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"timestamp": '$(date +%s)'000, "status": "test"}'

# 查看状态
curl -X GET https://your-worker.your-subdomain.workers.dev/api/status \
  -H "X-API-Key: your-api-key"
```

## 下一步

系统启动后：

1. **打开闲鱼页面**
   - 在浏览器中访问闲鱼消息页面
   - 确保已登录

2. **注入监听脚本**
   - 打开浏览器开发者工具 (F12)
   - 复制 `skills/goofish-web/scripts/cloud-integration.js` 内容
   - 在 Console 中粘贴并执行
   - 配置并启动监听

3. **配置 Agent**
   - 确保 `.claude/agents/goofish-agent/AGENT.md` 配置正确
   - Agent 会自动处理消息

## 故障排查

### Worker 无法访问

```bash
# 检查 Worker 日志
wrangler tail

# 检查 Worker 状态
wrangler deployments list
```

### 守护程序无法启动

```bash
# 检查 Node.js 版本
node -v  # 应该 >= 18

# 检查依赖
cd local-daemon
npm install

# 检查配置
cat .env

# 手动运行查看错误
node src/index.js
```

### tmux 会话问题

```bash
# 列出会话
tmux list-sessions

# 连接到会话
tmux attach -t goofish-agent

# 杀死会话
tmux kill-session -t goofish-agent
```

### Claude 无法启动

```bash
# 检查 Claude 安装
which claude
claude --version

# 检查环境变量
echo $PATH

# 测试 Claude
claude --help
```

## 停止系统

```bash
# 停止守护程序
tmux kill-session -t goofish-agent

# 或使用 launchd
launchctl unload ~/Library/LaunchAgents/com.goofish.agent.plist

# 或使用 systemd
sudo systemctl stop goofish-agent
```

## 更新系统

```bash
# 拉取最新代码
git pull

# 更新 Worker
./deploy.sh worker

# 更新守护程序
cd local-daemon
npm install
```

## 日志位置

- Worker 日志: Cloudflare Dashboard > Workers > Logs
- 守护程序日志: `/tmp/goofish-agent.log`
- tmux 会话: `tmux attach -t goofish-agent`

## 更多信息

- 详细部署指南: [docs/deployment.md](deployment.md)
- API 文档: [docs/api.md](api.md)
- 架构说明: [docs/architecture.md](architecture.md)
