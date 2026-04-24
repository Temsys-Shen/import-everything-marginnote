# Web插件开发模板

用于MarginNote4的Web插件工程模板。模板内置React+Vite前端与WebView面板桥接。

## 开始开发

安装依赖：

```bash
pnpm install
# 或(使用npm时)
npm install
```

开发模式：

```bash
pnpm dev
# 或(使用npm时)
npm run dev
```

说明：启动Vitedevserver。修改 `web/`下前端代码时由Vite自己reload；修改 `src/`下插件代码时会自动重新部署插件并重启MarginNote。

## 打包发布

执行 `build`会先运行发布态Web构建，把UIWebView兼容的经典离线资源输出到 `src/web-dist`，再打包成 `.mnaddon`：

```bash
pnpm build
# 或(使用npm时)
npm run build
```

## 常用命令

更新版本号时会同时修改 `package.json`和 `src/mnaddon.json`：

```bash
pnpm version:patch
pnpm version:minor
pnpm version:major
```

如果当前目录是干净的git工作区，会自动创建commit并打tag，例如 `v0.2.0`。

## 桥接协议

Web页面与插件层按以下结构通信：

- `command`：命令名
- `requestId`：请求ID
- `payload`：命令参数
- `error`：错误对象

模板示例使用URL拦截桥接：

- Web调用 `MNBridge.send(command,payload)`
- 插件侧在 `webView:shouldStartLoadWithRequest:navigationType:`中解析 `mnaddon://bridge?...`

## 面板交互

- 插件面板采用浮动窗口，挂载在 `studyController.view`上
- 标题栏拖拽可移动窗口
- 右下角拖拽可缩放窗口
- 标题栏双击可最大化/还原
- 右下角双击可居中窗口
- 窗口位置与大小会保存到 `NSUserDefaults`键 `mn_web_template_frame_config`

## 目录说明

- `src/`：插件代码与打包根目录
- `src/WebPanelController.js`：浮动面板UI、页面加载与URL scheme入口
- `src/WebBridgeCommands.js`：bridge命令函数定义，命令名必须与前端 `command`字段一致
- `src/web-dist/`：发布期静态前端产物目录
- `web/`：React+Vite源码目录
- `web/src/lib/mnBridge.js`：前端bridge SDK入口，页面和组件直接从这里import
- `web/vite.config.js`：开发态Vite配置
- `web/vite.release.config.js`：发布态Vite配置，输出经典单bundle脚本
