/**
 * 闲鱼 Web API 封装
 * 提供消息、订单、用户等 API 的调用封装
 */

const GOOFISH_API = {
  // 基础配置
  config: {
    baseUrl: 'https://h5api.m.goofish.com/h5/',
    appKey: '34839810',
    jsv: '2.7.2'
  },

  // API 接口定义
  apis: {
    // 消息相关
    message: {
      loginUser: {
        api: 'mtop.taobao.idlemessage.pc.loginuser.get',
        version: '1.0',
        desc: '获取登录用户信息'
      },
      loginToken: {
        api: 'mtop.taobao.idlemessage.pc.login.token',
        version: '1.0',
        desc: '获取登录 Token'
      },
      accsToken: {
        api: 'mtop.taobao.idlemessage.pc.accs.token',
        version: '1.0',
        desc: '获取 ACCS 推送 Token'
      },
      sessionSync: {
        api: 'mtop.taobao.idlemessage.pc.session.sync',
        version: '3.0',
        desc: '同步会话列表'
      },
      messageSync: {
        api: 'mtop.taobao.idlemessage.pc.message.sync',
        version: '1.0',
        desc: '同步消息'
      },
      redpointQuery: {
        api: 'mtop.taobao.idlemessage.pc.redpoint.query',
        version: '1.0',
        desc: '查询红点（未读数）'
      },
      unreadClean: {
        api: 'mtop.taobao.idlemessage.pc.systems.unread.clean',
        version: '1.0',
        desc: '清除未读'
      },
      userQuery: {
        api: 'mtop.taobao.idlemessage.pc.user.query',
        version: '4.0',
        desc: '查询用户信息'
      },
      blacklistQuery: {
        api: 'mtop.taobao.idlemessage.pc.blacklist.query',
        version: '1.0',
        desc: '查询黑名单'
      },
      emojiLoad: {
        api: 'mtop.taobao.idlemessage.face.emoji.load',
        version: '1.0',
        desc: '加载表情包'
      }
    },

    // 订单相关
    trade: {
      boughtList: {
        api: 'mtop.idle.web.trade.bought.list',
        version: '1.0',
        desc: '获取买入订单列表'
      },
      messageHeadinfo: {
        api: 'mtop.idle.trade.pc.message.headinfo',
        version: '1.0',
        desc: '获取订单头部信息'
      }
    },

    // 用户相关
    user: {
      pageHead: {
        api: 'mtop.idle.web.user.page.head',
        version: '1.0',
        desc: '获取用户页面头部信息'
      },
      pageNav: {
        api: 'mtop.idle.web.user.page.nav',
        version: '1.0',
        desc: '获取用户导航信息'
      }
    },

    // 商品相关
    item: {
      list: {
        api: 'mtop.idle.web.xyh.item.list',
        version: '1.0',
        desc: '获取用户商品列表'
      }
    },

    // 数据网关
    gaia: {
      indexGet: {
        api: 'mtop.gaia.nodejs.gaia.idle.data.gw.v2.index.get',
        version: '1.0',
        desc: '通用数据获取接口'
      }
    }
  },

  // 会话类型
  sessionTypes: {
    CHAT: 1,          // 普通聊天
    SYSTEM: 3,        // 系统消息/通知
    TRADE: 15,        // 交易相关
    ALL: '1,19,15,32,3,44,51,52,24'
  },

  // 订单状态
  orderStatus: {
    ALL: 'ALL',
    WAIT_PAY: '待付款',
    WAIT_SEND: '待发货',
    WAIT_RECEIVE: '待收货',
    WAIT_RATE: '待评价',
    REFUNDING: '退款中'
  },

  // 交易状态枚举
  tradeStatus: {
    BUYER_TO_CONFIRM: 'buyer_to_confirm',   // 等待买家确认收货
    SELLER_TO_SEND: 'seller_to_send',       // 等待卖家发货
    TRADE_SUCCESS: 'trade_success',         // 交易成功
    TRADE_CLOSED: 'trade_closed'            // 交易关闭
  },

  // 商品状态
  itemStatus: {
    ON_SALE: 0,    // 在售
    SOLD: 1        // 已售/下架
  }
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GOOFISH_API;
}