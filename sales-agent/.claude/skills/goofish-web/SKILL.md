---
name: goofish-web
description: 闲鱼 Web 版操作能力，提供浏览器自动化操作闲鱼网页的技术支持
---

# 闲鱼 Web 操作

本技能提供操作闲鱼 Web 版的技术能力。

## 能力清单

| 能力 | 说明 |
|------|------|
| 打开页面 | 访问闲鱼各功能页面 |
| 获取内容 | 读取页面信息（消息、订单等） |
| 点击交互 | 点击按钮、链接等元素 |
| 输入文本 | 在输入框中输入文字 |
| 发送消息 | 在聊天中发送回复 |
| 消息监听 | 实时监听新消息到达 |
| 订单管理 | 查询订单列表和详情 |

## 关键页面

| 页面 | URL | 用途 |
|------|-----|------|
| 首页 | `https://www.goofish.com/` | 浏览、搜索 |
| 消息 | `https://www.goofish.com/im` | 客户聊天 |
| 个人中心 | `https://www.goofish.com/personal` | 商品管理 |
| 订单（买入）| `https://www.goofish.com/bought` | 买入订单 |
| 订单（卖出）| `https://www.goofish.com/sold` | 卖出订单 |
| 发布 | `https://www.goofish.com/publish` | 发布商品 |

## 可用工具

| 工具 | 用途 |
|------|------|
| `mcp__chrome-devtools__new_page` | 打开新页面 |
| `mcp__chrome-devtools__navigate_page` | 导航到 URL |
| `mcp__chrome-devtools__take_snapshot` | 获取页面快照 |
| `mcp__chrome-devtools__click` | 点击元素 |
| `mcp__chrome-devtools__fill` | 填写表单 |
| `mcp__chrome-devtools__type_text` | 键盘输入 |
| `mcp__chrome-devtools__evaluate_script` | 执行 JS 脚本 |
| `mcp__chrome-devtools__list_network_requests` | 查看网络请求 |
| `mcp__chrome-devtools__get_network_request` | 获取请求详情 |
| `mcp__chrome-devtools__list_console_messages` | 查看控制台消息 |

## 操作流程

```
1. new_page 打开闲鱼
2. 等待用户登录
3. navigate_page 到目标页面
4. take_snapshot 获取页面内容
5. click / fill / type_text 进行交互
```

## 消息监听方案

支持多种消息监听方式：

| 方案 | 实时性 | 推荐场景 |
|------|--------|----------|
| DOM 监听 | ⭐⭐⭐⭐⭐ | 页面打开时 |
| API 轮询 | ⭐⭐⭐ | 后台监控 |
| 红点检测 | ⭐⭐⭐ | 快速判断 |

详见 `references/message-listening-guide.md`

## 注意事项

- 页面快照中的 UID 每次刷新会变化
- 闲鱼有反自动化机制，避免高频操作
- 遇到验证码需用户处理
- API 请求需要签名认证

## 参考文档

| 文档 | 说明 |
|------|------|
| `references/xianyu-site-guide.md` | 页面使用指南 |
| `references/goofish-api-reference.md` | API 接口参考 |
| `references/message-listening-guide.md` | 消息监听指南 |