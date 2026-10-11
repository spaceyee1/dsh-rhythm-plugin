# DEBUG · v1.0.0

本文面向用户与维护者，说明可复现问题、已完成的验证及常见排障方法。v1.0.0 将此前开发版本的实现、修复和验证记录合并为一个发布基线；统一版号和整理本文，不表示再次执行了下列全部测试。详细执行记录见 [VALIDATION.md](VALIDATION.md)，安装与配置见 [README.md](README.md)。

已验证环境为 Windows 本机、Windows PowerShell 5.1、WPF/.NET 与 Node.js 24.16.0。两个 PowerShell 源文件保留 UTF-8 BOM。原生界面与 Harness 必须运行在同一台 Windows 机器上；本地 HTTP 桥接只监听 `127.0.0.1`。

**已修复的三类实现问题**

| 问题与复现条件 | 修复与回归证据 |
| --- | --- |
| 结构化工具输出漏计。一个含十万个数字的工具参数长 900,031 字符，原提取结果只有 9 字符文件名，可能漏掉追加挑战。大批空数组、空对象或嵌套空容器也会漏计。 | [plugin.mjs](src/plugin.mjs) 保留规范化 JSON 的结构、键和所有标量；代码字符串只解码计一次，保留真实分支。修复前完整中间件回归失败；修复后四类大参数均触发追加挑战，挑战失败时不放行工具。累计内容精确 4096 字节通过、4097 字节拒绝的边界仍有回归。 |
| 临时音轨累积。连续完成挑战时，隐藏窗口仅停播，旧 WAV 可能一直保留到挂件退出；迟到的合成任务还可能重新留下文件。 | [原生控制器](desktop/controller.ps1) 按局关闭播放器、释放旧音轨，退休任务清理迟到结果；播放器短暂占用文件时仅重试已退休路径。生命周期夹具覆盖连续十局及异步完成后的清理。 |
| 长题导致窗口越过工作区。小选择框居中后切换到较高的答题界面，原 Top 不变，退出按钮可能落到屏幕外。 | 布局增长后，按当前窗口所在监视器的工作区校正越界位置，并转换物理像素与 WPF DIP；原位置仍合法时保持不动。长题内部滚动，退出按钮在滚动区域之外。真实本机工作区与离线负坐标／125% DPI 回归均有覆盖。 |

题库另有两项准确性修正：来源表中的 `his-source-inference` 已对应到 Federalist No. 10，实际题目的来源链接原本即正确；84 个模板的文档 URL 已与代码交叉核对。康德假言命令题将“想通过考试”改为“已决定以通过考试为目标”，明确意欲目标的前提，正确选项不变。依据与许可范围分别见 [QUESTION-SOURCES.md](QUESTION-SOURCES.md)、[AUDIT.md](AUDIT.md) 和 [NOTICE.txt](NOTICE.txt)。

**从包目录复跑验证**

以下命令在解压目录或仓库根目录执行。默认自动测试不下载依赖，也不调用外部模型。

```powershell
node --version
powershell.exe -NoProfile -Command '$PSVersionTable.PSVersion'
npm test
npm run check
npm run check:native
powershell.exe -NoProfile -STA -File .\desktop\overlay.ps1 -ValidateOnly
```

| 已有证据 | 命令与范围 |
| --- | --- |
| 75 项自动测试通过 | `npm test`；覆盖难度、可完成谱面、双押／长按、阈值、会话隔离、生成门控、取消、缓冲边界及题库。包含理科 18,000 组独立验算、同种子连续难度选题检查。 |
| 68 项原生自检通过 | `npm run check:native`；实际加载 XAML/WPF、编译辅助类、调用生产处理函数，检查透明像素、输入来源合并、乱序反馈去重、终态及界面布局。 |
| 原生加载检查通过 | `-ValidateOnly` 已返回 `native=WPF`、`transparentSwitch=true`、`separateDialog=true`、`controls=36`、`externalAssets=false`。 |
| 生命周期 32 个断言通过 | `node tests/native-lifecycle-smoke.mjs`；其中 11 项行为断言、21 次异步完成等待，覆盖音轨释放、迟到清理、服务器时间对齐和长题工作区位置。 |
| 四项原生 smoke 通过 | 下面前四条命令；最后一条是单列的生命周期测试。夹具创建并清理自己的本地桥接和测试进程。输入测试调用实际 WPF 处理函数，不能据此声称已做人工物理键盘实按验证。 |
| 七个真实 Harness 运行时场景通过 | `node tests/native-runtime-smoke.mjs`；官方宿主服务配合内存脚本适配器与计数工具，覆盖首次失败／退出、追加挑战失败／通过、提供方挂起时退出、默认关闭、下一任务启用。 |
| 真实运行时重试通过 | `node tests/runtime-provider-retry-smoke.mjs`；两次脚本模型调用、零次工具执行、一次挑战，保留失败诊断，实时流与持久会话事件均不含未审查草稿。 |

```powershell
node tests/native-input-smoke.mjs
node tests/native-rhythm-smoke.mjs
node tests/native-dialog-smoke.mjs
node tests/native-delayed-handoff-smoke.mjs
node tests/native-lifecycle-smoke.mjs
```

输入 smoke 已观察到九个按下／抬起 HTTP 请求严格 FIFO、峰值并发一；长按头部不计分、尾部只计一次、提前释放记一次 MISS。故意延迟旧局终态响应 2300ms 的夹具仍先显示末次反馈，再切换下一局。通过后隐藏的界面继续心跳，保持代码生成；终态末次反馈保留约 440ms。

两个真实 Harness 运行时夹具需要可选的官方测试依赖：Cordis 4.0.4 与相应 Harness 服务 0.2.0-rc.2。安装方法写在各 [运行时夹具](tests/native-runtime-smoke.mjs) 和 [重试夹具](tests/runtime-provider-retry-smoke.mjs) 的文件头，适合在隔离测试目录中准备。出现 `ERR_MODULE_NOT_FOUND` 时先确认这些可选依赖；它们不属于默认 `npm test` 所需的下载步骤。

定位本次修复可单独执行：

```powershell
node --test --test-name-pattern='large numeric and empty-container|tool accounting|cumulative source byte' tests/plugin.test.mjs
node --test --test-name-pattern='unchecking settles|unchecking during live generation|error and aborted' tests/plugin.test.mjs
node tests/native-lifecycle-smoke.mjs
Select-String -Path .\QUESTION-SOURCES.md,.\src\question-bank.mjs -Pattern 'his-source-inference|phi-hypothetical'
```

取消勾选的专项回归同时覆盖正在挑战和排队的独立任务：即使两者的信号均未 abort，也会及时退出，排队任务不弹新挑战。该复现没有要求修改原有排队实现。

**常见现象与处理**

| 现象 | 按此顺序检查 |
| --- | --- |
| 没有弹出挑战框 | 默认仅有右下角未勾选的小开关；勾选本身不生成任务，也不立刻弹题。先确认开关已开启，再发起实际 Harness 任务。通过后收起挑战框属于正常流程。 |
| 连小开关都没有 | 确认 Harness 在本机 Windows 运行，插件已按 README 加载。先执行 `-ValidateOnly`；若加载成功，再用下方 `-PreviewChallenge` 检查窗口。查看 Harness 日志中的“悬浮窗启动失败／退出”及原生报错。 |
| PowerShell 报执行策略或中文解析错误 | 用 `Get-ExecutionPolicy -List` 记录策略，按设备现有管理规则处理。中文解析异常时核对源文件仍为 UTF-8 BOM，编辑器保存应选择带签名 UTF-8；不要只修乱码文本后继续运行。 |
| D/F 或 J/K 没反应、长按中断 | 音游需要挑战窗口获得焦点；切到其他窗口会清空按键并向两轨发送释放。重新点击挑战界面，松开旧键后再按。同轨 D/J、F/K 合并，只有该轨最后一个键或鼠标来源松开时才释放。 |
| 长按头出现 PERFECT，但 HIT 没增加 | 头部只给反馈，按到尾才计一个音符。系统重复键不会自动命中下一音符。尾前超过 35ms 松开记 MISS，尾前 35ms 内松开只给 GOOD；下一音符仍需重新按下。 |
| 没有音乐或判定音 | 检查界面的“声音：开／关”、Windows 应用音量与输出设备。开场首音前为静音，等待实际音符开始。若显示“无法播放声音”，保留这条具体报错并运行生命周期测试。预览模式不代表完整音乐播放测试。 |
| “正在重连”、`ECONNREFUSED`、`EACCES` 或 `fetch failed` | 确认 Harness 的 Node 进程仍在运行、原生客户端与桥接同机、日志里的端口属于当前进程。退出／重启后的旧地址不能复用。可按下方命令检查端口；被沙盒或设备策略限制时，依据报错确认本机连接权限。 |
| 题目长、来源或答案似乎缺失 | 题目区域可以垂直滚动，来源位于题干下及上一题解释下。先滚动确认内容，再记录题目 ID、模板 ID 或来源标题。窗口增长后退出按钮应仍在工作区；若仍越界，补充屏幕分辨率、缩放比例和是否刚切换显示器。 |
| 更新后仍像旧版、改动无效 | 先关闭旧 Harness 进程及它启动的挂件，确认当前解压目录的 `package.json` 是 `1.0.0`，再按 README 核对实际安装来源并重新启动。仍有多份时先辨认各自路径，避免把另一个目录的自检结果当作当前安装结果。 |

原生预览与端口检查示例：

```powershell
# 只检查原生选择框，不连接真实模型。
powershell.exe -NoProfile -STA -File .\desktop\overlay.ps1 -PreviewChallenge

# 将数值替换为当前 Harness 控制日志中的实际端口。
$bridgePort = 12345
Test-NetConnection -ComputerName 127.0.0.1 -Port $bridgePort

# 当前目录的发布版本应为 1.0.0。
Get-Content .\package.json | ConvertFrom-Json | Select-Object name,version

# UTF-8 BOM 的前三个十进制字节应为 239-187-191；另一份 controller.ps1 同理。
$scriptBytes = [IO.File]::ReadAllBytes((Resolve-Path .\desktop\overlay.ps1).Path)
$scriptBytes[0..2] -join '-'
```

需要进一步定位时，使用当前 `[Code Arcade Control]` 日志里的本机地址运行 `overlay.ps1 -Url '<当前控制器地址>' -TraceStartup`。追踪包含加载阶段、判定序号及终态收起顺序；可以据此区分尚未显示、正常隐藏和网络重连。不要同时启动多个客户端调试同一场长按，因为按下状态和心跳会被共同使用。

提交 issue 时提供实际包版本、Node/Windows PowerShell 版本、复现步骤、失败的测试命令和相关报错。控制器／挑战地址中的 `token=` 是会话凭据，日志分享前替换为 `<redacted>`；同样移除私密代码、工具参数与账号信息。截图只保留挂件及必要报错区域，避免把背后的私密 Harness 内容一起公开。

**验证范围**

已有记录未包含真实账号/profile 的安装或移除事务，也未连接真实 DeepSeek 提供方；运行时模型均为内存脚本适配器。实际双屏、人工听音、真人按键延迟校准和大规模真人难度测量尚未验证。负坐标与 125% DPI 是离线坐标回归，不能替代双屏实机测试；PCM 结构、首音前静音及播放 seek 检查也不能替代人工听音。详细来源核查与权利边界保留在 [AUDIT.md](AUDIT.md)，不以本调试记录作无侵权保证。
