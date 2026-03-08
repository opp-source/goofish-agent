#!/bin/bash

# 闲鱼 Agent 测试脚本
# 用法: ./test.sh [worker|daemon|api]

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

# 测试 Worker API
test_worker() {
    log_info "测试云端 Worker..."
    
    # 加载配置
    if [ ! -f "local-daemon/.env" ]; then
        log_error "未找到配置文件 local-daemon/.env"
        exit 1
    fi
    
    # 读取配置
    source local-daemon/.env
    
    if [ -z "$CLOUD_WORKER_URL" ]; then
        log_error "未配置 CLOUD_WORKER_URL"
        exit 1
    fi
    
    if [ -z "$API_KEY" ]; then
        log_error "未配置 API_KEY"
        exit 1
    fi
    
    log_info "Worker URL: $CLOUD_WORKER_URL"
    log_info "API Key: ${API_KEY:0:8}..."
    
    # 测试 1: 健康检查
    log_test "测试 1: 健康检查"
    curl -s -X GET "$CLOUD_WORKER_URL/health" | jq '.' || echo "请求失败"
    
    # 测试 2: 状态页面
    log_test "测试 2: 状态页面"
    curl -s -X GET "$CLOUD_WORKER_URL/status" | head -20 || echo "请求失败"
    
    # 测试 3: 发送心跳
    log_test "测试 3: 发送心跳"
    curl -s -X POST "$CLOUD_WORKER_URL/api/heartbeat" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $API_KEY" \
        -d "{\"timestamp\": $(date +%s)000, \"status\": \"test\"}" | jq '.' || echo "请求失败"
    
    # 测试 4: 获取状态
    log_test "测试 4: 获取状态"
    curl -s -X GET "$CLOUD_WORKER_URL/api/status" \
        -H "X-API-Key: $API_KEY" | jq '.' || echo "请求失败"
    
    # 测试 5: 发送测试消息
    log_test "测试 5: 发送测试消息"
    curl -s -X POST "$CLOUD_WORKER_URL/api/messages" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $API_KEY" \
        -d "{\"timestamp\": $(date +%s)000, \"message\": {\"type\": \"test\", \"content\": \"这是一条测试消息\"}}" | jq '.' || echo "请求失败"
    
    # 测试 6: 获取消息列表
    log_test "测试 6: 获取消息列表"
    curl -s -X GET "$CLOUD_WORKER_URL/api/messages" \
        -H "X-API-Key: $API_KEY" | jq '.' || echo "请求失败"
    
    log_info "Worker 测试完成!"
}

# 测试本地守护程序
test_daemon() {
    log_info "测试本地守护程序..."
    
    cd local-daemon
    
    # 检查配置
    if [ ! -f ".env" ]; then
        log_error "未找到配置文件 .env"
        exit 1
    fi
    
    # 安装依赖
    if [ ! -d "node_modules" ]; then
        log_info "安装依赖..."
        npm install
    fi
    
    # 语法检查
    log_test "语法检查"
    npm run lint 2>/dev/null || node --check src/index.js
    
    # 检查 tmux
    log_test "检查 tmux"
    if command -v tmux &> /dev/null; then
        log_info "tmux 已安装: $(tmux -V)"
    else
        log_error "tmux 未安装"
        exit 1
    fi
    
    # 检查 Claude
    log_test "检查 Claude CLI"
    if [ -f "$CLAUDE_PATH" ] || command -v claude &> /dev/null; then
        log_info "Claude CLI 已安装"
    else
        log_warn "Claude CLI 未安装或路径不正确"
    fi
    
    # 测试启动（短暂运行）
    log_test "测试启动（5秒后自动停止）"
    timeout 5s npm start || true
    
    cd ..
    
    log_info "守护程序测试完成!"
}

# 测试 API 连接
test_api() {
    log_info "测试 API 连接..."
    
    # 加载配置
    if [ ! -f "local-daemon/.env" ]; then
        log_error "未找到配置文件 local-daemon/.env"
        exit 1
    fi
    
    source local-daemon/.env
    
    if [ -z "$CLOUD_WORKER_URL" ]; then
        log_error "未配置 CLOUD_WORKER_URL"
        exit 1
    fi
    
    # 测试连接
    log_test "测试连接到 Worker"
    if curl -s -f -o /dev/null "$CLOUD_WORKER_URL/health"; then
        log_info "✓ Worker 连接正常"
    else
        log_error "✗ Worker 连接失败"
        exit 1
    fi
    
    # 测试认证
    log_test "测试 API 认证"
    RESPONSE=$(curl -s -w "%{http_code}" -X GET "$CLOUD_WORKER_URL/api/status" \
        -H "X-API-Key: $API_KEY")
    
    HTTP_CODE="${RESPONSE: -3}"
    if [ "$HTTP_CODE" = "200" ]; then
        log_info "✓ API 认证成功"
    else
        log_error "✗ API 认证失败 (HTTP $HTTP_CODE)"
        exit 1
    fi
    
    # 测试无认证访问
    log_test "测试无认证访问（应该失败）"
    RESPONSE=$(curl -s -w "%{http_code}" -X GET "$CLOUD_WORKER_URL/api/status")
    
    HTTP_CODE="${RESPONSE: -3}"
    if [ "$HTTP_CODE" = "401" ]; then
        log_info "✓ 无认证访问被正确拒绝"
    else
        log_warn "! 无认证访问未被拒绝 (HTTP $HTTP_CODE)"
    fi
    
    log_info "API 连接测试完成!"
}

# 端到端测试
test_e2e() {
    log_info "端到端测试..."
    
    # 加载配置
    if [ ! -f "local-daemon/.env" ]; then
        log_error "未找到配置文件 local-daemon/.env"
        exit 1
    fi
    
    source local-daemon/.env
    
    # 1. 发送心跳
    log_test "步骤 1: 发送心跳"
    HEARTBEAT_RESPONSE=$(curl -s -X POST "$CLOUD_WORKER_URL/api/heartbeat" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $API_KEY" \
        -d "{\"timestamp\": $(date +%s)000, \"status\": \"test\", \"testId\": \"e2e-$$\"}")
    
    echo "$HEARTBEAT_RESPONSE" | jq '.' || echo "请求失败"
    
    # 2. 检查状态
    log_test "步骤 2: 检查状态"
    STATUS_RESPONSE=$(curl -s -X GET "$CLOUD_WORKER_URL/api/status" \
        -H "X-API-Key: $API_KEY")
    
    echo "$STATUS_RESPONSE" | jq '.heartbeat' || echo "请求失败"
    
    # 3. 发送测试消息
    log_test "步骤 3: 发送测试消息"
    MESSAGE_RESPONSE=$(curl -s -X POST "$CLOUD_WORKER_URL/api/messages" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $API_KEY" \
        -d "{\"timestamp\": $(date +%s)000, \"message\": {\"type\": \"test\", \"content\": \"E2E 测试消息\", \"testId\": \"e2e-$$\"}}")
    
    echo "$MESSAGE_RESPONSE" | jq '.' || echo "请求失败"
    
    # 4. 验证消息存储
    log_test "步骤 4: 验证消息存储"
    sleep 2
    MESSAGES_RESPONSE=$(curl -s -X GET "$CLOUD_WORKER_URL/api/messages" \
        -H "X-API-Key: $API_KEY")
    
    echo "$MESSAGES_RESPONSE" | jq '.messages[-1]' || echo "请求失败"
    
    log_info "端到端测试完成!"
}

# 显示使用说明
show_usage() {
    echo ""
    echo "闲鱼 Agent 测试脚本"
    echo ""
    echo "用法: $0 [command]"
    echo ""
    echo "命令:"
    echo "  worker      测试云端 Worker API"
    echo "  daemon      测试本地守护程序"
    echo "  api         测试 API 连接和认证"
    echo "  e2e         端到端测试"
    echo "  all         运行所有测试"
    echo "  help        显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 worker         # 测试 Worker"
    echo "  $0 api            # 测试 API 连接"
    echo "  $0 all            # 运行所有测试"
    echo ""
}

# 主函数
main() {
    case "${1:-help}" in
        worker)
            test_worker
            ;;
        daemon)
            test_daemon
            ;;
        api)
            test_api
            ;;
        e2e)
            test_e2e
            ;;
        all)
            test_api
            test_worker
            test_daemon
            test_e2e
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
