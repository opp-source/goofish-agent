#!/bin/bash

# 测试脚本

API_URL="http://localhost:8888"
API_KEY="a9441d97d2e940752a5780111ec6e36588975ad9d4f6c1af88a2e987ce8daa04"

echo "========================================="
echo "闲鱼 Agent 系统测试"
echo "========================================="
echo ""

echo "1. 测试健康检查..."
curl -s "$API_URL/health" | jq
echo ""

echo "2. 测试状态查询..."
curl -s "$API_URL/status" | jq
echo ""

echo "3. 测试消息接收..."
curl -s -X POST "$API_URL/api/message" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "sessionId": "test-session-001",
    "buyerName": "测试买家",
    "buyerId": "test-buyer-001",
    "lastMessage": "你好，商品还在吗？",
    "unreadCount": 1,
    "timestamp": '$(date +%s000)',
    "itemPrice": "99.00",
    "itemUrl": "https://www.goofish.com/item?id=test"
  }' | jq
echo ""

echo "4. 测试浏览器心跳..."
curl -s -X POST "$API_URL/heartbeat/browser" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "timestamp": '$(date +%s000)',
    "status": "active",
    "unreadCount": 1
  }' | jq
echo ""

echo "5. 测试消息列表..."
curl -s "$API_URL/api/messages" | jq
echo ""

echo "6. 测试 Claude 状态..."
curl -s "$API_URL/api/claude/status" | jq
echo ""

echo "========================================="
echo "测试完成"
echo "========================================="
echo ""
echo "访问 Web 控制台: $API_URL/"
echo ""
