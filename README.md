# dsh-wide-chat

给 DSH 网页版加一根能拖的把手，把聊天列调宽。装完就能拖，重启后还记得。

大屏上 DSH 的会话列只占中间一条，左右两边空着。这个插件把列宽做成可拖的：把手在会话列**右缘**，按住往右拉就变宽，**双击把手恢复默认 1040px**。

- 范围 520–2400px
- 宽度存在 `localStorage['dsh-wide-chat:width']`，下次打开还在
- 输入框、审批卡、用户气泡的宽度都跟着同一个变量走，不会出现「内容宽了、输入框还窄」
- 不用拖也能改：控制台（F12）里 `__dshWideChat.set(1200)` / `__dshWideChat.reset()`

## 安装

### 方式一：一条命令（推荐）

```sh
dsh plugin --profile desktop add github:Hakuno410/dsh-wide-chat
```

装完**重启 DSH**（新增 bundle 需要重启才会下发客户端模块）。

> 把 `desktop` 换成你自己的 profile 名。Web 版一般叫 `web`。

### 方式二：插件市场

在 DSH 里打开插件市场（`dshmarket`），搜 `dsh-wide-chat`，点安装。

### 方式三：本地

```sh
git clone https://github.com/Hakuno410/dsh-wide-chat.git
dsh plugin --profile desktop add link:"<克隆下来的目录>"
```

### 卸载

```sh
dsh plugin --profile desktop remove dsh-wide-chat
```

重启即可。拖过的宽度值会留在 localStorage 里，不影响 DSH 本身。

## 它到底改了什么

只改一个 CSS 自定义属性：

```css
:root{ --dsh-chat-content-width: 1040px !important }
```

DSH 的会话列是 `.xxx_column{max-width:var(--dsh-chat-content-width)}`（类名是构建哈希，随版本变；变量名稳定）。输入框的 `Zf6DNq_card`、用户气泡的 `LOmM4q_userStack`、表格的宽表逻辑，全都从这个变量派生。所以改这一个，整列一起走，**不碰任何 DOM 结构**。

`!important` 是为了压过可能的 `:root` 内联声明——运行时算出来的值写在 style 属性里，样式表规则只有带 `!important` 才盖得住（自定义属性也遵守这条）。

## 兼容性

- 要求 DSH `>= 0.2.0-rc.2`（用到了 `--dsh-chat-content-width` 这个变量）
- 纯前端插件，host 半是空的：不注册服务、不加工具、不占上下文
- 和别的 UI 插件不冲突：它不插 React 节点，把手是 `position:fixed` 挂在 `body` 上

## 已知限制

- **找不到会话列时会退回居中公式定位**：如果以后的版本把 `[data-slot="conversation.chat.flow"]` 改名了，把手位置会偏，但拖拽本身仍然有效（宽度是变量驱动的）。改 `findColumn()` 里的选择器即可。
- 只影响**网页版 GUI**，命令行 / TUI 无关。
- 不改变 DSH 自己的偏好键（`dsh.conversation.contentWidth`）——两套互不干扰。如果你的 DSH 版本自带宽度把手，两者可以共存，谁最后写谁生效。

## 开发

```sh
node --check lib/client.js     # 语法检查
node test/smoke.mjs            # 冒烟测试（需要 playwright-core）
```

`lib/client.js` 是手写的模块加载器格式（`window.__ModuleLoader__.load`），**不需要构建**。
改完如果 DSH 在跑，客户端模块会通过 HMR 热替换，约 1 秒生效，不用重启。

## License

MIT
