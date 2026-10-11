# Code Arcade v1.0.0 · 调试、抄袭与知识产权复核

核验日期：2026-10-11。正式发布版本为 **v1.0.0**，采用本轮已经修复、验证的代码基线。审计从实际交付的开发归档解压开展：修复前归档 `dsh-code-arcade-2.3.0.zip` 的 SHA-256 为 `924E0A196D37CCBAB1F699F9655483383631ACE4D600671ACDECAE9777061B8D`，内含 30 个文件；修复后开发归档 `dsh-code-arcade-2.3.1.zip` 的 SHA-256 为 `A051B6161BF4AC6DB0997B3E60FB98BEEAAC1F107B66B714D64D710922149E8B`。旧编号仅供溯源；本次统一版本号、增加发布文档，保留原始归档。

## 结论

发现三类可复现实现问题：结构化工具输出漏计、临时音频按局释放不及时、选择页切长题后窗口可能越过屏幕工作区。修订内容和最终测试结果见 `VALIDATION.md`。另修复来源文档错挂，精确化一道人文题的前提和“原创”措辞范围。

在包内实现、文件清单、素材来源以及公开短句抽查范围内，**未发现直接复制第三方游戏实现、素材或成套题库的证据**。这个结论不等于“全网查重通过”或“确定没有侵权”：没有完整第三方代码库、商业题库、相似音乐库、商标或专利库的比对，也没有律师的法律鉴定。参与者包含本项目的编写者，因此不是独立第三方认证。

来源内容的许可与实际复用方式仍需区分：知识原理可以由自己编写表达，但修改人名、参数或措辞并不能自动排除对受保护表达的改编。代码 MIT 许可不能把外部教材、文章、品牌或音乐重新授权。下方逐站记录了具体限制，不建议把本包描述为“全部内容已经获得任意商用授权”。

## 包内代码与素材证据

| 对象 | 本次看到的内容 | 判断的边界 |
| --- | --- | --- |
| 运行代码 | `src/` 只导入本包模块和 Node.js 内置模块；WPF/PowerShell 内嵌 C# 使用 Windows/.NET 库。没有第三方运行代码库或 `node_modules` 随 ZIP 分发。 | 没有外部依赖包不等于数学上证明每行代码独创；常见算法、接口写法和常量可能自然相似。 |
| 图形 | XAML/WPF 几何图形绘制轨道、音符、粒子、判定及按钮；包内没有图片、游戏角色、截图、Logo 或 sprite 图。 | 没有使用喵斯快跑素材的证据；未进行整体视觉表达、商标或不正当竞争的法律鉴定。 |
| 字体 | 引用系统已安装的 Microsoft YaHei UI；没有分发字体文件。 | 用户系统字体许可仍独立适用。 |
| 音频 | `RenderAudio` 与 `CreateImpact` 使用振荡器、包络和种子合成 PCM；没有 MP3/WAV/OGG、录音样本或现成谱面随包分发。 | 未做音乐旋律全库比对；自行合成并不自动证明不存在偶然相似。 |
| 题库 | 84 个模板、46 条知识来源，重新编写中文题干/选项/解释；36 个理科模板有参数变化。 | 原理、经典思想实验和历史文件主张不是本项目首创。来源与许可详情见下文及 `QUESTION-SOURCES.md`。 |
| 宿主与测试依赖 | DeepSeek Harness 与 Cordis 仅用于宿主 API 和隔离测试，未打包其发行物。 | 已核验 Harness 的 MIT LICENSE 和本机 Cordis 4.0.4 的 MIT LICENSE；若未来复制或分发其代码，须保留适用声明。 |

宿主许可依据：[Harness LICENSE](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/LICENSE)。本包 `LICENSE` 只表达贡献者在有权授予范围内对本包代码的许可；不能证明 AI 辅助内容必然有完整著作权，也不能授予第三方权利。

## 代码公开检索抽样

对以下五段有辨识度的代码注释及三个表达式/标识组合做了带引号的公开网页检索。仅发送这些短片段，没有上传完整源码到第三方查重平台。

- `Every normal chart teaches both mechanics, including the smallest chart`
- `A parent cancellation already cancels its descendants`
- `Retired render jobs still own their eventual temporary result`
- `The checkbox lives for the plugin lifetime`
- `Each lane of a chord and each complete hold is one note`
- `pressedLanes` 与 `start-rhythm` 的组合
- `metrics.lines + metrics.complexity * 6`
- `OrderedTails` 与 `ArcadeNative` 的组合

本次返回的可见结果没有显示上述片段的完整对应实现；搜索引擎有时返回宽泛相关内容。该抽样只能支持“未在返回范围发现直接对应”，不能给出准确重复率，不能排除未索引、私有仓库、改名或结构性抄袭。题干另做八条短句检索，见下文。

## 权利与服务条款的具体边界

《计算机软件保护条例》第六条不把软件思想、处理过程、操作方法或数学概念本身纳入软件著作权保护；WIPO 同样区分思想与具体表达。因此使用双轨、长按、命中判定等思路本身不直接证明抄袭，但具体代码、美术、音乐和文字仍需单独判断。[最高人民法院知识产权法庭公布的条例](https://ipc.court.gov.cn/zh-cn/news/view-407.html)、[WIPO 版权说明](https://www.wipo.int/en/web/copyright/faq-copyright)。

产品使用 Code Arcade 名称，并注明是第三方兼容插件，没有放入第三方 Logo。这不等于已完成名称的商标检索，也不等于获得官方背书。DeepSeek Harness 的现行条款另对品牌使用设有限制；保持兼容说明和来源署名的必要范围，不应宣传为官方插件。[Harness 服务条款 I.4](https://www.deepseek.com/en/harness/terms-of-use/)。

用户指定的失败/退出嘲讽文本继续保留。Harness 官方模型服务条款 II.2 涉及粗俗、辱骂等内容限制，这属于服务条款适用风险，不能和知识产权侵权混为一谈。它们虽由本地插件插入，也不能据此保证平台一定允许；本次没有向平台请求确认。[Harness 服务条款 II.2](https://www.deepseek.com/en/harness/terms-of-use/)。

公开发布或收费前，需要针对实际分发内容及用途处理下文所列的来源许可；若将教材表达系统性复制、翻译、改编或纳入生成式产品，应取得相应许可或采用明确允许该用途的资料。当前工程检查不足以出具“绝无侵权”或“无条件可商用”的结论。

---


## 题库来源及许可复核

本轮来源复核包含参与题库编写的人员，不是独立第三方鉴定。前一轮46条知识依据见 `QUESTION-SOURCES.md`；本轮重点复查各站许可/说明和部分文章，并交叉核对84个模板的文档来源。没有把整库内容上传到查重服务。

| 来源 | 页面／模板数 | 核验结果 |
| --- | ---: | --- |
| OpenStax | 30／38 | 所查页面为 CC BY-NC-SA。复制/改编受保护表达须满足相关署名、非商业及共享条件；本包 MIT 不能代替这些条件。[章节示例](https://openstax.org/books/chemistry-2e/pages/13-2-equilibrium-constants)、[条款](https://openstax.org/tos)。 |
| MIT OCW | 3／7 | CC BY-NC-SA 4.0，并有署名、修改说明和品牌限制；不等于 MIT 软件许可证。本包未分发课程讲义/视频。[官方条款](https://ocw.mit.edu/pages/privacy-and-terms-of-use/)。 |
| Stanford Encyclopedia of Philosophy | 5／15 | 作者保留条目版权，电子再分发权限有限；允许阅读和链接不等于任意翻译转载。没有普遍的 MIT/CC 授权。[版权与使用说明](https://plato.stanford.edu/info.html)。 |
| 汉堡大学 LHN | 4／12 | 所查页面称 open access，并有版权标识；本次未找到明确开放改编授权。本包使用概念自拟题目，不转载文章及其中的小说引文。[编辑说明](https://www-archiv.fdm.uni-hamburg.de/lhn/node/11.html)、[Imprint](https://www-archiv.fdm.uni-hamburg.de/lhn/node/12.html)。 |
| Yale Avalon | 4／12 | 古老原始文件的主张与现代网页编排、注释、翻译须分开判断；本包问文献主张并附链接，没有打包网页或现代译文。[项目说明](https://avalon.law.yale.edu/about/purpose.asp)。 |

OpenStax 的 AI FAQ 允许符合具体书籍许可的非商业教育辅助，包括总结、改编和练习题，仍要求相应署名与改编同许可；FAQ 没有撤销书页 AI 通知，训练、生成式产品内容整合或大规模摄入另须联系许可。本次没有训练模型，运行时不取网页；这些事实不能单独决定开发阶段参考内容的条款适用性。[官方 AI FAQ](https://help.openstax.org/s/article/Using-OpenStax-Content-with-AI-Tools)。

MIT OCW 另有非商业、署名和共享条件下的 AI 训练条款，不能解读成无条件商用。许可是否约束某道新题取决于有没有复用受保护表达：同一公式不自动产生衍生作品，换词也不自动排除改编。[MIT OCW 条款](https://ocw.mit.edu/pages/privacy-and-terms-of-use/)、[CC BY-NC-SA 4.0 正文](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en)。

本轮未取得任何新的第三方书面许可，未发现足以证明必须删除题目的复制证据，也没有据此把外部资料改称 MIT。今后若复制/翻译/改编教材表达，须按其许可补齐作者或机构、书名、来源、许可链接、修改说明及其他要求。单纯删掉来源链接不会改变复用性质。

## 八条题干短句检索

2026-10-11 对下表短句分别加英文双引号进行公开网页搜索；数值题使用固定参数样例。所有查询在工具返回的可见结果中未发现完整逐字匹配，部分返回宽泛相关结果。未逐页抓取全部候选结果，未检索登录/付费题库，未做跨语言语义查重，不能称“全网零重复”。

| 模板 | 实际检索短句 |
| --- | --- |
| `pol-costs` | 逐一听取所有成员并协商 |
| `his-source-inference` | 被辩护的制度此后必然始终保护所有少数群体 |
| `chem-weak-exact` | 但不可假定解离量远小于初浓度 |
| `phy-doppler` | 观察者同时以20 m/s朝声源运动，未相遇 |
| `math-conditional-binomial` | 独立进行5次试验，每次成功概率0.4 |
| `lit-unreliable-evidence` | 读者因不喜欢某叙述者的政治态度便判定其对天气的报告为假 |
| `lit-free-indirect` | 阿宁把信塞回口袋。明天又得解释，真是倒霉 |
| `phi-merely-means` | 雇主与工人自愿、知情且可拒绝地达成互利合同 |

## 题目内容抽查及修正

36个理科模板的18,000组独立验算及题库接口回归通过，详见 `VALIDATION.md`。测试检查答案、唯一选项与实现，不能替代版权判断或全部人文题的专家审定。

本轮人工抽查了1789宣言的处罚、宪法和财产条款，Federalist No.10 的派系论证，LHN 的聚焦与不可靠叙述框架，以及 SEP 的知识和康德条目。没有发现已证实的答案错误。[宣言](https://avalon.law.yale.edu/18th_century/rightsof.asp)、[Federalist No.10](https://avalon.law.yale.edu/18th_century/fed10.asp)、[LHN Unreliability](https://www-archiv.fdm.uni-hamburg.de/lhn/node/66.html)。

修正文档中 `his-source-inference` 的错误归属，并把康德题的“想通过考试”改为“已决定以通过考试为目标”，避免被动愿望与意欲目标的歧义。Gettier、停钟和孔多塞循环等都是已有经典知识，当前表述明确不宣称本项目首创这些思想。[SEP 知识分析](https://plato.stanford.edu/entries/knowledge-analysis/)、[SEP 康德](https://plato.stanford.edu/entries/kant-moral/)。

## 发布名称与同类插件检索

2026-10-11，在本仓库改名前检索 GitHub 公开仓库名称 `dsh-rhythm-plugin`、中文名称“dsh的音律插件”以及包标识 `dsh-code-arcade`，未返回同名仓库；npm 官方注册表查询两个英文名称均返回 404。因此保留仓库名 `dsh-rhythm-plugin`，README 标题使用“dsh的音律插件”。这是当时公开索引的检索结果，不是商标检索、独占名称保证或对私有项目的检查。

已经存在同类娱乐插件，不能宣称本项目是首个音游插件：

| 公开项目 | 从项目 README 核对到的功能 | 与本项目的区别 |
| --- | --- | --- |
| [dsh-bgm](https://github.com/skymecode/dsh-bgm) | 标题为“DSH 音乐律动插件”，采集系统音乐，并在活动行显示音符、判定、Combo 与 Score。 | README 未描述按游戏结果阻断代码生成；与本项目中文名称语义接近，但仓库名不同。 |
| [dynamic-schulte-dsh](https://github.com/marvin9551/dynamic-schulte-dsh) | 等待模型时玩舒尔特表。 | 属于等待期间的小游戏。 |
| [dsh-whale-arcade](https://github.com/jitengfei/dsh-whale-arcade) | 等待模型时提供小游戏，保持代理工作。 | 未描述本项目的挑战失败门控规则。 |
| [dsh-learn-everything](https://github.com/cendaifeng/dsh-learn-everything) | 费曼教学和答题，说明判定为提示词软约束。 | 本项目通过中间件判定并控制当前步骤的输出与工具放行。 |

本次未查到完整相同的“根据代码复杂度提供音游或七科答题，失败则阻断代码生成”功能组合。功能相近不能单独证明代码抄袭；这一轮只核对公开项目说明，未进行他人源码的逐行比较，未采用这些项目的实现。检索入口：[GitHub 仓库查询](https://api.github.com/search/repositories?q=dsh-rhythm-plugin%20in%3Aname)、[npm 注册表](https://registry.npmjs.org/dsh-rhythm-plugin)。本仓库改名后，查询结果可能包含本仓库自身。

