#!/bin/bash

# 闲鱼 Agent 部署脚本
# 用法: ./deploy.sh [worker|daemon|all]

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        log_error "未找到 Node.js，请先安装 Node.js"
        exit 1
    fi
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        log_error "未找到 npm，请先安装 npm"
        exit 1
    fi
    
    log_info "Node.js 版本: $(node -v)"
    log_info "npm 版本: $(npm -v)"
}

# 部署 Worker
deploy_worker() {
    log_info "开始部署云端 Worker..."
    
    cd cloud-worker
    
    # 检查 wrangler
    if ! command -v wrangler &> /dev/null; then
        log_warn "未找到 wrangler，正在安装..."
        npm install -g wrangler
    fi
    
    # 检查是否已登录
    if ! wrangler whoami &> /dev/null; then
        log_warn "未登录 Cloudflare，请先运行: wrangler login"
        wrangler login
    fi
    
    # 安装依赖
    log_info "安装依赖..."
    npm install
    
    # 检查 KV namespace
    log_info "检查 KV namespace..."
    if grep -q "your-kv-namespace-id-here" wrangler.toml; then
        log_warn "未配置 KV namespace，正在创建..."
        
        # 创建 KV namespace
        KV_OUTPUT=$(wrangler kv:namespace create GOOFISH_KV 2>&1)
        KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
        
        if [ -n "$KV_ID" ]; then
            log_info "KV namespace ID: $KV_ID"
            
            # 更新 wrangler.toml
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/your-kv-namespace-id-here/$KV_ID/" wrangler.toml
            else
                sed -i "s/your-kv-namespace-id-here/$KV_ID/" wrangler.toml
            fi
            
            log_info "已更新 wrangler.toml"
        else
            log_error "创建 KV namespace 失败"
            log_info "请手动运行: wrangler kv:namespace create GOOFISH_KV"
            exit 1
        fi
    fi
    
    # 提示配置 secrets
    log_warn "请确保已配置以下 secrets:"
    log_warn "  - wrangler secret put TELEGRAM_BOT_TOKEN (可选)"
    log_warn "  - wrangler secret put TELEGRAM_CHAT_ID (可选)"
    
    # 部署
    log_info "正在部署..."
    wrangler deploy
    
    # 获取 Worker URL
    WORKER_URL=$(grep -o 'https://[^"]*\.workers\.dev' <<< "$(wrangler deployments list 2>&1 | head -1)" || echo "")
    
    if [ -n "$WORKER_URL" ]; then
        log_info "Worker 部署成功!"
        log_info "Worker URL: $WORKER_URL"
        log_info "状态页面: $WORKER_URL/status"
    else
        log_info "Worker 部署成功!"
        log_info "请在 Cloudflare Dashboard 查看 Worker URL"
    fi
    
    cd ..
}

# 部署本地守护程序
deploy_daemon() {
    log_info "开始部署本地守护程序..."
    
    cd local-daemon
    
    # 安装依赖
    log_info "安装依赖..."
    npm install
    
    # 检查配置文件
    if [ ! -f ".env" ]; then
        log_warn "未找到 .env 文件，正在从 .env.example 创建..."
        cp .env.example .env
        log_warn "请编辑 local-daemon/.env 文件，填入实际配置"
    fi
    
    # 检查 tmux
    if ! command -v tmux &> /dev/null; then
        log_error "未找到 tmux，请先安装 tmux"
        exit 1
    fi
    
    log_info "本地守护程序部署完成!"
    log_info "启动命令: npm start"
    
    cd ..
}

# 配置 launchd (macOS)
setup_launchd() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        log_info "配置 launchd 自动启动..."
        
        # 创建 plist 目录
        mkdir -p ~/Library/LaunchAgents
        
        # 获取当前目录
        CURRENT_DIR=$(pwd)
        
        # 创建 plist 文件
        cat > ~/Library/LaunchAgents/com.goofish.agent.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.goofish.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>$CURRENT_DIR/local-daemon/src/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$CURRENT_DIR/local-daemon</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/goofish-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/goofish-agent.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF
        
        log_info "launchd 配置文件已创建"
        log_info "加载命令: launchctl load ~/Library/LaunchAgents/com.goofish.agent.plist"
    else
        log_warn "非 macOS 系统，跳过 launchd 配置"
        log_info "可以创建 systemd service 来实现自动启动"
    fi
}

# 显示使用说明
show_usage() {
    echo ""
    echo "闲鱼 Agent 部署脚本"
    echo ""
    echo "用法: $0 [command]"
    echo ""
    echo "命令:"
    echo "  worker      部署云端 Worker"
    echo "  daemon      部署本地守护程序"
    echo "  launchd     配置 launchd 自动启动 (macOS)"
    echo "  all         部署所有组件"
    echo "  help        显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 worker         # 只部署 Worker"
    echo "  $0 daemon         # 只部署守护程序"
    echo "  $0 all            # 部署所有组件"
    echo ""
}

# 主函数
main() {
    case "${1:-help}" in
        worker)
            check_dependencies
            deploy_worker
            ;;
        daemon)
            check_dependencies
            deploy_daemon
            ;;
        launchd)
            setup_launchd
            ;;
        all)
            check_dependencies
            deploy_worker
            deploy_daemon
            setup_launchd
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            log_error "未知命令: $1"
            show_usage
            exit 1
            ;;
    esac
}

# 运行
main "$@"
