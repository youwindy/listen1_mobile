# Listen1 Mobile

一款支持多平台音乐播放和搜索的移动音乐 App：浏览与搜索多个平台的音乐、收藏到自建歌单、夜间模式、备份与恢复数据。

本项目已从 React Native 0.59 + Flow 重写为 **React Native 0.87 + TypeScript**，旧的 0.59 代码完整保留在 [`legacy/`](legacy/) 目录中以便对照。

## 特性

- 一个 App 播放多平台的音乐（网易云、QQ、酷狗、酷我）
- 搜索多平台音乐
- 浏览、播放多平台歌单
- 收藏音乐到自建歌单，支持新建、重命名、排序、删除
- 夜间模式
- 备份 / 恢复（兼容 Listen1 浏览器扩展的导出格式）
- 后台播放与锁屏 / 通知栏控制

## 技术栈

| 领域 | 选型 | 取代了旧版的 |
| --- | --- | --- |
| 框架 | React Native 0.87.1 + React 19.2（新架构 / Fabric + TurboModules） | RN 0.59.9 + React 16.8 |
| 语言 | TypeScript 6（strict） | Flow |
| 导航 | React Navigation 7 原生栈 | react-navigation 3 + react-native-scrollable-tab-view |
| 状态管理 | Zustand 5 + AsyncStorage 持久化 | Redux + redux-persist 5 + `connect` |
| 音频播放 | react-native-track-player 4 | react-native-video 4 + react-native-music-control 0.10 |
| 列表 / 网格 | @shopify/flash-list 2 | `deprecated-react-native-listview` + 内置 `FlatGrid` |
| 加密 | `crypto-js` + 自实现 textbook RSA（BigInt） | 内置的 `vendor/cryptojs_aes.js` + `vendor/jsencrypt.js` |
| 样式 | 主题对象 + `StyleSheet`（`useTheme()`） | styled-components 4 |

## 目录结构

```
app/
  api/           音乐平台接口层
    client.ts      平台注册表：按 id 前缀（netrack_ / qqplaylist_ …）分发到对应 provider
    types.ts       Track / PlaylistInfo / MusicProvider 等领域类型
    provider/      netease.ts · qq.ts · kuwo.ts · kugou.ts
  components/    复用 UI（Screen、AppText、TrackRow、PlaylistCard、MiniPlayer…）
  hooks/         usePlatformBrowse 等数据钩子
  modules/       crypto.ts（weapi 加密）、backup.ts（备份格式）
  navigation/    AppNavigator.tsx（React Navigation 7 路由表）
  playback/      service.ts（后台播放服务）、PlaybackBridge.tsx（store ↔ 原生播放器同步）
  screens/       各业务页面
  store/         player.ts · myPlaylist.ts · settings.ts（Zustand）
  theme/         调色板与明暗主题
legacy/          归档的 React Native 0.59 版本（只读参考，不参与构建）
android/ ios/    新版原生工程
```

## 开发环境

- Node.js ≥ 22.11（模板要求；本机使用 v24）
- JDK 17
- Android SDK：platform 36 + build-tools 36.0.0 + NDK 27.1.12297006
- iOS：Xcode + CocoaPods（仅 macOS）

## 常用命令

```bash
pnpm install          # 安装依赖（使用 hoisted 布局）

pnpm start            # 启动 Metro
pnpm android          # 在 Android 设备/模拟器上运行
pnpm ios              # 在 iOS 模拟器上运行（macOS）

pnpm typecheck        # tsc --noEmit
pnpm test             # Jest（离线单测）
pnpm lint             # ESLint

pnpm build:android:debug     # 打 debug APK
pnpm build:android:release   # 打 release APK
```

## 打包 Android APK

1. 生成签名密钥并提供给 Gradle（可写在 `android/gradle.properties` 或 `~/.gradle/gradle.properties`）：

   ```properties
   MYAPP_UPLOAD_STORE_FILE=my-release-key.keystore
   MYAPP_UPLOAD_STORE_PASSWORD=*****
   MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
   MYAPP_UPLOAD_KEY_PASSWORD=*****
   ```

   未提供时 release 构建会回退到 debug 签名，方便本地验证；正式发布请务必配置。

2. 执行 `pnpm build:android:release`，产物在 `android/app/build/outputs/apk/release/`。

### 包体积与 ABI 拆分

release 构建默认开启 **R8 代码压缩 + 资源压缩**，并按 CPU 架构拆分 APK。原生库（`libreactnative`、`libhermesvm`、`libc++_shared`、`libsqliteJni` 等）占包体约 83%，而一个「胖包」会同时塞进四种架构，绝大多数设备要为此多下载三份永远用不到的原生库。

| 产物 | 大小 | 适用 |
| --- | --- | --- |
| `app-arm64-v8a-release.apk` | ≈20 MB | 2017 年后的主流手机（**首选**） |
| `app-armeabi-v7a-release.apk` | ≈16 MB | 老旧的 32 位设备 |
| `app-x86_64-release.apk` / `app-x86-release.apk` | ≈21 MB | 模拟器 |
| `app-universal-release.apk` | ≈63 MB | 不确定架构时的兜底 |

对比优化前的单个胖包 70.4 MB：**arm64 单架构包缩小约 71%**。其中 R8 把 dex 从 8.4 MB 压到 2.0 MB，资源压缩把 `resources.arsc` 从 1.45 MB 压到 0.76 MB。

想只出一个通用胖包（例如内部分发）：

```bash
cd android && gradlew.bat assembleRelease -PnoAbiSplits=true
```

想在 release 里彻底去掉模拟器架构（通用包可再减约 40 MB）：

```bash
cd android && gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

> 上架 Google Play 时请改用 AAB（`bundleRelease`），商店会按设备只下发对应架构，效果优于自行拆分 APK。

> 说明：`android/build.gradle` 中的 `compileSdkVersion` 目前固定为 36，因为该值对应本机已安装的 SDK 平台；若你的环境已装 API 37，可自行调整为 37 与 build-tools 37.0.0。

## 已知适配项

- **react-native-track-player 适配补丁（必须）**：4.1.2（当前最新稳定版）无法直接用于 RN 0.87，有两处不兼容，由 [`scripts/patch-track-player.mjs`](scripts/patch-track-player.mjs) 在 `pnpm install` 后自动修复（幂等、按内容匹配、写入前校验括号平衡）：
  1. `Track.originalItem` 是 `Bundle?`，而 RN 0.87 的 `Arguments.fromBundle` 要求非空，安卓编译报 *Argument type mismatch*。
  2. 所有 `@ReactMethod` 写成表达式体 `fun f(...) = scope.launch { … }`，返回 `Job`，JVM 签名不是 `void`；RN 0.87 的 TurboModule 互操作层假设「非 void 即同步方法」，会在启动时抛 *ParsingException: Unable to parse @ReactMethod annotations from native module: TrackPlayerModule*，表现为**打开即闪退**。补丁把 37 个方法改成块状函数体，丢弃 `Job` 并保留 `MainScope` 调度。

  上游发布适配 RN 0.87 的版本后即可删除该脚本与 `package.json` 里的 `postinstall`。临时跳过：`SKIP_TRACK_PLAYER_PATCH=1 pnpm install`。
- **明文 HTTP 白名单**：部分平台接口只提供 HTTP（网易歌单详情、QQ 搜索与封面、酷我歌单与播放地址、酷狗移动端接口）。debug 构建默认允许明文；release 构建默认禁止，因此 [`network_security_config.xml`](android/app/src/main/res/xml/network_security_config.xml) 只为这些音乐域名放开明文，其余仍保持安全默认。
- **明文 HTTP 与数据安全**：上述接口属于 HTTP 传输，存在被中间人篡改的风险；若平台后续提供 HTTPS 接口，应优先切换并收紧该白名单。

## 与旧版的差异（有意为之）

- **排序歌单**：旧版依赖已停止维护的 `react-native-sortable-listview` 做拖拽排序，新版改为「上移 / 下移」按钮，不引入新的拖拽依赖。
- **歌单本地页面**：旧版有独立的本地歌单路由，新版合并进「我的歌单」页内切换，减少一层导航。
- **错误处理**：旧版大量 `.catch(() => {})` 会把失败静默成 `undefined`；新版统一抛出带中文提示的 `Error`，页面显示可重试的错误态。

## 测试

单测只覆盖**不依赖网络**的纯逻辑，因此可以在 CI 中离线运行：

- `app/modules/__tests__/crypto.test.ts` — weapi 加密：用自身输出解密回原文，并用 Node 的 OpenSSL 实现做 RSA 往返校验
- `app/store/__tests__/player.test.ts` — 播放队列、随机播放顺序、播放失败跳过、播放模式循环
- `app/api/__tests__/` — 平台 provider 的解析、id 前缀、URL 识别与错误传播

## 法律相关

This software is distributed under the MIT license. 本项目仅提供代码，使用所产生的任何后果由使用者自行承担。
