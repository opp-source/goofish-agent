# 闲鱼网页版技术能力参考

## 概述

本文档详细记录闲鱼网页版 (`goofish.com`) 的技术能力，供 goofish-web 技能使用。

**测试状态说明**:
- ✅ 已验证 - API 已通过测试，可正常调用
- ⚠️ 需要上下文 - API 需要特定上下文参数（如会话 ID），在用户操作时调用

---

## 核心 API 接口

### 基础配置

| 配置项 | 值 |
|--------|-----|
| API 域名 | `https://h5api.m.goofish.com/h5/` |
| AppKey | `34839810` |
| 数据格式 | JSON |

### 请求签名

所有 API 请求需要以下参数：
- `jsv` - JS SDK 版本
- `appKey` - 应用密钥
- `t` - 时间戳
- `sign` - 签名（基于 token 和时间戳生成）
- `v` - API 版本

---

## 消息相关 API

### 1. 获取登录用户信息 ✅

```
API: mtop.taobao.idlemessage.pc.loginuser.get
版本: 1.0
方法: POST
```

**用途**: 获取当前登录用户的基本信息

### 2. 获取登录 Token ✅

```
API: mtop.taobao.idlemessage.pc.login.token
版本: 1.0
方法: POST
```

**请求参数**:
```json
{
  "appKey": "444e9908a51d1cb236a27862abc769c9",
  "deviceId": "设备ID"
}
```

**响应**:
```json
{
  "accessToken": "oauth_k1:xxx",
  "accessTokenExpiredTime": "86400000",
  "refreshToken": "oauth_k1:xxx"
}
```

### 3. 获取 ACCS Token（推送服务） ✅

```
API: mtop.taobao.idlemessage.pc.accs.token
版本: 1.0
方法: POST
```

**用途**: 获取阿里云 ACCS 推送服务的 token，用于实时消息推送

**响应**:
```json
{
  "token": "AAAFaaziZjBs5jNDY9907UrYcXtOnERFMPNvFoABGI9klIuB..."
}
```

### 4. 同步会话列表 ✅

```
API: mtop.taobao.idlemessage.pc.session.sync
版本: 3.0
方法: POST
```

**请求参数**:
```json
{
  "sessionTypes": "[3]",  // 会话类型数组
  "fetchNum": 30          // 获取数量
}
```

**会话类型说明**:
| 类型 | 说明 |
|------|------|
| 1 | 普通聊天 |
| 3 | 系统消息/通知 |
| 15 | 交易相关 |
| 其他 | 业务特定类型 |

### 5. 同步消息 ⚠️

```
API: mtop.taobao.idlemessage.pc.message.sync
版本: 1.0
方法: POST
```

**说明**: 需要有效的会话 ID 和正确的请求参数格式，在用户打开聊天会话时调用

**请求参数**:
```json
{
  "type": 1,
  "fetchs": 20,
  "sessionId": 12345678,
  "start": 0,
  "includeRequestMsg": true
}
```

### 6. 查询红点（未读数） ✅

```
API: mtop.taobao.idlemessage.pc.redpoint.query
版本: 1.0
方法: POST
```

**请求参数**:
```json
{
  "sessionTypes": "1,19,15,32,3,44,51,52,24",
  "fetch": 50
}
```

**响应**:
```json
{
  "total": 100  // 总未读数
}
```

### 7. 清除未读 ⚠️

```
API: mtop.taobao.idlemessage.pc.systems.unread.clean
版本: 1.0
方法: POST
```

**说明**: 需要有效的 sessionId 参数，在用户查看会话时调用

### 8. 查询用户信息 ✅

```
API: mtop.taobao.idlemessage.pc.user.query
版本: 4.0
方法: POST
```

### 9. 查询黑名单 ⚠️

```
API: mtop.taobao.idlemessage.pc.blacklist.query
版本: 1.0
方法: POST
```

**说明**: 需要正确的参数格式，可能需要用户有黑名单数据

### 10. 加载表情包 ✅

```
API: mtop.taobao.idlemessage.face.emoji.load
版本: 1.0
方法: POST
```

---

## 用户相关 API

### 1. 获取用户页面头部信息 ✅

```
API: mtop.idle.web.user.page.head
版本: 1.0
方法: POST
```

**请求参数**:
```json
{
  "self": true  // 是否获取自己的信息
}
```

**响应**:
```json
{
  "baseInfo": {
    "encryptedUserId": "加密用户ID",
    "kcUserId": "2643375480",
    "userType": 1
  },
  "module": {
    "shop": {
      "level": "L3",
      "score": 150,
      "praiseRatio": 100,
      "reviewNum": 21
    },
    "social": {
      "followers": "12",
      "following": "27"
    },
    "tabs": {
      "item": { "number": 22, "name": "宝贝" },
      "rate": { "number": "114", "name": "信用及评价" }
    },
    "base": {
      "displayName": "我说停停",
      "ipLocation": "上海市",
      "avatar": { "avatar": "头像URL" }
    }
  }
}
```

### 2. 获取用户导航信息 ✅

```
API: mtop.idle.web.user.page.nav
版本: 1.0
方法: POST
```

**用途**: 获取导航菜单和基础信息

---

## 商品相关 API

### 1. 获取用户商品列表 ✅

```
API: mtop.idle.web.xyh.item.list
版本: 1.0
方法: POST
```

**请求参数**:
```json
{
  "needGroupInfo": true,
  "pageNumber": 1,
  "userId": "2643375480",
  "pageSize": 20
}
```

**响应结构**:
```json
{
  "cardList": [{
    "cardType": 1003,
    "cardData": {
      "id": "商品ID",
      "title": "商品标题",
      "priceInfo": {
        "preText": "¥",
        "price": "9.45"
      },
      "itemStatus": 0,  // 0: 在售, 1: 已售
      "picInfo": {
        "picUrl": "图片URL"
      },
      "detailUrl": "fleamarket://awesome_detail?itemId=xxx"
    }
  }]
}
```

### 2. 商品状态

| 状态值 | 说明 |
|--------|------|
| 0 | 在售 |
| 1 | 已售/下架 |

---

## Gaia 数据网关 API

### 通用数据接口 ✅

```
API: mtop.gaia.nodejs.gaia.idle.data.gw.v2.index.get
版本: 1.0
方法: POST
```

**用途**: 通用数据获取接口，支持多种数据类型

这是闲鱼的统一数据网关，用于获取各种页面数据。具体数据类型取决于请求参数。

---

## 订单相关 API

### 1. 获取买入订单列表 ✅

```
API: mtop.idle.web.trade.bought.list
版本: 1.0
方法: POST
```

**请求参数**:
```json
{
  "pageNumber": 1,
  "orderStatus": "ALL"  // ALL|待付款|待发货|待收货|待评价|退款中
}
```

**订单状态枚举**:
| 状态 | 说明 |
|------|------|
| `ALL` | 全部 |
| 待付款 | 等待买家付款 |
| 待发货 | 已付款，等待卖家发货 |
| 待收货 | 已发货，等待买家确认 |
| 待评价 | 交易成功，待评价 |
| 退款中 | 退款处理中 |

**响应结构**:
```json
{
  "items": [{
    "commonData": {
      "orderId": "订单ID",
      "itemId": "商品ID",
      "tradeStatusEnum": "状态枚举"
    },
    "head": { "用户信息" },
    "content": { "商品信息" },
    "tail": { "操作按钮" }
  }]
}
```

### 2. 获取订单头部信息 ✅

```
API: mtop.idle.trade.pc.message.headinfo
版本: 1.0
方法: POST
```

**请求参数**:
```json
{
  "itemId": 950735244178,
  "sessionId": 53178218440,
  "sessionType": 1
}
```

---

## 通知机制

### 浏览器通知

闲鱼网页版支持 Web Notification API：

```javascript
// 检查通知权限
Notification.permission  // "granted" | "denied" | "default"

// 通知已获授权时可使用
new Notification("新消息", { body: "您有一条新消息" })
```

### 消息提示音

- 音频文件: `https://g.alicdn.com/idleFish-F2e/asserts-def/xy-site/message_tone.mp3`
- 用途: 新消息到达时播放

### ACCS 推送服务

ACCS（Alibaba Cloud Channel Service）是阿里云的实时消息推送服务：

- **Token 获取**: 通过 `mtop.taobao.idlemessage.pc.accs.token` API
- **功能**: 实时推送新消息通知
- **特点**: 无需轮询，服务端主动推送

### 轮询方案（备选）

如果 ACCS 不可用，可采用轮询方案：

1. **红点查询**: 定时调用 `redpoint.query` 检查未读数变化
2. **消息同步**: 定时调用 `message.sync` 获取新消息
3. **建议间隔**: 5-10 秒

---

## 页面 URL 结构

| 页面 | URL | 说明 |
|------|-----|------|
| 首页 | `/` | 浏览、搜索商品 |
| 消息 | `/im` | 聊天消息中心 |
| 个人中心 | `/personal` | 个人信息和商品管理 |
| 订单（买入） | `/bought` | 我买到的订单 |
| 订单（卖出） | `/sold` | 我卖出的订单 |
| 发布 | `/publish` | 发布新商品 |
| 商品详情 | `/item?id=xxx` | 商品详情页 |
| 订单详情 | `/order-detail?orderId=xxx` | 订单详情页 |
| 创建订单 | `/create-order?itemId=xxx` | 下单页面 |

---

## 消息类型

### 内容类型 (contentType)

| 类型值 | 说明 |
|--------|------|
| 6 | 文本卡片消息 |
| 28 | DX 卡片消息（富媒体） |

### 消息卡片示例

**交易通知卡片**:
```json
{
  "contentType": 28,
  "dxCard": {
    "item": {
      "main": {
        "exContent": {
          "head": {
            "avatarUrl": "头像URL",
            "title": "卖家昵称",
            "subtitle": "订单状态"
          },
          "item1": {
            "image": "商品图片",
            "subscription": "商品标题",
            "targetUrl": "fleamarket://order_detail?id=xxx"
          }
        }
      }
    }
  }
}
```

---

## 操作按钮动作类型

### actionCode 类型

| 代码 | 说明 |
|------|------|
| `CHAT` | 打开聊天 |
| `BUYER_CONFIRM` | 买家确认收货 |
| `SEND_FLOWER` | 送小红花 |
| `VIEW_CASH` | 查看钱款 |
| `DELETE_ORDER` | 删除订单 |
| `RE_PURCHASE` | 再次购买 |
| `REFUND` | 申请退款 |

### openPage 类型

跳转到指定 URL，支持以下协议：
- `https://` - 网页链接
- `fleamarket://` - 原生页面跳转

---

## 交易状态枚举

| 枚举值 | 说明 |
|--------|------|
| `buyer_to_confirm` | 等待买家确认收货 |
| `seller_to_send` | 等待卖家发货 |
| `trade_success` | 交易成功 |
| `trade_closed` | 交易关闭 |

---

## 实时消息监听方案

### 方案一：ACCS 推送（推荐）

1. 获取 ACCS Token
2. 建立 ACCS 长连接
3. 监听推送消息
4. 消息到达时触发回调

### 方案二：页面可见性检测 + 轮询

```javascript
// 监听页面可见性
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // 页面可见时，开始轮询
    startPolling();
  } else {
    // 页面不可见时，停止轮询
    stopPolling();
  }
});
```

### 方案三：MutationObserver 监听 DOM 变化

```javascript
// 监听消息列表 DOM 变化
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      // 检测到新消息
    }
  });
});

observer.observe(messageContainer, { childList: true, subtree: true });
```

### 方案四：BroadcastChannel 跨标签通信

```javascript
// 多标签页之间同步消息状态
const channel = new BroadcastChannel('goofish_messages');
channel.onmessage = (event) => {
  console.log('收到消息:', event.data);
};
```

---

## Cookie 和认证

### 关键 Cookie

| Cookie | 说明 |
|--------|------|
| `t` | 用户 token |
| `_tb_token_` | CSRF token |
| `unb` | 用户 ID |
| `cna` | 客户端标识 |
| `_m_h5_tk` | H5 token |
| `sgcookie` | 安全 cookie |

### 登录态保持

- Cookie 有效期较长，可保持登录状态
- Token 刷新机制通过 `refreshToken` 实现

---

## 风控和限制

### 反自动化机制

1. **签名验证**: API 请求需要有效签名
2. **频率限制**: 高频请求可能触发风控
3. **验证码**: 异常操作可能触发验证码

### 建议

- 请求间隔保持在 2-3 秒以上
- 模拟真实用户行为
- 避免批量操作

---

## 相关资源

### 静态资源

- Logo: `https://gw.alicdn.com/imgextra/i4/O1CN01puu0XC1vG0PyKApAV_!!6000000006144-2-tps-242-150.png`
- 消息提示音: `https://g.alicdn.com/idleFish-F2e/asserts-def/xy-site/message_tone.mp3`

### 第三方服务

- **阿里云 ACCS**: 实时消息推送
- **阿里云 OSS**: 静态资源存储
- **支付宝**: 支付和资金相关

---

## 更新记录

- 2026-03-08: 初始版本，记录核心 API 和通知机制
- 2026-03-08: 完成所有 API 测试验证，添加测试状态标记