/** Original, source-checked challenge questions. No copied textbook exercises. */
const checked = '2026-10-11';
const source = (title, url) => Object.freeze({ title, url, checked });
const os = (book, page, title) => source(`OpenStax · ${title}`, `https://openstax.org/books/${book}/pages/${page}`);
const sep = (page, title) => source(`Stanford Encyclopedia of Philosophy · ${title}`, `https://plato.stanford.edu/entries/${page}/`);
const lhn = (node, title) => source(`University of Hamburg · ${title}`, `https://www-archiv.fdm.uni-hamburg.de/lhn/node/${node}.html`);
export const QUESTION_SOURCES = Object.freeze({
  social: sep('social-choice', 'Social Choice Theory'),
  collective: os('introduction-political-science', '6-4-collective-action-problems-the-problem-of-incentives', 'Collective Action Problems'),
  rules: os('introduction-political-science', '6-3-collective-dilemmas-making-group-decisions', 'Collective Dilemmas'),
  elections: os('introduction-political-science', '8-6-how-do-people-participate-in-elections', 'Electoral Districts and Representation'),
  executive: os('introduction-political-science', '9-2-what-is-the-difference-between-parliamentary-and-presidential-systems', 'Parliamentary and Presidential Systems'),
  federal: os('introduction-political-science', '13-2-categorizing-contemporary-regimes', 'Categorizing Contemporary Regimes'),
  experiment: os('introductory-statistics-2e', '1-4-experimental-design-and-ethics', 'Experimental Design and Ethics'),
  rights: source('Yale Avalon · Declaration of the Rights of Man, 1789', 'https://avalon.law.yale.edu/18th_century/rightsof.asp'),
  bill: source('Yale Avalon · English Bill of Rights, 1689', 'https://avalon.law.yale.edu/17th_century/england.asp'),
  confederation: source('Yale Avalon · Articles of Confederation, 1781', 'https://avalon.law.yale.edu/18th_century/artconf.asp'),
  faction: source('Yale Avalon · Federalist No. 10', 'https://avalon.law.yale.edu/18th_century/fed10.asp'),
  equilibrium: os('chemistry-2e', '13-2-equilibrium-constants', 'Equilibrium Constants'),
  buffer: os('chemistry-2e', '14-6-buffers', 'Buffers'),
  weak: os('chemistry-2e', '14-3-relative-strengths-of-acids-and-bases', 'Relative Strengths of Acids and Bases'),
  rates: os('chemistry-2e', '12-3-rate-laws', 'Rate Laws'),
  integrated: os('chemistry-2e', '12-4-integrated-rate-laws', 'Integrated Rate Laws'),
  gibbs: os('chemistry-2e', '16-4-free-energy', 'Free Energy'),
  nernst: os('chemistry-2e', '17-4-potential-free-energy-and-equilibrium', 'Potential, Free Energy, and Equilibrium'),
  electrolysis: os('chemistry-2e', '17-7-electrolysis', 'Electrolysis'),
  collision: os('university-physics-volume-1', '9-4-types-of-collisions', 'Types of Collisions'),
  work: os('university-physics-volume-1', '7-3-work-energy-theorem', 'Work-Energy Theorem'),
  harmonic: os('university-physics-volume-1', '15-1-simple-harmonic-motion', 'Simple Harmonic Motion'),
  standing: os('university-physics-volume-1', '16-6-standing-waves-and-resonance', 'Standing Waves and Resonance'),
  doppler: os('university-physics-volume-1', '17-7-the-doppler-effect', 'The Doppler Effect'),
  interference: os('university-physics-volume-3', '3-2-mathematics-of-interference', 'Mathematics of Interference'),
  carnot: os('university-physics-volume-2', '4-5-the-carnot-cycle', 'The Carnot Cycle'),
  entropy: os('university-physics-volume-2', '4-6-entropy', 'Entropy'),
  firstLaw: os('university-physics-volume-2', '3-3-first-law-of-thermodynamics', 'First Law of Thermodynamics'),
  resistors: os('university-physics-volume-2', '10-2-resistors-in-series-and-parallel', 'Resistors in Series and Parallel'),
  dielectric: os('university-physics-volume-2', '8-4-capacitor-with-a-dielectric', 'Capacitor with a Dielectric'),
  rl: os('university-physics-volume-2', '14-4-rl-circuits', 'RL Circuits'),
  probability: source('MIT OCW 18.05 · Probability and Statistics Readings', 'https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/classes-reading-and-in-class-materials/'),
  eigen: source('MIT OCW 18.06SC · Eigenvalues and Eigenvectors', 'https://www.ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/pages/least-squares-determinants-and-eigenvalues/eigenvalues-and-eigenvectors/'),
  projection: source('MIT OCW 18.06SC · Projections onto Subspaces', 'https://www.ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/pages/least-squares-determinants-and-eigenvalues/projections-onto-subspaces/'),
  integration: os('calculus-volume-2', '3-1-integration-by-parts', 'Integration by Parts'),
  series: os('calculus-volume-2', '5-2-infinite-series', 'Infinite Series'),
  ode: os('calculus-volume-2', '4-5-first-order-linear-equations', 'First-Order Linear Equations'),
  optimization: os('calculus-volume-1', '4-7-applied-optimization-problems', 'Applied Optimization Problems'),
  focalization: lhn(18, 'Focalization — Burkhard Niederhoff'),
  time: lhn(106, 'Time — Scheffel, Weixler, Werner'),
  reliability: lhn(66, 'Unreliability — Dan Shen'),
  speech: lhn(47, 'Speech Representation — Brian McHale'),
  knowledge: sep('knowledge-analysis', 'The Analysis of Knowledge'),
  induction: sep('induction-problem', 'The Problem of Induction'),
  consequences: sep('consequentialism', 'Consequentialism'),
  kant: sep('kant-moral', 'Kant’s Moral Philosophy'),
});

const clamp = value => Math.max(0, Math.min(1, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) { result ^= character.codePointAt(0); result = Math.imul(result, 16777619) >>> 0; }
  return result || 1;
}
function randomFrom(seed) { let state = hash(seed); return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296); }
const integer = (random, min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (random, values) => values[integer(random, 0, values.length - 1)];
export const formatAnswer = value => String(Number(Number(value).toFixed(4)));
const shuffle = (values, random) => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = integer(random, 0, i); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
export function researchDifficulty(input = {}) {
  if (input && typeof input === 'object') {
    if (Number.isFinite(input.difficulty)) return clamp(input.difficulty);
    if (Number.isFinite(input.complexity)) return clamp(1 - Math.exp(-Math.max(0, input.complexity) / 145));
    if (Number.isFinite(input.level)) return clamp((input.level - 1) / 4);
    return 0;
  }
  const value = finite(input, 1);
  // Integer numbers 1..5 retain the old level API. Use { difficulty: 1 } for the maximum.
  return clamp(Number.isInteger(value) && value >= 1 ? (value - 1) / 4 : value);
}
function numeric(prompt, answer, distractors, unit, explanation, parameters) {
  const correct = formatAnswer(answer);
  const alternatives = [...new Set(distractors.filter(Number.isFinite).map(formatAnswer))].filter(value => value !== correct);
  for (let step = 1; alternatives.length < 3; step++) {
    const alternative = formatAnswer(answer + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * Math.max(Math.abs(answer) * 0.15, 0.2));
    if (alternative !== correct && !alternatives.includes(alternative)) alternatives.push(alternative);
  }
  return { prompt: `${prompt}（${unit}；选最接近值）`, answer: correct, distractors: alternatives.slice(0, 3), explanation, parameters, numericAnswer: answer };
}
const entry = (id, difficulty, sourceKey, make) => Object.freeze({ id, difficulty, source: QUESTION_SOURCES[sourceKey], make });
const fixed = (id, difficulty, sourceKey, prompt, answer, distractors, explanation) => entry(id, difficulty, sourceKey, () => ({ prompt, answer, distractors, explanation }));
const choose = (n, k) => { let value = 1; for (let i = 1; i <= k; i++) value = value * (n - i + 1) / i; return value; };

const politics = [
  fixed('pol-cycle', .79, 'social', '某委员会三等规模群体的完整偏好依次为 A>B>C、B>C>A、C>A>B；逐对简单多数表决。哪项描述正确？', 'A胜B、B胜C、C胜A，没有孔多塞赢家', ['A胜过其余两项，是孔多塞赢家', '每一对表决都平票，因此无法形成多数', '所有个人偏好传递，集体多数关系也必然传递'], '分别合并支持每个两两比较的两组，均得三分之二。个人传递性不能推出集体多数关系传递。'),
  fixed('pol-agenda', .87, 'social', '三名委员偏好为 A>B>C、B>C>A、C>A>B。先表决 A 对 B，再让胜者对 C，不弃权且按真实偏好投票。哪项结果与议程分析正确？', 'C；更换议程顺序可能更换胜者', ['A；先以2:1胜B，随后仍以2:1胜C', 'B；先以2:1胜A，随后以2:1胜C', 'C；但两两多数规则使更换议程无法改变最终胜者'], 'A对B以2:1胜，随后C对A以2:1胜。循环多数使议程成为影响结果的因素。'),
  fixed('pol-approval', .72, 'social', '100人中40人 A>B>C，35人 B>C>A，25人 C>B>A。相对多数制只投第一偏好；另一规则规定每人给自己前两项各投一票。两规则赢家依次是谁？', 'A、B', ['B、A', 'A、C', 'B、B'], '第一偏好票为40、35、25；前两项赞成票为A40、B100、C60。评价规则改变，胜者也可改变。'),
  fixed('pol-incentives', .68, 'collective', '两地可各自出资治理污染；每个出资者付6，两地每因一地出资都各获4，收益可加。不出资无成本。自利且同时决策时，哪项是纳什均衡及效率关系？', '都不出资；但双方都出资会使双方更好', ['都出资；出资对每方都是占优策略', '一方出资一方不出资；有两个纯策略均衡', '都不出资；任何其他结果都不可能让双方更好'], '单方改变为出资只增加自己的收益4却增加成本6，因此不出资占优。都出资时每地净得8−6=2，高于零。'),
  fixed('pol-commons', .62, 'collective', '灌溉水源难以排除本地农户使用，但某户多取水会减少下游可用水。仅依排他性与竞争性，应怎样分类并判断主要风险？', '共有资源；个体取水激励可能造成过度消耗', ['纯公共物品；他人使用不会改变剩余水量', '俱乐部物品；排除使用者容易且没有竞争', '私人物品；只要难排除便不存在集体问题'], '难排他且有竞争是共有资源的特征。不能把难排他直接等同于非竞争。'),
  fixed('pol-selective', .76, 'collective', '某组织争取的政策利益无法排除非会员，会员费却由个人支付。哪项制度最直接改变搭便车的私人收益结构？', '提供只对缴费会员开放、且有价值的额外服务', ['把同一公共成果再宣传一次，且假定偏好完全不变', '保证不缴费者得到更多同样的会员专属服务', '取消所有会员专属服务但保持收费不变'], '可排除的附加服务把部分收益与实际贡献绑定；宣传若不改变信息或偏好，不会直接改变给定的收益结构。'),
  fixed('pol-federal', .74, 'federal', '甲国地方权限由宪法保障，中央普通法律不能单方面撤回；乙国同样有地方选举，但中央可依法随时收回全部授权。哪项区分最准确？', '甲更体现联邦分权；乙的地方选举本身不足以证明联邦制', ['两国有地方选举，所以必然都是联邦制', '甲地方权力受宪法保护，所以中央不存在任何权力', '乙有中央政府，所以必然没有地方自治'], '关键是不同层级的权力根据及保障，而不是地方机构是否存在或是否选举产生。'),
  fixed('pol-confidence', .81, 'executive', '一种制度中，内阁须持续获得议会信任；另一种中，总统任期固定，议会单纯政策不满不能以普通不信任案撤换总统。最直接的制度差异是什么？', '行政机构存续是否依赖议会的持续政治信任', ['行政首脑是否兼具国家元首的礼仪代表功能', '行政首脑是否可由多个政党共同支持产生', '行政首脑是否可能受到弹劾等特别问责程序'], '议会制的信任关系与总统制的分立任期不同；固定任期并不排除弹劾等特别程序。'),
  fixed('pol-seats', .67, 'elections', '三个等人数、等投票率选区各选一席，均采用相对多数制。每区A党40%、B党35%、C党25%。A的全国得票率与席位率分别是多少？', '40%、100%', ['40%、40%', '100%、40%', '40%、0%，因为没有过半'], 'A在每区均为第一名，因此获得三席。相对多数不要求过半，选区席位率也不按总票比例自动分配。'),
  fixed('pol-threshold', .63, 'rules', '一个100席议会，普通法需超过半数全体席位，宪法修正需至少三分之二全体席位。66名议员支持且全部出席，两案会怎样？', '普通法通过，修正案未通过', ['两案都通过，因为66%就是三分之二', '两案都失败，因为普通法也需67票', '普通法失败，修正案通过'], '超过半数最低51票；三分之二的100席为66又2/3，整数票数最低67。不能把四舍五入的百分比当法定门槛。'),
  fixed('pol-costs', .84, 'rules', '委员会从“一人决定”改为“逐一听取所有成员并协商”，假设其他条件不变。最合理的成本判断是什么？', '决策的交易成本可能升高，偏好未被照顾造成的顺从成本可能降低', ['交易成本降低而顺从成本升高，因为更多参与本身减少协调步骤', '两成本都降低，因为表达偏好更完整就不再需要协调不同意见', '两成本都升高，因为发言次数本身就是偏好未被照顾的损失'], '交易成本包含达成决定所需时间和资源；顺从成本涉及被迫接受非首选结果的损失。这是条件化的机制判断，不是无条件定律。'),
  fixed('pol-causal', .96, 'experiment', '研究发现自愿参加就业培训者的收入高于未参加者，便断言培训造成全部差额。即使样本很大，哪项批评仍最关键？', '参与者可能原本动机或技能不同，样本量不能消除这种选择混杂', ['把两组人数加权到相同后，技能和动机的差异便不再影响收入比较', '参与者收入更高足以排除反向因果，剩余差额可直接归于培训', '改用两组培训后收入的中位数进行比较，就能避开参与选择问题'], '自愿参与不是随机分配；大样本提高精度，不自动建立可比的反事实组。'),
];

const history = [
  fixed('his-rights-property', .78, 'rights', '仅依据1789年《人权和公民权宣言》第17条，以下哪种财产剥夺方案最符合条文设定的条件？', '依法认定公共必要，并事先给予公平补偿', ['行政机关声称方便即可无补偿剥夺', '任何财产在任何情形下都绝对不能剥夺', '事后随意赠送象征性礼物即可替代事先补偿'], '条文把财产权保护与依法认定公共必要、事先公平补偿并列。它既不是任意征收授权，也不是绝对禁止征收。'),
  fixed('his-rights-constitution', .88, 'rights', '1789年宣言第16条将权利保障和权力分立作为判断条件。哪项推论严格限于其文本立场？', '仅有一本名为宪法的文件，仍不足以满足该条的实质标准', ['文件规定立法程序便足够，因为权利保障只属于普通法律问题', '只要不同机关名称分开，便已同时证明权力分立与权利保障', '条文提出这两项标准，因而也已证明当时制度实际达到了标准'], '规范性标准与制度名称、实际执行效果不同；条文同时要求保障权利与确定权力分立。'),
  fixed('his-rights-punishment', .73, 'rights', '按1789年宣言第8、9条，某人被指控后，政府拟用事后新设的罪名处罚，并把起诉本身当作有罪证明。最直接的问题是什么？', '同时触及处罚依据须先已存在与有罪确定前推定无罪两项原则', ['只要正式起诉，宣言就认可立即推定有罪', '第8条仅保护财产，第9条仅规定税收', '只要处罚较轻，就不存在任何文本上的问题'], '第8条限制溯及处罚，第9条要求有罪确定之前按无罪看待；指控与定罪是不同阶段。'),
  fixed('his-bill-suspension', .69, 'bill', '1689年英国《权利法案》反对王权未经议会同意暂停法律。哪项解释最贴近该条文的制度含义？', '王权执行法律的权限受议会同意条件约束', ['王权可凭紧急声明无限暂停任何法律', '议会从此不得制定或变更法律', '条文已经建立所有成年居民的普选权'], '条文针对未经议会同意的王权停法行为；不能从这一限制直接推出现代普选制度。'),
  fixed('his-bill-limits', .83, 'bill', '史家把1689年英国《权利法案》中关于新教臣民依法持有防卫武器的条款概括成“对所有居民无条件保证相同权利”。最有力的文本批评是什么？', '省略了宗教身份、适合其身份及法律许可等限制条件', ['法案完全没有任何与武器有关的条款', '一切带有权利字样的条款都必然适用于全球人口', '只要是历史文件，就不能分析适用范围'], '解释历史权利文本应保留限定语，不能用后来的普遍平等观念替换当时明确的适用范围。'),
  fixed('his-bill-parliament', .77, 'bill', '英国1689年法案同时限制未经议会授权征税与和平时期维持常备军。由此能直接支持哪种比较判断？', '财政与军事动员都成为约束王权的重要制度领域', ['法案彻底禁止国家征税和建立任何军队', '王权只在宗教问题上受到约束', '条文证明此后英国所有政府从未违背法案'], '关键限制是授权程序，而非彻底取消税收或军队；法律宣示也不能单独证明后续完全遵守。'),
  fixed('his-conf-votes', .72, 'confederation', '《邦联条例》第5条规定各州在合众国国会表决中各有一票。若人口差异很大的两州各派不同数量代表，下列哪项仍成立？', '两州作为表决单位的票数相同，代表人数不直接增加州票', ['人口较大州自动有两票', '代表多的州按代表人数获得更多州票', '每个州只能派一名代表，人数差异不可能出现'], '应区分代表团人数与州作为单位的表决权；条文规定每州一票。'),
  fixed('his-conf-tax', .86, 'confederation', '《邦联条例》第8条把共同开支分担与州立法机关征收税款联系起来。与中央直接向个人征税的模式相比，其关键组织特点是什么？', '共同财政的筹集依赖各州制度渠道', ['国会直接核定每个居民的个人税额，各州仅代为转交税单', '共同开支只接受自愿捐赠，条文不设各州应承担的分摊义务', '州只是国会划定的税务分区，州立法机关不承担征收职责'], '条例的财政安排通过州实施筹集；这与中央直接面向个人课税是不同的制度链条。'),
  fixed('his-conf-amend', .91, 'confederation', '《邦联条例》第13条规定修改须经国会同意并获每州立法机关确认。若十二州同意、一州拒绝，按该条明文应如何判断？', '修改尚未满足全体州确认的条件', ['修改已成就，因为第9条部分重大事项的九州门槛也适用于修约', '修改已成就，因为国会同意可以替代未获一致的州级确认', '修改只在同意的十二州生效，拒绝州继续单独适用未修改条文'], '普通或特定事项的表决门槛不能代替明确的修约程序；全体确认意味着一州拒绝仍阻止条件成就。'),
  fixed('his-faction-liberty', .76, 'faction', '在《联邦党人文集》第10篇的论证中，消除派系原因可涉及消除自由或使人完全同质。作者为什么转而主张控制派系的效果？', '前一种代价不可取，后一种不现实，故应寻求制度性控制效果', ['作者认定所有意见差异均能靠一道命令永久消除', '作者认为自由是任何政治制度都应首先取消的障碍', '作者只讨论对外战争，完全没有涉及国内派系'], '该论证先区分原因与效果，再说明移除原因的方案有根本困难；制度设计由此转向限制不利效果。'),
  fixed('his-faction-scale', .84, 'faction', '《联邦党人文集》第10篇支持扩大共和国，相关机制不是“人口越多一切越好”。哪项最贴近其派系论证？', '利益种类增加，压迫性多数更难形成并协调一致行动', ['地域扩大在逻辑上保证所有代表都无私', '只要人口增加，任何利益冲突都会消失', '扩大共和国意味着取消一切代议机构'], '作者把利益多样性与协调难度联系起来；这是一套防范多数派系的机制论证，不是对所有结果的保证。'),
  fixed('his-source-inference', .98, 'faction', '研究者仅引《联邦党人文集》第10篇的制度辩护，就声称“被辩护的制度此后必然始终保护所有少数群体”。最严谨的史料判断是什么？', '论辩文本可证明作者的主张与理由，但不足以单独证明后来全部实践结果', ['作者提出了有逻辑结构的机制，因此这份史料本身已完成长期效果的验证', '文件主要用于争取批准，因此既不能说明作者观点，也不能作为思想史材料', '文件形成于制度确立前，故其作者预期应优先于后来相反的实践证据'], '史料用途应区分倡议、意图与实施后效果。要论证长期实践，仍需独立的法律、制度和社会历史证据。'),
];

const chemistry = [
  entry('chem-kc', .61, 'equilibrium', random => {
    const h=integer(random,2,5), i=integer(random,2,6), hi=integer(random,5,10), answer=hi*hi/(h*i);
    return numeric(`恒温理想溶液中 H₂+I₂⇌2HI 已平衡，三者平衡浓度分别为 ${h}、${i}、${hi} mol/L。按浓度标准态为1 mol/L的数值求 Kc`, answer, [hi/(h*i),h*i/(hi*hi),hi*hi/(h+i)], '无量纲', `Kc=a(HI)²/[a(H₂)a(I₂)]=${hi}²/(${h}×${i})=${formatAnswer(answer)}；系数成为指数。`, {h,i,hi});
  }),
  entry('chem-transform-k', .74, 'equilibrium', random => {
    const root=integer(random,2,7), k=root*root, answer=1/root;
    return numeric(`同温下 2A⇌B 的平衡常数为 ${k}。把反应改写成 (1/2)B⇌A，其平衡常数是多少？`,answer,[root,1/k,k], '无量纲', `逆反应取倒数，再把系数除以2则常数开平方，故 K'=K^(−1/2)=1/${root}。`,{root,k});
  }),
  entry('chem-compression', .82, 'equilibrium', random => {
    const factor=integer(random,2,8);
    return numeric(`理想气体 N₂O₄⇌2NO₂ 原已平衡。恒温下体积瞬间缩为原来的1/${factor}，在组成来不及改变时 Qc/Kc 为多少？`,factor,[factor*factor,1/factor,1], '倍', `每种浓度乘${factor}，Qc分子乘${factor}²、分母乘${factor}，因此Qc/Kc=${factor}；恒温Kc不变，随后向左移动。`,{factor});
  }),
  entry('chem-buffer-ratio', .64, 'buffer', random => {
    const pKa=pick(random,[4.2,4.6,5.1]), ratio=pick(random,[2,3,5,8]), answer=pKa+Math.log10(ratio);
    return numeric(`在可用 Henderson–Hasselbalch 近似的 HA/A⁻ 缓冲液中，pKa=${pKa}，平衡浓度比[A⁻]/[HA]=${ratio}。忽略活度修正，pH约为多少？`,answer,[pKa-Math.log10(ratio),pKa+ratio,pKa], 'pH', `pH=pKa+log₁₀([A⁻]/[HA])=${pKa}+log₁₀${ratio}=${formatAnswer(answer)}。`,{pKa,ratio});
  }),
  entry('chem-buffer-titration', .89, 'buffer', random => {
    const acid=integer(random,5,9)*10, base=integer(random,11,15)*10, added=integer(random,2,4)*10, pKa=4.8, answer=pKa+Math.log10((base-added)/(acid+added));
    return numeric(`缓冲液原含 HA ${acid} mmol、A⁻ ${base} mmol；加入 ${added} mmol 强酸且无其他反应。pKa=4.8，体积变化可忽略，缓冲近似适用。反应后pH约为多少？`,answer,[pKa+Math.log10(base/acid),pKa+Math.log10((base+added)/(acid-added)),pKa-Math.log10((base-added)/(acid+added))], 'pH', `先计量反应 A⁻+H⁺→HA：A⁻剩${base-added}、HA增至${acid+added} mmol，再取二者比值代入缓冲公式。`,{acid,base,added,pKa});
  }),
  entry('chem-weak-exact', .96, 'weak', random => {
    const concentration=pick(random,[.08,.12,.16]), x=pick(random,[.01,.02,.03]), ka=x*x/(concentration-x), answer=-Math.log10(x);
    return numeric(`一元弱酸 HA 的分析浓度为 ${concentration} mol/L，Ka=${ka.toPrecision(8)}。假定仅此酸贡献H⁺、忽略水自解离与活度修正，但不可假定解离量远小于初浓度。pH约为多少？`,answer,[-Math.log10(Math.sqrt(ka*concentration)),-Math.log10(ka),-Math.log10(concentration)], 'pH', `设[H⁺]=x，则Ka=x²/(C−x)。取正根 x=(−Ka+√(Ka²+4KaC))/2≈${x} mol/L，故pH=${formatAnswer(answer)}。`,{concentration,ka,x});
  }),
  entry('chem-half-life', .66, 'integrated', random => {
    const half=integer(random,4,10), count=integer(random,3,6), answer=100/2**count;
    return numeric(`一阶分解反应半衰期 ${half} min。保持相同条件经过 ${half*count} min，反应物剩余百分比是多少？`,answer,[100/count,100*(1-1/2**count),100/2**(count-1)], '%', `一阶反应经历${count}个半衰期，比例为(1/2)^${count}，即${formatAnswer(answer)}%。`,{half,count});
  }),
  entry('chem-rate-orders', .86, 'rates', random => {
    const a=integer(random,2,4), b=integer(random,2,5), answer=a*a*b;
    return numeric(`已知考察浓度范围内v=k[A]^m[B]^n且同温k不变。初速实验：只把[A]加倍，速率为4倍；只把[B]加倍，速率为2倍。若[A]变为原来的${a}倍、[B]变为原来的${b}倍，速率应为原来的多少倍？`,answer,[a*b,a*b*b,a*a*b*b], '倍', `实验给出A二级、B一级，v=k[A]²[B]，浓度改变后的速率因子为${a}²×${b}=${answer}。`,{a,b});
  }),
  entry('chem-gibbs', .77, 'gibbs', random => {
    const enthalpy=integer(random,3,8)*10, entropy=integer(random,10,20)*10, temperature=integer(random,3,6)*100, answer=enthalpy-temperature*entropy/1000;
    return numeric(`某反应在所考察温区可把ΔH与ΔS视为常数：ΔH=${enthalpy} kJ/mol，ΔS=${entropy} J/(mol·K)。在${temperature} K求ΔG`,answer,[enthalpy-temperature*entropy,enthalpy+temperature*entropy/1000,enthalpy-temperature*entropy/100], 'kJ/mol', `先把熵变化为kJ/(mol·K)，再用ΔG=ΔH−TΔS=${enthalpy}−${temperature}×${entropy}/1000。`,{enthalpy,entropy,temperature});
  }),
  entry('chem-equilibrium-g', .91, 'gibbs', random => {
    const power=integer(random,2,6), temperature=integer(random,3,5)*100, delta=-power*8.314462618*temperature*Math.LN10/1000, answer=10**power;
    return numeric(`在${temperature} K，某反应ΔG°=${delta.toFixed(6)} kJ/mol。取R=8.314462618 J/(mol·K)，求热力学平衡常数K`,answer,[10**(-power),power,Math.exp(power)], '无量纲', `ΔG°=−RT lnK；需把kJ换为J。本题lnK≈${power}ln10，故K≈10^${power}。`,{power,temperature,delta});
  }),
  entry('chem-nernst', .94, 'nernst', random => {
    const standard=pick(random,[.8,1.1,1.3]), electrons=pick(random,[2,3]), power=integer(random,2,5), answer=standard-.05916/electrons*power;
    return numeric(`298 K下某电池E°=${standard} V，反应转移${electrons}个电子，Q=10^${power}。用 E=E°−(0.05916/n)log₁₀Q，求E`,answer,[standard+.05916/electrons*power,standard-.05916*electrons*power,standard-.05916/electrons/power], 'V', `将n=${electrons}和log₁₀Q=${power}代入；非标准电势不能简单等同于E°。`,{standard,electrons,power});
  }),
  entry('chem-electrolysis', .98, 'electrolysis', random => {
    const current=integer(random,2,5), time=integer(random,2,6)*965, molarMass=pick(random,[59,64,108]), electrons=pick(random,[2,3]), answer=current*time/96500/electrons*molarMass;
    return numeric(`以${current} A电流电解${time} s，Mⁿ⁺全部在阴极还原为金属，电流效率100%；n=${electrons}，金属摩尔质量${molarMass} g/mol，F=96500 C/mol。析出质量是多少？`,answer,[current*time/96500*molarMass,current*time/96500*electrons*molarMass,current*time/96500/electrons], 'g', `电量Q=It，电子物质的量Q/F，金属物质的量Q/(nF)，最后乘摩尔质量。`,{current,time,molarMass,electrons});
  }),
];

const physics = [
  entry('phy-inelastic', .68, 'collision', random => {
    const m1=integer(random,2,5), m2=integer(random,2,6), v1=integer(random,3,7), v2=-integer(random,1,4), answer=m1*m2/(2*(m1+m2))*(v1-v2)**2;
    return numeric(`无外冲量的一维碰撞中，两物体质量${m1}、${m2} kg，速度为+${v1}、${v2} m/s，碰后粘在一起。损失的动能是多少？`,answer,[.5*m1*v1*v1+.5*m2*v2*v2,answer/2,answer*2], 'J', `动量守恒给出共同速度；初末动能之差也可写为[ m₁m₂/(2(m₁+m₂)) ](v₁−v₂)²。负速度不能按同向相加处理。`,{m1,m2,v1,v2});
  }),
  entry('phy-incline', .62, 'work', random => {
    const distance=integer(random,3,8), friction=pick(random,[.1,.2,.3]), answer=2*10*distance*(.6-friction*.8);
    return numeric(`物块从静止沿直斜面滑下${distance} m，sinθ=0.6、cosθ=0.8，动摩擦因数${friction}，g=10 m/s²，无其他阻力。末速度的平方v²是多少？`,answer,[2*10*distance*.6,2*10*distance*(.6+friction*.8),10*distance*(.6-friction*.8)], 'm²/s²', `重力沿斜面做正功，摩擦功为−μmg cosθ·s；由动能定理v²=2gs(sinθ−μcosθ)。`,{distance,friction});
  }),
  entry('phy-shm', .76, 'harmonic', random => {
    const mass=pick(random,[1,2,4]), spring=integer(random,2,6)*100, amplitude=pick(random,[.1,.2,.3]), ratio=pick(random,[.25,.5,.75]), answer=Math.sqrt(spring/mass)*amplitude*Math.sqrt(1-ratio*ratio);
    return numeric(`水平无阻尼弹簧振子m=${mass} kg、k=${spring} N/m、振幅A=${amplitude} m。在位移x=${ratio}A处的速率是多少？`,answer,[Math.sqrt(spring/mass)*amplitude,Math.sqrt(spring/mass)*amplitude*ratio,Math.sqrt(spring/mass)*amplitude*(1-ratio)], 'm/s', `总能量kA²/2减去势能kx²/2即动能，v=√(k/m)√(A²−x²)。`,{mass,spring,amplitude,ratio});
  }),
  entry('phy-standing', .72, 'standing', random => {
    const length=pick(random,[.5,1,1.5]), density=.01, speed=integer(random,6,12)*10, tension=density*speed*speed, harmonic=integer(random,3,6), answer=harmonic*speed/(2*length);
    return numeric(`两端固定的弦长${length} m、线密度${density} kg/m、张力${tension} N。求第${harmonic}次谐波频率`,answer,[speed/(2*length),harmonic*speed/length,speed/(2*length*harmonic)], 'Hz', `先用波速v=√(T/μ)=${speed} m/s，再按两端固定条件λₙ=2L/n，得到fₙ=nv/(2L)。`,{length,density,speed,tension,harmonic});
  }),
  entry('phy-doppler', .88, 'doppler', random => {
    const emitted=integer(random,4,7)*100, observer=integer(random,1,3)*10, moving=integer(random,1,4)*10, sound=340, answer=emitted*(sound+observer)/(sound-moving);
    return numeric(`静止空气中声速340 m/s，声源频率${emitted} Hz，以${moving} m/s朝观察者运动；观察者同时以${observer} m/s朝声源运动，未相遇。观察者接收频率是多少？`,answer,[emitted*(sound-observer)/(sound+moving),emitted*(sound+moving)/(sound-observer),emitted*(sound+observer)/(sound+moving)], 'Hz', `两者相向时接收波面更快、波长缩短，f'=f(v+v观察)/(v−v源)。声源和观察者速度所处位置不同。`,{emitted,observer,moving,sound});
  }),
  entry('phy-interference', .86, 'interference', random => {
    const wavelength=pick(random,[450,500,600]), length=pick(random,[1,1.5,2]), gap=pick(random,[.2,.3,.5]), index=pick(random,[1.2,1.5,2]), answer=wavelength*1e-3*length/(gap*index);
    return numeric(`双缝间距${gap} mm，屏距${length} m；真空波长${wavelength} nm。整个装置浸入折射率${index}的均匀介质，取小角近似，相邻亮纹距离是多少？`,answer,[wavelength*1e-3*length/gap,wavelength*1e-3*length*index/gap,wavelength*1e-3*gap/(length*index)], 'mm', `介质中频率不变，波长为λ₀/n；条纹间距Δy=λ₀L/(nd)，注意nm、mm、m换算。`,{wavelength,length,gap,index});
  }),
  entry('phy-carnot', .67, 'carnot', random => {
    const hot=integer(random,5,8)*100, cold=integer(random,2,4)*100, heat=integer(random,6,12)*100, answer=heat*(1-cold/hot);
    return numeric(`可逆卡诺热机从${hot} K高温热源吸热${heat} J，向${cold} K低温热源放热。每循环最多输出多少功？`,answer,[heat*cold/hot,heat*(hot-cold)/cold,heat*(1-(cold-273.15)/(hot-273.15))], 'J', `η=1−Tc/Th必须使用绝对温度，W=ηQh。Qc与W不能混淆。`,{hot,cold,heat});
  }),
  entry('phy-entropy', .91, 'entropy', random => {
    const moles=integer(random,2,5), factor=integer(random,2,5), answer=moles*8.314*Math.log(factor);
    return numeric(`理想气体${moles} mol从体积V等温可逆膨胀至${factor}V，R=8.314 J/(mol·K)。气体熵变是多少？`,answer,[-answer,moles*8.314*factor,8.314*Math.log(factor)], 'J/K', `等温可逆过程δQ=nRT dV/V，积分δQ/T得到ΔS=nR ln(V₂/V₁)。是自然对数，且膨胀熵增。`,{moles,factor});
  }),
  entry('phy-cycle', .82, 'firstLaw', random => {
    const q1=integer(random,3,7)*100, w1=integer(random,1,2)*100, q2=-integer(random,1,2)*100, w2=integer(random,1,3)*50, w3=-integer(random,1,3)*100, answer=w1+w2+w3-q1-q2;
    return numeric(`封闭系统完成三段循环回到初态；Q表示系统吸热，W表示系统对外做功。第一段Q=${q1}、W=${w1} J，第二段Q=${q2}、W=${w2} J，第三段W=${w3} J。第三段Q是多少？`,answer,[q1+q2-w1-w2-w3,w3,w1+w2+w3], 'J', `完整循环ΔU总和为0，因此ΣQ=ΣW；Q₃=W₁+W₂+W₃−Q₁−Q₂。负值表示向外放热。`,{q1,w1,q2,w2,w3});
  }),
  entry('phy-network', .94, 'resistors', random => {
    const r1=integer(random,2,5), r2=integer(random,3,7), r3=integer(random,4,9), voltage=integer(random,12,24), parallel=r2*r3/(r2+r3), answer=voltage/(r1+parallel)*parallel/r2;
    return numeric(`理想电压源${voltage} V，电阻R₁=${r1} Ω串联(R₂=${r2} Ω与R₃=${r3} Ω并联)；求流过R₂的电流`,answer,[voltage/r2,voltage/(r1+r2),voltage/(r1+parallel)], 'A', `先算并联等效电阻Rp，再求总电流V/(R₁+Rp)，并联电压为I总Rp，最后除以R₂。`,{r1,r2,r3,voltage});
  }),
  entry('phy-dielectric', .79, 'dielectric', random => {
    const capacitance=integer(random,2,6), voltage=integer(random,10,30), dielectric=integer(random,2,5), original=.5*capacitance*voltage*voltage, answer=original/dielectric;
    return numeric(`电容${capacitance} μF的理想电容器先充到${voltage} V，再断开电源；随后用介电常数${dielectric}的介质完全填满板间，忽略漏电。最终电场储能是多少？`,answer,[original*dielectric,original,original/(dielectric*dielectric)], 'μJ', `断开电源使Q不变，C增为κC。由U=Q²/(2C)，储能降至原值的1/κ，不能按恒压情形处理。`,{capacitance,voltage,dielectric});
  }),
  entry('phy-rl', .98, 'rl', random => {
    const inductance=integer(random,2,8)/10, resistance=integer(random,2,6)*10, voltage=integer(random,2,6)*12, answer=voltage/(2*resistance);
    return numeric(`理想电感L=${inductance} H与电阻R=${resistance} Ω串联接直流${voltage} V，合闸前电流为0。在t=(L/R)ln2时，电流是多少？`,answer,[voltage/resistance,voltage/(4*resistance),voltage*resistance/(2*inductance)], 'A', `阶跃响应i=(V/R)(1−e^(−Rt/L))；此刻指数因子为1/2，故电流是最终电流的一半。`,{inductance,resistance,voltage});
  }),
];

const math = [
  entry('math-bayes', .65, 'probability', random => {
    const prior=integer(random,2,8), sensitivity=integer(random,80,96), falsePositive=integer(random,3,12), answer=prior*sensitivity/(prior*sensitivity+(100-prior)*falsePositive);
    return numeric(`一批零件次品率${prior}%；检测对次品报阳性的概率${sensitivity}%，对合格品误报阳性的概率${falsePositive}%。随机取一件已报阳性，属于次品的条件概率是多少？`,answer,[sensitivity/100,prior/100,prior*sensitivity/10000], '概率0..1', `阳性同时来自次品真阳性与合格品假阳性。贝叶斯式分母为P(D)P(+|D)+P(¬D)P(+|¬D)。`,{prior,sensitivity,falsePositive});
  }),
  entry('math-hypergeom', .71, 'probability', random => {
    const red=integer(random,4,8), blue=integer(random,4,8), answer=choose(red,2)*blue/choose(red+blue,3);
    return numeric(`袋中${red}个红球、${blue}个蓝球，每球等可能；不放回抽3个。恰有2红1蓝的概率是多少？`,answer,[(red/(red+blue))**2*blue/(red+blue),choose(red,2)/choose(red+blue,3),1-answer], '概率0..1', `无序样本共C(${red+blue},3)，有利样本C(${red},2)C(${blue},1)；不放回不能直接按独立抽样相乘。`,{red,blue});
  }),
  entry('math-max-expectation', .93, 'probability', random => {
    const n=integer(random,4,10), answer=(n+1)*(4*n-1)/(6*n);
    return numeric(`独立等概率取X、Y∈{1,…,${n}}，令M=max(X,Y)。E[M]是多少？`,answer,[(n+1)/2,2*(n+1)/3,n], '数值', `P(M=k)=[k²−(k−1)²]/n²=(2k−1)/n²，对k·P(M=k)求和。`,{n});
  }),
  entry('math-polynomial-integral', .58, 'integration', random => {
    const a=integer(random,3,9), answer=a**3/6;
    return numeric(`求定积分 ∫₀^${a} x(${a}−x) dx`,answer,[a**3/3,a*a/2,a**3/12], '数值', `展开后积分为[a x²/2−x³/3]₀ᵃ=a³/6。须同时保留一次项与二次项积分。`,{a});
  }),
  entry('math-improper-integral', .88, 'integration', random => {
    const k=integer(random,2,7), answer=1/(k*k);
    return numeric(`k=${k}，求收敛的反常积分 ∫₀^∞ x·e^(−kx) dx`,answer,[1/k,k,2/(k*k)], '数值', `分部积分后边界项趋零，剩(1/k)∫₀^∞e^(−kx)dx=1/k²。`,{k});
  }),
  entry('math-weighted-series', .96, 'series', random => {
    const denominator=integer(random,3,7), ratio=1/denominator, answer=ratio/(1-ratio)**2;
    return numeric(`求无穷级数 Σₙ₌₁^∞ n/${denominator}ⁿ 的和`,answer,[ratio/(1-ratio),1/(1-ratio)**2,ratio*ratio/(1-ratio)**2], '数值', `在|r|<1内对几何级数求导并乘r，Σnrⁿ=r/(1−r)²；本题r=1/${denominator}。`,{denominator,ratio});
  }),
  entry('math-matrix-power', .91, 'eigen', random => {
    const a=integer(random,3,6), b=integer(random,1,2), power=integer(random,3,5), answer=(a+b)**power+(a-b)**power;
    return numeric(`矩阵A=[[${a},${b}],[${b},${a}]]。求tr(A^${power})`,answer,[2*a**power,(2*a)**power,(a+b)**power-(a-b)**power], '数值', `特征向量(1,1)、(1,−1)对应特征值a+b、a−b；A的幂的迹为两特征值相应幂之和。`,{a,b,power});
  }),
  entry('math-projection', .83, 'projection', random => {
    const u=integer(random,1,4), v=integer(random,1,4), x=integer(random,2,7), y=integer(random,2,7), answer=(u*x+v*y)**2/(u*u+v*v);
    return numeric(`向量w=(${x},${y})在由a=(${u},${v})张成的直线上的正交投影，其长度的平方是多少？`,answer,[u*x+v*y,(u*x+v*y)/(u*u+v*v),x*x+y*y], '数值', `投影为((w·a)/(a·a))a，其范数平方为(w·a)²/(a·a)，不是投影系数本身。`,{u,v,x,y});
  }),
  entry('math-rank-one-det', .98, 'eigen', random => {
    const u=[integer(random,1,3),integer(random,1,3),integer(random,1,3)], v=[integer(random,1,3),-integer(random,1,3),integer(random,1,3)], answer=1+u.reduce((sum,value,i)=>sum+value*v[i],0);
    return numeric(`三维列向量u=(${u})、v=(${v})，I为3×3单位矩阵，求det(I+uvᵀ)`,answer,[answer-1,answer+2,1], '数值', `uvᵀ在与v正交的二维子空间上为零；I+uvᵀ的另外一个特征值为1+vᵀu，行列式为1+vᵀu。即使vᵀu=0，结论也由秩一行列式公式成立。`,{u,v});
  }),
  entry('math-constrained-max', .77, 'optimization', random => {
    const sum=integer(random,3,8)*3, answer=4*sum**3/27;
    return numeric(`x、y为非负实数且x+y=${sum}。求x²y的最大值`,answer,[sum**3/8,sum**3/27,sum**3/4], '数值', `令y=s−x，导数为x(2s−3x)，内部临界点x=2s/3、y=s/3，边界值均为0，最大值4s³/27。`,{sum});
  }),
  entry('math-linear-ode', .86, 'ode', random => {
    const a=integer(random,2,5), b=integer(random,2,5)*a, initial=integer(random,6,10), answer=b/a+(initial-b/a)/2;
    return numeric(`初值问题y'+${a}y=${b}，y(0)=${initial}。求t=(ln2)/${a}时的y`,answer,[b/a,initial/2,initial+b/a], '数值', `平衡解为b/a；偏离平衡的部分按e^(−at)衰减，此时恰衰减为一半。`,{a,b,initial});
  }),
  entry('math-conditional-binomial', .89, 'probability', random => {
    const n=integer(random,3,7), p=pick(random,[.25,.4,.6]), answer=n*p/(1-(1-p)**n);
    return numeric(`独立进行${n}次试验，每次成功概率${p}，成功次数为X。已知至少成功一次，条件期望E[X|X≥1]是多少？`,answer,[n*p,n*p/(1-p),n*p/(1-p**n)], '数值', `X=0对无条件期望贡献为0，所以E[X]=P(X≥1)E[X|X≥1]；E[X]=np，P(X≥1)=1−(1−p)^n。`,{n,p});
  }),
];

const literature = [
  fixed('lit-voice-focal', .61, 'focalization', '某小说使用“他”的第三人称，却只提供角色甲当时所见所想，从不透露甲未知的消息。依热奈特式区分，哪项分析最准确？', '第三人称叙述声音可以与固定内聚焦相结合', ['第三人称语法必然意味着零聚焦和全知', '只要写“他”，就不可能呈现人物意识', '只要角色出现误判，叙述者必然也不可靠'], '“谁说”与信息受谁的知识范围限制不是同一维度。语法人称不能单独决定聚焦类型。'),
  fixed('lit-external', .76, 'focalization', '一个段落只记录可见动作和可听对话，刻意不进入任何人物内心；人物知道密信内容，读者却无法得知。按热奈特的三分法，哪种描述最恰当？', '外聚焦：所提供信息少于人物所知', ['零聚焦：只要叙述者不使用第一人称就是全知', '固定内聚焦：必定完整呈现某人的思绪', '作者亲历叙述：只靠这些信息就可确定作者在现场'], '关键是对内在信息的限制，而非是否描写动作、是否用第一人称；也不能把叙述者等同现实作者。'),
  fixed('lit-variable', .88, 'focalization', '第一章仅限甲的认知，第二章仅限乙的认知，二者都可能误解同一事件；各章内部不越过对应人物的信息范围。最稳妥的分析是什么？', '跨章改变内聚焦对象，不能仅因对象改变就断定每章全知', ['全书信息合计超过任一人物，所以两个章节内部都应归为零聚焦', '每章只有一个认知中心，所以全书仍是同一人物的固定内聚焦', '两人都可能误解事件，所以两章只记录外部动作而不呈现任何意识'], '聚焦对象可以变换；应分别检查各段的信息限制，人物的误解也不自动等于叙述声音的错误。'),
  fixed('lit-order', .67, 'time', '故事实际顺序为童年离乡→成年返乡→晚年回忆，文本先叙成年返乡，再插叙童年，最后转到晚年。最直接被改变的叙事时间维度是什么？', '顺序；文本呈现次序不同于事件发生次序', ['频率；童年事件必定发生了多次', '时距；仅凭此描述可确定每一事件用了多少字', '人物数量；时间顺序由角色多少定义'], '倒叙首先涉及叙述顺序与故事顺序的关系；频率与时距需要其他信息才能判断。'),
  fixed('lit-duration', .79, 'time', '文本用一句话略述十年，又用五页呈现一次五分钟的争论。若其他条件相近，最合理的时距分析是什么？', '前者高度概述，后者相对放慢叙述速度', ['前者一定是倒叙，后者一定是预叙', '五页争论意味着故事世界中发生了五次争论', '只要字数多，所叙事件就必定发生在未来'], '时距关注故事跨度与文本展开程度的关系。长时间被压缩与短时间被扩展不同于顺序或频率变化。'),
  fixed('lit-frequency', .94, 'time', '故事世界中一次事故只发生一次，文本却分别从三人的记忆叙述了三遍。与“每天清晨他都擦窗”这种概括相比，前者与后者分别属于哪种频率关系？', '一次事件叙述多次；多次类似事件叙述一次', ['多次事件叙述一次；一次事件叙述多次', '两个例子都是重复叙述，因为事故和擦窗在语言中都可出现复数', '两个例子都是迭代叙述，因为多名记忆者与多个清晨都构成重复'], '频率分别比较事件发生次数与叙述次数；重述同一次事故与迭代概括日常习惯方向相反。'),
  fixed('lit-unreliable-fact', .73, 'reliability', '叙述者声称自己从未离开房间，但文本随后给出经多个独立情节验证的出门记录，且没有梦境或时间错位提示。最有支持的判断是什么？', '其事实报告存在不可靠的文本线索', ['任何第一人称叙述天然都是完全虚假', '只要叙述者自信，其他叙述信息就必须被排除', '事实矛盾只能证明作者不会写作，不能构成叙事手法'], '可靠性需由文本线索与解释框架判断；自相矛盾及交叉证据可支持报告失真，但不能对所有第一人称一概而论。'),
  fixed('lit-unreliable-values', .87, 'reliability', '叙述者准确交代自己欺骗弱者的过程，却称这种行为“最值得赞美”；文本反复展示受害者后果并与他的赞美形成距离。应优先区分什么？', '事实报告可能准确，而伦理评价可能不可靠', ['只要伦理评价可疑，所有事件在故事中就都没有发生', '事实正确就逻辑上保证价值判断正确', '现实作者必然赞成叙述者的全部评价'], '不可靠性可以涉及报告、解释或评价，不能把一个维度的可靠直接推广到所有维度，也不能把叙述者当现实作者。'),
  fixed('lit-unreliable-evidence', .98, 'reliability', '读者因不喜欢某叙述者的政治态度便判定其对天气的报告为假，但文本无矛盾、无交叉否证。哪项批评最恰当？', '价值分歧本身不足以证明具体事实报告失真，需要相应文本证据', ['价值立场不同常伴随事实错误，所以这种关联足以判定本次天气报告为假', '天气描写可以具有象征意义，故应跳过其事实报告层面，直接判为不可靠', '应先判断读者与叙述者谁的政治立场更可取，再由此确定天气报告的真值'], '需明确不可靠性的对象和证据；阅读者的价值立场不应被偷换成某条事实必假的充分条件。'),
  fixed('lit-free-indirect', .81, 'speech', '小说此前始终贴近阿宁的意识，此处写：“阿宁把信塞回口袋。明天又得解释，真是倒霉！”没有引号或“她想”。最有依据的识别是什么？', '可能是自由间接思想呈现：叙述语境与人物的感情色彩交织', ['一定是作者在现实生活中的直接发言', '没有引号就绝不可能呈现人物思想', '一定是纯客观外部摄影式记录，没有评价色彩'], '自由间接呈现常依赖上下文识别，人物的感叹可进入叙述而不由明确引语框引入；单凭形式不能断定现实作者发言。'),
  fixed('lit-direct-not-faithful', .92, 'speech', '一篇小说把所有人物的长篇发言都放在引号内，但发言高度整齐、充满诗化排比。仅凭“直接引语”形式，能否认定它逐字忠实再现真实谈话？', '不能；呈现形式与拟真或逐字忠实程度是不同问题', ['能；直接引语的叙述契约已保证逐字复制，诗化只说明人物说话风格', '能；有引语框就足以排除叙述者加工，是否像日常口语只是次要问题', '至少能认定它比间接引语更忠实，因为忠实程度按直接、间接形式固定排序'], '直接、间接、自由间接是形式区分；形式不自动保证对实际言语事件的逐字复制，尤其在虚构语境中。'),
  fixed('lit-ambiguous-voice', .85, 'speech', '一句“这可真是漂亮的决定”既可能是角色的自我辩护，也可能是叙述者的反讽。没有上下文时，哪种分析最严谨？', '保留歧义，结合前后语境与人物用语习惯判断声音归属', ['只看句中没有“我”就能唯一断定作者立场', '所有反讽句都必须由故事中的角色亲口说出', '只要没有引号，就完全排除自由间接呈现'], '声音归属及反讽效果常依赖语境，不应把单一语法标记当作足够的判定条件。'),
];

const philosophy = [
  fixed('phi-gettier', .65, 'knowledge', '甲有看似充分的证据相信“乙拥有一辆车”，据此推得“乙有车，或者丙在图书馆”。实际上乙没车，丙却恰在图书馆，而甲对此毫不知情。此例主要挑战什么？', '有理由的真信念是否足以构成知识', ['一个有效析取推理能否把真前提变成假结论', '知识是否完全不需要任何真值条件', '只要结论为真，全部前提就必然为真'], '结论偶然为真、信念有理由，仍可能缺乏知识所需的非偶然联系；有效推理本身不保证前提真实。'),
  fixed('phi-clock', .78, 'knowledge', '某时钟停了整整十二小时，观察者不知它已停，恰在下一次显示正确时据此相信当前时刻。为什么该情境对知识分析有压力？', '真信念与证成可能存在，但准确性依赖认识上的偶然', ['读到正确时刻意味着时钟从未停过', '信念为真足以排除任何偶然因素', '只要设备坏过，任何人在任何情况下都不能知道时间'], '问题针对当次信念怎样获得真值，而非宣称所有设备知识不可能；偶然正确揭示真信念与知识的差别。'),
  fixed('phi-reliability', .91, 'knowledge', '一种知识理论把可靠形成过程列为条件。面对“碰巧猜中”和“通常可靠测量”两例，最合理的理论层次区分是什么？', '命题这次为真与形成过程在适当条件下可靠，是不同条件', ['本次信念的真假可以取代过程评估，因为长期可靠性不涉及单次形成方式', '通常可靠可以替代真值条件，所以该过程恰好生成的错误信念也直接算知识', '过程可靠已完成所有知识条件的检验，因此无须再讨论本次是否偶然为真'], '频率或反事实意义的可靠性不同于单次成功；加入可靠性也不等于把所有关于知识的争论自动解决。'),
  fixed('phi-induction-circle', .73, 'induction', '有人用“过去归纳推理常成功，因此未来归纳推理也可靠”来非循环地证明归纳。休谟式质疑指出什么？', '该论证自身又从过去推向未来，预设了待辩护的推理方式', ['过去资料在逻辑上绝对不能具有任何证据意义', '只要见过一次例外，所有演绎推理都无效', '归纳结论的语法必须含有“所有”二字才有问题'], '这里的循环是论证方式层面的：用归纳的过去成功来为归纳提供非循环正当化，仍需解释跨越未观察情形的根据。'),
  fixed('phi-induction-deduction', .84, 'induction', '有限个已观察的金属样品受热膨胀。若不附加关于自然规律的前提，哪项关于“所有未观察样品也如此”的判断最准确？', '结论超出观察前提，不能仅凭这些前提演绎保证', ['有限观察在形式逻辑上必然蕴涵全部未观察结果', '只要样本不少于三，归纳自动成为演绎', '无法演绎保证就意味着该结论已经被证明为假'], '不被前提演绎蕴涵与已经被证伪不同；归纳可提供支持，但其支持方式与演绎必然性有别。'),
  fixed('phi-uniformity', .97, 'induction', '若用“自然始终齐一”作归纳论证的额外前提，再问该前提凭什么成立，哪项最能说明哲学问题尚未自动解决？', '仍须说明齐一性前提的正当根据，不能只靠归纳式的过去经验重复担保', ['长期稳定的经验模式可以直接升级为逻辑必然前提，从而免除进一步证据负担', '齐一性只涉及过去而不涉及未来，正因如此它足以担保所有未来外推', '加入这一前提后问题只剩形式有效性，前提本身的合理性已不属于正当化问题'], '增加一个实质性前提可改变演绎结构，却不自动提供该前提的认识正当性；它并非仅靠逻辑形式可证的恒真命题。'),
  fixed('phi-act-rule', .67, 'consequences', '理论甲按每次行动的后果评价其正当性；理论乙按普遍接受某规则的后果来评价规则，再据规则评价行动。哪项区分最恰当？', '二者可同属后果主义，但评价的直接对象或层次不同', ['理论乙只要提到规则，就不可能是后果主义', '理论甲必然认为所有后果都具有同等价值', '两理论仅在术语上不同，任何情形下必然得出同一结论'], '后果主义可把行动、规则等不同对象的后果作为最终根据，不能把规则形式直接等同于非后果主义。'),
  fixed('phi-consequences-value', .86, 'consequences', '一种理论仅以行动后果决定正当性，却把知识、友谊和快乐都视为内在善。哪项推论成立？', '它可以是价值多元的后果主义，而非仅最大化快乐的享乐主义', ['只要承认快乐以外的善，就不再是任何后果主义', '后果主义的定义强制要求只计算金钱', '价值多元意味着完全无法比较任何后果'], '后果主义关于评价根据的主张，与“哪些结果有价值”的价值论主张需区分；享乐主义只是可能的一种价值论。'),
  fixed('phi-expected-actual', .95, 'consequences', '两种后果主义分别以实际后果与基于当时合理信息的预期后果评价选择。某行动合理预期有利，却发生极罕见坏结果。应怎样判断？', '两种评价标准可能分离，须先说明采用哪一种', ['应以坏结果反推事前概率估计不合理，所以两种理论在此例中评价必然相同', '只要事前预测合理，实际后果版本也必须把罕见坏结果从其标准中排除', '预期后果只是计算实际后果的近似工具，因此两者不构成规范标准的区别'], '实际值与信息条件下的期望值是不同对象；评价可依理论版本而不同，不能偷换标准。'),
  fixed('phi-hypothetical', .69, 'kant', '“若你已决定以通过考试为目标，就应复习”把要求建立在一个可放弃的目标上。按康德的区分，最准确的归类是什么？', '假言命令：对行动的要求以目标或意欲为条件', ['定言命令：无论任何目标都无条件要求同一手段', '分析命题：它只是在定义“考试”一词', '经验报告：它仅陈述昨天发生的事实'], '康德区分以意欲并采纳某个目标为条件的实践要求，与不依赖特定目标的道德要求；这里的意欲不只是被动愿望，手段建议也不自动成为道德律。'),
  fixed('phi-false-promise', .82, 'kant', '在康德关于虚假承诺的经典论证中，若所有人为获利都遵循“需要时可作无意履行的承诺”，主要出现哪种困难？', '普遍化会破坏承诺被信任的实践，从而破坏该准则赖以奏效的条件', ['仅因个别承诺金额太小，所以统计期望收益为负', '承诺一词在字典中没有任何意义', '只要一次虚假承诺能增加总快乐，康德就必然认可它'], '普遍化检验考察准则能否成为共同法则；虚假承诺依赖他人仍信任承诺，普遍失信会破坏这种依赖条件。'),
  fixed('phi-merely-means', .98, 'kant', '雇主与工人自愿、知情且可拒绝地达成互利合同；另一个雇主通过欺骗使工人接受本会拒绝的条件。依“人作为目的”公式，最关键的区别是什么？', '利用他人的能力不必然是仅当工具；欺骗会绕过其理性同意和自主选择', ['两者都使用劳动能力作为手段，所以其道德地位相同，是否知情不改变评价', '只要双方最后净受益，欺骗便不会使第二个合同落入仅当手段的范围', '区别只在两份合同的利益分配比例，自主同意本身不构成独立的评价根据'], '“当作手段”与“仅仅当作手段”不能混同；尊重人的理性行动能力涉及知情与自主，而非禁止所有合作。'),
];

export const QUESTION_BANK = Object.freeze(Object.fromEntries(Object.entries({ politics, history, chemistry, physics, math, literature, philosophy }).map(([subject, questions]) => [subject, Object.freeze(questions)])));
export const QUESTION_BANK_METADATA = Object.freeze(Object.fromEntries(Object.entries(QUESTION_BANK).map(([subject, questions]) => [subject, Object.freeze({ count: questions.length, minimumDifficulty: Math.min(...questions.map(q=>q.difficulty)), maximumDifficulty: Math.max(...questions.map(q=>q.difficulty)) })])));

/** Three distinct templates, continuous distance scores, and seeded answer shuffling. */
export function generateResearchQuiz(subject, metricsOrDifficulty, seed = `${Date.now()}-${Math.random()}`) {
  if (!Object.hasOwn(QUESTION_BANK, subject)) throw new Error('请选择支持的学科');
  const inputDifficulty = researchDifficulty(metricsOrDifficulty);
  const targetDifficulty = .58 + .4 * inputDifficulty;
  const random = randomFrom(`${subject}|${seed}`);
  // A seed supplies fixed, bounded jitter to each template's distance score.
  // Scores are affine in the target after dropping a common squared-target term;
  // the mean difficulty of the top three cannot decrease as the target increases.
  const selected = QUESTION_BANK[subject].map(template => ({ template, score:-.5*((template.difficulty-targetDifficulty)/.12)**2+.8*random() }))
    .sort((a,b)=>b.score-a.score || a.template.id.localeCompare(b.template.id)).slice(0,3);
  return selected.map(({template}, index) => {
    const generated = template.make(random, inputDifficulty);
    const options = shuffle([generated.answer,...generated.distractors],random);
    if (options.length !== 4 || new Set(options).size !== 4 || !options.every(value=>typeof value==='string')) throw new Error(`题目选项无效：${template.id}`);
    return { id:`r-${subject}-${index}-${hash(`${seed}|${template.id}`)}`, templateId:template.id, subject,
      difficulty:template.difficulty, targetDifficulty, sources:[template.source], source:template.source, prompt:generated.prompt,
      options, answerIndex:options.indexOf(generated.answer), explanation:generated.explanation,
      ...(generated.parameters ? { parameters:generated.parameters,numericAnswer:generated.numericAnswer } : {}) };
  });
}
