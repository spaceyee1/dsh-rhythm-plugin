# dsh的音律插件 · v1.0.0

适配 **DeepSeek Harness** 的非官方 Windows 挑战插件。开启后，在 Harness 执行任务步骤前选择双轨音游或学科答题；通过才能继续，失败或退出则停止当前任务并显示固定回复。

实现与日志名称为 Code Arcade，安装包标识为 `dsh-code-arcade`。仓库名称为 `dsh-rhythm-plugin`。

**代码和工具调用始终由 Harness 及其模型完成。** 插件负责原生窗口、难度估算、判分和输出放行。界面使用透明 WPF 音游窗口与简洁对话框，平时仅在右下角显示「是否开启插件」复选框。

本项目采用 AI 辅助编写，与 DeepSeek 及所引用教育机构无官方合作或背书关系。代码许可见 [LICENSE](LICENSE)，第三方名称、来源与许可边界见 [NOTICE.txt](NOTICE.txt) 和 [AUDIT.md](AUDIT.md)。

## 环境要求

- Windows 本机，具备 Windows PowerShell 5.1 和 WPF。
- Node.js **22.19.0 或以上**。
- `pnpm` 已安装并可从 PATH 调用，可用 `pnpm --version` 确认；Harness 的插件管理命令会调用它。
- 已配置好模型提供方、可正常执行任务的 DeepSeek Harness。

宿主接口按 `@deepseek-ai/dsh` **0.2.0-rc.2**、Cordis **4.0.4** 核对与验证；兼容声明见 [package.json](package.json)。本包使用 Node.js 内置模块和 Windows 系统组件，宿主另行安装。原生窗口与 Harness 必须运行在同一台 Windows 电脑上，通过本机回环地址通信。

## 安装

下载或克隆本项目，在包含 `package.json` 的插件根目录打开 PowerShell，执行：

```powershell
$arcadePath = (Get-Location).Path.Replace('\', '/')
npx @deepseek-ai/dsh plugin --profile web add "file:$arcadePath"
```

安装后，切换到你希望 Harness 编写代码的实际项目目录，再启动 Harness：

```powershell
# 替换为你的实际项目路径；不要在插件源码目录里运行自己的编程任务。
Set-Location 'C:\path\to\your-project'
npx @deepseek-ai/dsh web
```

这里的 `web` 是 Harness 的 profile 名称；插件界面仍是原生 Windows 窗口。启动目录是默认工作区，详见 [Harness CLI 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)。桌面版可通过其插件管理界面添加此本地包，并使用桌面版对应的 profile。安装后请保留本地插件目录。

在插件根目录只预览右下角开关：

```powershell
npm run demo
```

预览不连接模型，也不生成代码。实际挑战需要在 Harness 中启用插件后发起任务。

## 使用

每次启动默认关闭，开关状态不跨启动保存。

1. **不勾选**：Harness 按正常流程运行，插件不缓冲或拦截该任务输出。
2. **勾选**：下一次 Harness 代理步骤开始时，弹出「杂鱼，接受挑战吧！」选择框。单独勾选不会创建任务或调用模型。
3. 选择「玩音游」，或选择「做题」后再选政治、历史、化学、物理、数学、文学、哲学。
4. 通过后窗口收起，代码继续显示在 Harness 中。实际输出规模超过已通过额度时，会追加挑战。

挑战或生成期间取消勾选，会停止当前受挑战约束的任务并回复退出文案；之后的新任务恢复正常流程。关闭挑战对话框同样视为退出，并把开关恢复为未勾选。已经放行并执行的文件修改不会回滚。

| 结果 | 条件 | Harness 中的固定回复 |
| --- | --- | --- |
| 音游失败 | MISS 数 ÷ 整张谱面音符数 **严格超过 20%**；恰好 20% 可通过 | `菜逼还让我写代码` |
| 答题失败 | 三题中错两题，第二次答错立即停止 | `菜逼还让我写代码` |
| 退出 | 主动退出、生成期间取消勾选，或原生客户端断线超过默认 8 秒 | `连挑战都不敢，杂鱼呢` |

## 音游操作

| 操作 | 按键或鼠标 |
| --- | --- |
| 上轨 | **D / J** |
| 下轨 | **F / K** |
| 双押 | 上下轨同时按下，例如 **D + F** 或 **J + K** |
| 长按 | 头部到达判定线时按下，持续到尾部，再松开 |
| 鼠标 | 对应轨道按钮支持按下、保持与抬起；双押建议用键盘 |

键盘输入需要挑战窗口保持焦点。同轨的 D/J 或 F/K 合并为一个按住状态；自动重复按键、一直按住及单次点击不能替代后续的新按下。失去焦点会释放按键，未完成长按按规则结算。

PERFECT、GOOD 都算命中并累计连击，界面显示判定、圆环、粒子和 COMBO。空按显示 MISS 并重置连击，但不增加谱面漏音数。音乐与短判定音由 PCM 合成器生成，「声音」按钮同时控制两者。

- PERFECT 窗口随复杂度从 **46ms** 收紧至 **30ms**；GOOD 的总命中窗口从 **125ms** 收紧至 **85ms**。
- 双押分别计两个音符。长按整条计一个音符，头部只显示反馈，完成尾部才记命中。
- 提前松开超过 **35ms** 判 MISS；尾前 35ms 内松开给予 GOOD 容错。

最终判分由本机服务端根据收到的输入给出。音游区域背景透明，音符、轨道和文字保持可见；选择与答题界面使用清晰底色。

## 难度和题库

插件综合有效行数、字符量、分支、循环、逻辑运算和嵌套估算连续难度。首次挑战依据最近用户请求预估，后续依据 Harness 输出累计调整。复杂任务提高音符密度、双押和长按比例，并收紧判定窗口；BPM 范围 **150—230**，谱面通常包含 **72—360 个音符**。

答题共有 **84 个模板，七科各 12 个**，每次抽取三个不同模板并打乱四个选项。36 个数学、物理、化学模板带参数变化，人文学科侧重材料、论证和概念辨析。每题附知识来源，答题后展示中文解释。

题库依据网上检索并核验的资料重新编写题干、选项和解释，挑战时使用随包资料离线出题；不会每轮实时搜索网页。经典概念与思想实验不属于本项目首创。连续目标难度从有限模板中选题，输入的每个微小变化不一定换题；难度标签尚未经过人群标定。46 个来源及适配方式见 [QUESTION-SOURCES.md](QUESTION-SOURCES.md)。

## 配置

默认 bundle 配置见 [cordis.yml](cordis.yml)：

```yaml
- id: code-arcade
  config:
    openOverlay: true
    initialEnabled: false
    port: 0
    chooseTimeoutMs: 600000
    disconnectMs: 8000
    maxBufferedBytes: 8388608
```

`initialEnabled: false` 保持启动时关闭；`port: 0` 自动选择空闲端口。服务只监听 `127.0.0.1`，控制器和挑战使用随机令牌。多个代理的挑战按顺序展示。`chooseTimeoutMs` 限制选择页面等待时间，`disconnectMs` 控制客户端断线处理，`maxBufferedBytes` 限制暂存输出大小。

## 更新和卸载

更新前结束当前任务。先从实际使用的 profile 移除已安装包，再在新版本根目录执行安装命令，最后重启 Harness。仅解压或替换文件不会刷新已经运行的旧窗口。

卸载命令：

```powershell
npx @deepseek-ai/dsh plugin --profile web remove dsh-code-arcade
```

桌面版也可在相应插件管理界面移除；命令行用户应将 `web` 换为自己安装时使用的 profile。重启 Harness 后，可删除不再需要的本地插件目录。

## 使用限制

- 开启挑战后，插件会暂存当前步骤输出，延迟逐 token 展示；通过后才放行代码或工具调用。
- 追加挑战前，模型可能已经在内存中生成草稿。这部分请求仍产生用量；失败会丢弃草稿并阻止放行，不能退还模型费用。
- 规模估算是启发式，说明文字、代码及工具参数都会保守计入，不是特定编程语言的精确复杂度分析。开启后按代理步骤门控，不提供完整的编程意图识别。
- 取消依赖 Harness 的中断机制，无法撤销已经独立运行的外部进程或已经完成的修改。压缩、会话标题等辅助请求保持宿主流程。
- 插件自身不把代码或答题结果发送到外部服务；Harness 的模型请求仍按用户配置的提供方运行。
- 源码许可与外部内容许可分别适用。OpenStax、MIT OCW 的 NC-SA 条件及 AI 使用说明，SEP、汉堡资料的转载限制，详见 [AUDIT.md](AUDIT.md) 与 [NOTICE.txt](NOTICE.txt)。本项目不保证所有用途均已获得第三方授权。

## 测试与排错

在插件根目录运行：

```powershell
npm test
npm run check
npm run check:native
```

默认 JavaScript 测试不下载依赖、不调用外部模型；原生自检需要 Windows/WPF。可进一步执行本机原生集成夹具：

```powershell
node tests/native-dialog-smoke.mjs
node tests/native-rhythm-smoke.mjs
node tests/native-delayed-handoff-smoke.mjs
node tests/native-input-smoke.mjs
node tests/native-lifecycle-smoke.mjs
```

这些脚本会创建并清理自己的窗口与测试服务。官方 Harness 运行时集成和提供方重试夹具分别为 [native-runtime-smoke.mjs](tests/native-runtime-smoke.mjs)、[runtime-provider-retry-smoke.mjs](tests/runtime-provider-retry-smoke.mjs)，需要各文件头列出的可选官方测试依赖。

排错步骤见 [DEBUG.md](DEBUG.md)；实际环境、已运行项目与未验证范围见 [VALIDATION.md](VALIDATION.md)。自动化结果不等于所有 Windows 设备、人工听音体验或端到端输入延迟均已校准。

| 文档 | 内容 |
| --- | --- |
| [DEBUG.md](DEBUG.md) | 常见故障与诊断入口 |
| [VALIDATION.md](VALIDATION.md) | 测试环境、结果及范围 |
| [AUDIT.md](AUDIT.md) | 工程审查、版权与许可初查边界 |
| [QUESTION-SOURCES.md](QUESTION-SOURCES.md) | 题库来源、编写方式和难度说明 |
| [NOTICE.txt](NOTICE.txt) | 第三方名称、组件与资料权利说明 |
| [LICENSE](LICENSE) | 本项目代码许可证 |
