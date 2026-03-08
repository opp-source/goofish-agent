/**
 * 闲鱼 API 测试脚本
 * 在浏览器控制台中运行，测试各个 API 的可用性
 */

// 测试结果存储
const TEST_RESULTS = {
  passed: [],
  failed: [],
  errors: {}
};

// 获取签名所需的 token
function getTokens() {
  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});

  return {
    t: cookies.t || '',
    _tb_token_: cookies._tb_token_ || '',
    _m_h5_tk: cookies._m_h5_tk ? cookies._m_h5_tk.split('_')[0] : ''
  };
}

// 生成签名
function generateSign(token, timestamp) {
  // 简化的签名生成，实际签名算法更复杂
  return `${token}_${timestamp}`;
}

// 调用 API
async function callAPI(apiName, apiConfig, data = {}) {
  const tokens = getTokens();
  const timestamp = Date.now();

  const url = new URL(`https://h5api.m.goofish.com/h5/${apiConfig.api}/${apiConfig.version}/`);

  url.searchParams.set('jsv', '2.7.2');
  url.searchParams.set('appKey', '34839810');
  url.searchParams.set('t', timestamp.toString());
  url.searchParams.set('v', apiConfig.version);
  url.searchParams.set('type', 'originaljson');
  url.searchParams.set('accountSite', 'xianyu');
  url.searchParams.set('dataType', 'json');
  url.searchParams.set('timeout', '20000');
  url.searchParams.set('api', apiConfig.api);
  url.searchParams.set('sessionOption', 'AutoLoginOnly');

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: `data=${encodeURIComponent(JSON.stringify(data))}`,
      credentials: 'include'
    });

    const result = await response.json();

    if (result.ret && result.ret[0] && result.ret[0].includes('SUCCESS')) {
      return { success: true, data: result.data };
    } else {
      return { success: false, error: result.ret };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 测试函数
async function testAPI(name, apiConfig, testData = {}) {
  console.log(`\n[测试] ${name}: ${apiConfig.desc}`);

  const result = await callAPI(name, apiConfig, testData);

  if (result.success) {
    console.log(`✅ 通过: ${name}`);
    TEST_RESULTS.passed.push(name);
    return true;
  } else {
    console.log(`❌ 失败: ${name}`, result.error);
    TEST_RESULTS.failed.push(name);
    TEST_RESULTS.errors[name] = result.error;
    return false;
  }
}

// 运行所有测试
async function runAllTests() {
  console.log('========== 开始测试闲鱼 API ==========\n');

  // 消息相关 API
  console.log('--- 消息相关 API ---');

  await testAPI('loginUser', { api: 'mtop.taobao.idlemessage.pc.loginuser.get', version: '1.0' });
  await testAPI('sessionSync', { api: 'mtop.taobao.idlemessage.pc.session.sync', version: '3.0' }, { sessionTypes: '[3]', fetchNum: 10 });
  await testAPI('redpointQuery', { api: 'mtop.taobao.idlemessage.pc.redpoint.query', version: '1.0' }, { sessionTypes: '1,3,15', fetch: 10 });
  await testAPI('accsToken', { api: 'mtop.taobao.idlemessage.pc.accs.token', version: '1.0' });
  await testAPI('userQuery', { api: 'mtop.taobao.idlemessage.pc.user.query', version: '4.0' }, { userIds: [] });

  // 订单相关 API
  console.log('\n--- 订单相关 API ---');

  await testAPI('boughtList', { api: 'mtop.idle.web.trade.bought.list', version: '1.0' }, { pageNumber: 1, orderStatus: 'ALL' });

  // 用户相关 API
  console.log('\n--- 用户相关 API ---');

  await testAPI('pageHead', { api: 'mtop.idle.web.user.page.head', version: '1.0' }, { self: true });
  await testAPI('pageNav', { api: 'mtop.idle.web.user.page.nav', version: '1.0' });

  // 商品相关 API
  console.log('\n--- 商品相关 API ---');

  await testAPI('itemList', { api: 'mtop.idle.web.xyh.item.list', version: '1.0' }, { needGroupInfo: true, pageNumber: 1, pageSize: 10 });

  // 输出结果
  console.log('\n========== 测试结果 ==========');
  console.log(`通过: ${TEST_RESULTS.passed.length}`);
  console.log(`失败: ${TEST_RESULTS.failed.length}`);

  if (TEST_RESULTS.failed.length > 0) {
    console.log('\n失败的 API:');
    TEST_RESULTS.failed.forEach(name => {
      console.log(`  - ${name}: ${JSON.stringify(TEST_RESULTS.errors[name])}`);
    });
  }

  return TEST_RESULTS;
}

// 执行测试
runAllTests();