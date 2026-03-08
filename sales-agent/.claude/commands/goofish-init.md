# 初始化闲鱼销售 Agent

## 参数说明
- `--force`: 强制重新初始化，即使系统已经初始化过

## 执行逻辑

### 第一步：检查是否需要初始化

首先检查命令是否包含 `--force` 参数：

```javascript
// 检查命令参数
const hasForce = userMessage.includes('--force');
```

### 第二步：检查当前状态

使用 `chrome-devtools_list_pages` 检查当前打开的页面：

```javascript
// 检查是否已经有闲鱼页面打开
const pages = await chrome-devtools_list_pages();
const hasGoofishPage = pages.some(page => page.url.includes('goofish.com/im'));
```

然后使用 `chrome-devtools_take_snapshot` 检查页面内容：

```javascript
// 检查是否已经初始化
const snapshot = await chrome-devtools_take_snapshot();
const isInitialized = snapshot.content.includes('系统已就绪') || 
                      snapshot.content.includes('正在监听买家消息') ||
                      snapshot.content.includes('消息监听脚本');
```

### 第三步：根据状态决定执行

**如果已经初始化且没有 --force 参数：**
- 输出提示：`"系统已经初始化过了，当前正在监听买家消息。如需重新初始化，请使用 --force 参数"`
- 不要执行任何操作

**如果需要初始化（未初始化 或 有 --force）：**
继续执行以下步骤：

1. **打开闲鱼消息页面**
   - 使用 `chrome-devtools_new_page` 打开 `https://www.goofish.com/im`
   - 等待页面加载完成

2. **检查登录状态**
   - 使用 `chrome-devtools_take_snapshot` 查看页面
   - 如果未登录，等待用户手动登录
   - 如果已登录，继续下一步

3. **注入消息监听脚本**
   - 使用 `chrome-devtools_evaluate_script` 注入消息监听代码
   - 监听新消息并报告到云端

4. **确认初始化完成**
   - 告知用户系统已就绪
   - 开始监听买家消息

## 实现示例

```javascript
// 检查命令参数
const hasForce = userMessage.includes('--force');

// 检查当前页面
const pages = await chrome-devtools_list_pages();
const hasGoofishPage = pages.some(page => page.url.includes('goofish.com/im'));

// 如果已有闲鱼页面，切换到该页面
if (hasGoofishPage) {
    const pageId = pages.find(page => page.url.includes('goofish.com/im')).id;
    await chrome-devtools_select_page({ pageId });
}

// 检查初始化状态
const snapshot = await chrome-devtools_take_snapshot();
const isInitialized = snapshot.content.includes('系统已就绪') || 
                      snapshot.content.includes('正在监听买家消息');

// 判断是否需要初始化
if (isInitialized && !hasForce) {
    console.log('系统已经初始化过了，当前正在监听买家消息。如需重新初始化，请使用 --force 参数');
    return;
}

// 执行初始化流程
// ... 执行步骤1-4
```

## 使用示例

- 首次初始化：`/goofish-init`
- 强制重新初始化：`/goofish-init --force`
