# 题库来源与编写方式

检索与逐页核验日期：**2026-10-11**。本版有 **84 个重新编写题干、选项和解释的题目模板，七科各 12 个，引用 46 个来源页面**。其中数学、物理、化学共 36 个模板带参数变体；人文四科共 48 个模板采用自拟情境、比较或文献解释题。每次取同科三个不同模板，并打乱四个选项。Gettier、停钟、孔多塞循环等经典论证和知识原理来自既有研究，不是本项目首创；“原创”仅指本包实现与重新编写的表达，不是对这些思想的所有权声明。

这是基于网上检索后核验的本地题库。运行时不调用搜索引擎、付费 API 或大模型生成问题，不会把缓存题冒充实时搜索结果。网络页面用于核对概念、公开的历史文献事实与科学规律；题干、计算参数、干扰项和中文解释由本项目重新编写，没有复制教科书习题、第三方题库、网页长段文字或 GitHub 实现。

每题回传 `sources: [{ title, url, checked }]`，页面核验日期可追溯。链接内容及其商标仍归各权利人；本项目代码的 MIT 许可证不重新许可这些外部页面，也不表示相关机构认可本插件。不同网站的内容使用条款应分别查阅。

v1.0.0 来源复核：各站的非商业、署名、改编、AI 使用与电子再分发条件，以及公开短句查重的范围见 [AUDIT.md](AUDIT.md)、[NOTICE.txt](NOTICE.txt)。有来源链接不等于已取得复制、翻译或改编受保护表达的许可。

## 难度与复用

`generateResearchQuiz(subject, metrics, seed)` 优先读 `metrics.difficulty`（0～1），将其连续映射到 0.58～0.98 的目标题目难度，结合固定种子的有界扰动按距离选三个模板。它不再先切成五档；同种子下提高输入难度不会降低选中题目的平均标注难度。模板总数有限，因此实际换题仍有边界，不能保证输入每增加 0.001 都换题。难度标签是本项目的编写尺度，不是经受试者校准的测量结果。

兼容输入对象的 `complexity`：`1-exp(-max(0, complexity)/145)`；仅当没有有效 `difficulty` 时使用。旧 `level` 1～5 映射到 0～1。直接传整数 1～5 同样按旧档位解释；要表达最高连续难度应传 `{ difficulty: 1 }`。数值题选项保留至小数点后四位并去掉尾零，题目声明“选最接近值”，题干明确单位、近似和模型条件。

下面每行对应一个实际核验过的来源。模板 ID 可在 `src/question-bank.mjs` 中定位。大学课程索引页用于定位其对应概念材料；文献题只问列明文本中的主张，不将历史文献主张直接当成当代政策结论。

## 政治：12 个模板，7 个来源

| 核验来源 | 原创适配内容／模板 |
| --- | --- |
| [Stanford Encyclopedia of Philosophy：Social Choice Theory](https://plato.stanford.edu/entries/social-choice/) | 原创偏好矩阵、循环多数、议程次序与赞成票计数：`pol-cycle`、`pol-agenda`、`pol-approval`。 |
| [OpenStax：Collective Action Problems](https://openstax.org/books/introduction-political-science/pages/6-4-collective-action-problems-the-problem-of-incentives) | 自拟污染治理收益博弈、灌溉共有资源与选择性激励情境：`pol-incentives`、`pol-commons`、`pol-selective`。 |
| [OpenStax：Collective Dilemmas](https://openstax.org/books/introduction-political-science/pages/6-3-collective-dilemmas-making-group-decisions) | 自拟表决整数门槛、交易成本与顺从成本比较：`pol-threshold`、`pol-costs`。 |
| [OpenStax：How Do People Participate in Elections?](https://openstax.org/books/introduction-political-science/pages/8-6-how-do-people-participate-in-elections) | 自拟三选区票数，区分得票率与席位率：`pol-seats`。 |
| [OpenStax：Parliamentary and Presidential Systems](https://openstax.org/books/introduction-political-science/pages/9-2-what-is-the-difference-between-parliamentary-and-presidential-systems) | 信任案、任期与特别问责程序辨析：`pol-confidence`。 |
| [OpenStax：Categorizing Contemporary Regimes](https://openstax.org/books/introduction-political-science/pages/13-2-categorizing-contemporary-regimes) | 自拟地方权限的宪法保障与可撤回授权对照：`pol-federal`。 |
| [OpenStax：Experimental Design and Ethics](https://openstax.org/books/introductory-statistics-2e/pages/1-4-experimental-design-and-ethics) | 就业培训自愿参与情境，区分精度与因果识别：`pol-causal`。 |

## 历史：12 个模板，4 个原始文献来源

| 核验来源 | 原创适配内容／模板 |
| --- | --- |
| [Yale Avalon：Declaration of the Rights of Man, 1789](https://avalon.law.yale.edu/18th_century/rightsof.asp) | 财产权征用条件、宪法判断、处罚限制：`his-rights-property`、`his-rights-constitution`、`his-rights-punishment`。 |
| [Yale Avalon：English Bill of Rights, 1689](https://avalon.law.yale.edu/17th_century/england.asp) | 停止法律效力的权限、议会同意及议会言论保护的适用范围：`his-bill-suspension`、`his-bill-limits`、`his-bill-parliament`。 |
| [Yale Avalon：Articles of Confederation, 1781](https://avalon.law.yale.edu/18th_century/artconf.asp) | 州投票权、财政分摊与征收、修改文件的同意条件：`his-conf-votes`、`his-conf-tax`、`his-conf-amend`。 |
| [Yale Avalon：Federalist No. 10](https://avalon.law.yale.edu/18th_century/fed10.asp) | 区分派系原因与效果、扩大共和国的论证机制及文本证据的推论边界：`his-faction-liberty`、`his-faction-scale`、`his-source-inference`。 |

## 化学：12 个参数模板，8 个来源

| 核验来源 | 原创适配内容／模板 |
| --- | --- |
| [OpenStax Chemistry 2e：Equilibrium Constants](https://openstax.org/books/chemistry-2e/pages/13-2-equilibrium-constants) | 改变浓度参数、逆反应与化学计量缩放、定温压缩后的瞬时反应商：`chem-kc`、`chem-transform-k`、`chem-compression`。 |
| [OpenStax Chemistry 2e：Buffers](https://openstax.org/books/chemistry-2e/pages/14-6-buffers) | 缓冲比例与先中和再求比值的多步计算：`chem-buffer-ratio`、`chem-buffer-titration`。 |
| [OpenStax Chemistry 2e：Relative Strengths of Acids and Bases](https://openstax.org/books/chemistry-2e/pages/14-3-relative-strengths-of-acids-and-bases) | 给定明确忽略条件，使用二次方程而非小解离近似：`chem-weak-exact`。 |
| [OpenStax Chemistry 2e：Rate Laws](https://openstax.org/books/chemistry-2e/pages/12-3-rate-laws) | 明确幂律速率模型后以初速比推级数并外推：`chem-rate-orders`。 |
| [OpenStax Chemistry 2e：Integrated Rate Laws](https://openstax.org/books/chemistry-2e/pages/12-4-integrated-rate-laws) | 一阶反应多半衰期的剩余比例：`chem-half-life`。 |
| [OpenStax Chemistry 2e：Free Energy](https://openstax.org/books/chemistry-2e/pages/16-4-free-energy) | 焓熵单位换算及标准吉布斯自由能和平衡常数：`chem-gibbs`、`chem-equilibrium-g`。 |
| [OpenStax Chemistry 2e：Potential, Free Energy, and Equilibrium](https://openstax.org/books/chemistry-2e/pages/17-4-potential-free-energy-and-equilibrium) | 非标准条件下的能斯特方程、电子数与反应商对数：`chem-nernst`。 |
| [OpenStax Chemistry 2e：Electrolysis](https://openstax.org/books/chemistry-2e/pages/17-7-electrolysis) | 电流、时间、电子转移数到沉积质量的多步换算：`chem-electrolysis`。 |

## 物理：12 个参数模板，12 个来源

| 核验来源 | 原创适配内容／模板 |
| --- | --- |
| [OpenStax University Physics 1：Types of Collisions](https://openstax.org/books/university-physics-volume-1/pages/9-4-types-of-collisions) | 两物体反向运动后完全非弹性碰撞的动能损失：`phy-inelastic`。 |
| [OpenStax University Physics 1：Work-Energy Theorem](https://openstax.org/books/university-physics-volume-1/pages/7-3-work-energy-theorem) | 斜面重力做功与摩擦做功合并：`phy-incline`。 |
| [OpenStax University Physics 1：Simple Harmonic Motion](https://openstax.org/books/university-physics-volume-1/pages/15-1-simple-harmonic-motion) | 弹簧振子在非平衡位置的速率：`phy-shm`。 |
| [OpenStax University Physics 1：Standing Waves and Resonance](https://openstax.org/books/university-physics-volume-1/pages/16-6-standing-waves-and-resonance) | 张力、线密度、弦长与高次谐波：`phy-standing`。 |
| [OpenStax University Physics 1：The Doppler Effect](https://openstax.org/books/university-physics-volume-1/pages/17-7-the-doppler-effect) | 声源与观察者相向运动，明确相对介质的速率：`phy-doppler`。 |
| [OpenStax University Physics 3：Mathematics of Interference](https://openstax.org/books/university-physics-volume-3/pages/3-2-mathematics-of-interference) | 整体浸入介质后双缝条纹间距及单位转换：`phy-interference`。 |
| [OpenStax University Physics 2：The Carnot Cycle](https://openstax.org/books/university-physics-volume-2/pages/4-5-the-carnot-cycle) | 用绝对温度与吸热量求理想热机做功：`phy-carnot`。 |
| [OpenStax University Physics 2：Entropy](https://openstax.org/books/university-physics-volume-2/pages/4-6-entropy) | 用可逆路径计算理想气体自由膨胀的熵变：`phy-entropy`。 |
| [OpenStax University Physics 2：First Law of Thermodynamics](https://openstax.org/books/university-physics-volume-2/pages/3-3-first-law-of-thermodynamics) | 明确功与热符号，利用循环内能改变量为零反求热量：`phy-cycle`。 |
| [OpenStax University Physics 2：Resistors in Series and Parallel](https://openstax.org/books/university-physics-volume-2/pages/10-2-resistors-in-series-and-parallel) | 先串并联等效、再分流求支路电流：`phy-network`。 |
| [OpenStax University Physics 2：Capacitor with a Dielectric](https://openstax.org/books/university-physics-volume-2/pages/8-4-capacitor-with-a-dielectric) | 断开电源后插入电介质，区分定电荷与定电压：`phy-dielectric`。 |
| [OpenStax University Physics 2：RL Circuits](https://openstax.org/books/university-physics-volume-2/pages/14-4-rl-circuits) | 根据时间常数判断接通直流后的瞬态电流：`phy-rl`。 |

## 数学：12 个参数模板，7 个来源

| 核验来源 | 原创适配内容／模板 |
| --- | --- |
| [MIT OCW 18.05：Probability and Statistics Readings](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/classes-reading-and-in-class-materials/) | 原创基率条件概率、不放回抽样、离散最大值期望与截断二项条件期望：`math-bayes`、`math-hypergeom`、`math-max-expectation`、`math-conditional-binomial`。 |
| [MIT OCW 18.06SC：Eigenvalues and Eigenvectors](https://www.ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/pages/least-squares-determinants-and-eigenvalues/eigenvalues-and-eigenvectors/) | 特殊对称矩阵幂的迹与秩一更新行列式：`math-matrix-power`、`math-rank-one-det`。 |
| [MIT OCW 18.06SC：Projections onto Subspaces](https://www.ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/pages/least-squares-determinants-and-eigenvalues/projections-onto-subspaces/) | 非单位基向量上的投影长度平方：`math-projection`。 |
| [OpenStax Calculus 2：Integration by Parts](https://openstax.org/books/calculus-volume-2/pages/3-1-integration-by-parts) | 自拟多项式定积分与指数衰减反常积分参数：`math-polynomial-integral`、`math-improper-integral`。 |
| [OpenStax Calculus 2：Infinite Series](https://openstax.org/books/calculus-volume-2/pages/5-2-infinite-series) | 对收敛几何级数加权求和：`math-weighted-series`。 |
| [OpenStax Calculus 2：First-Order Linear Equations](https://openstax.org/books/calculus-volume-2/pages/4-5-first-order-linear-equations) | 带初值的一阶常系数方程，在特定时间计算瞬态解：`math-linear-ode`。 |
| [OpenStax Calculus 1：Applied Optimization Problems](https://openstax.org/books/calculus-volume-1/pages/4-7-applied-optimization-problems) | 非负约束下的单变量化、临界点和边界比较：`math-constrained-max`。 |

## 文学：12 个模板，4 个来源

使用汉堡大学保存的 *The Living Handbook of Narratology* 原机构存档。引用存档页是为了可核验的完整文章，不使用无法访问的新站路径。

| 核验来源 | 原创适配内容／模板 |
| --- | --- |
| [Burkhard Niederhoff：Focalization](https://www-archiv.fdm.uni-hamburg.de/lhn/node/18.html) | 原创段落情境，区分声音、人称、外聚焦与跨章变换内聚焦：`lit-voice-focal`、`lit-external`、`lit-variable`。 |
| [Scheffel, Weixler, Werner：Time](https://www-archiv.fdm.uni-hamburg.de/lhn/node/106.html) | 顺序、时距、事件发生次数与叙述次数的交叉辨析：`lit-order`、`lit-duration`、`lit-frequency`。 |
| [Dan Shen：Unreliability](https://www-archiv.fdm.uni-hamburg.de/lhn/node/66.html) | 区分事实报告、伦理评价与读者价值分歧；要求文本证据：`lit-unreliable-fact`、`lit-unreliable-values`、`lit-unreliable-evidence`。 |
| [Brian McHale：Speech Representation](https://www-archiv.fdm.uni-hamburg.de/lhn/node/47.html) | 自写人物思想片段，分析自由间接呈现、直接引语与忠实性、声音归属歧义：`lit-free-indirect`、`lit-direct-not-faithful`、`lit-ambiguous-voice`。 |

## 哲学：12 个模板，4 个来源

| 核验来源 | 原创适配内容／模板 |
| --- | --- |
| [Stanford Encyclopedia of Philosophy：The Analysis of Knowledge](https://plato.stanford.edu/entries/knowledge-analysis/) | 改写认识偶然性情境，比较真信念、证成、可靠过程与知识：`phi-gettier`、`phi-clock`、`phi-reliability`。 |
| [Stanford Encyclopedia of Philosophy：The Problem of Induction](https://plato.stanford.edu/entries/induction-problem/) | 过去成功论证的循环、非演绎支持与齐一性前提的正当化：`phi-induction-circle`、`phi-induction-deduction`、`phi-uniformity`。 |
| [Stanford Encyclopedia of Philosophy：Consequentialism](https://plato.stanford.edu/entries/consequentialism/) | 区分行动与规则的评价对象、价值多元、实际与预期后果：`phi-act-rule`、`phi-consequences-value`、`phi-expected-actual`。 |
| [Stanford Encyclopedia of Philosophy：Kant’s Moral Philosophy](https://plato.stanford.edu/entries/kant-moral/) | 假言命令、虚假承诺普遍化与知情自愿合作/欺骗的条件辨析：`phi-hypothetical`、`phi-false-promise`、`phi-merely-means`。 |

## 可重复核验

`node --test tests/question-bank.test.mjs tests/question-bank-independent.test.mjs`

接口测试核对 84/46 计数、来源、三题不重复、选项洗牌、连续输入优先级及全部理科模板的参数变化。独立答案测试对 36 个理科模板各取 500 个种子，共 **18,000 组**，用不同求解路径检查答案与四个选项的唯一最近值：概率逐结果枚举、矩阵逐次相乘和行列式展开、数值积分与常微分方程数值解等；另对七科、60 个种子、101 个连续难度点验证同种子平均选题难度不降。人文题的解释明确采用的概念框架与原文范围，避免将存在争议的普遍结论当作唯一答案。
