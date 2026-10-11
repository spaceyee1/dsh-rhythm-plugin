import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCode, estimateTask, createChart, generateQuiz, SUBJECTS,
  FAILURE_REPLY, EXIT_REPLY,
} from '../src/core.mjs';

test('analysis ignores branches and braces embedded in comments or strings', () => {
  const metrics = analyzeCode(`// if (bad) { while (true) {} }
const caption = "if { for while }";
/* else { catch {} } */
if (ready) {
  for (const x of items) {
    save(x);
  }
}`);
  assert.equal(metrics.lines, 6);
  assert.equal(metrics.branches, 2);
  assert.equal(metrics.nesting, 2);
  assert.ok(metrics.characters > 0);
});

test('empty, escaped, and Python-style code have bounded useful estimates', () => {
  assert.equal(analyzeCode(' \n// just a comment').lines, 0);
  assert.equal(analyzeCode('const x = "escaped \\" if {";').branches, 0);
  const python = analyzeCode('if ready:\n    for item in values:\n        if item:\n            save(item)');
  assert.equal(python.branches, 3);
  assert.equal(python.nesting, 3);
  assert.ok(python.difficulty > 0 && python.difficulty < 1);
  assert.ok(Number.isFinite(analyzeCode(null).complexity));
});

test('code length and branching independently increase challenge metrics', () => {
  const short = analyzeCode('return 1;');
  const long = analyzeCode(Array.from({ length: 120 }, (_, index) => `save(${index});`).join('\n'));
  const branchy = analyzeCode(Array.from({ length: 120 }, (_, index) => `if (x > ${index}) { save(x); }`).join('\n'));
  assert.ok(long.complexity > short.complexity);
  assert.ok(long.difficulty > short.difficulty);
  assert.ok(long.noteCount > short.noteCount);
  assert.ok(long.bpm > short.bpm);
  assert.ok(branchy.complexity > long.complexity);
  assert.ok(branchy.difficulty > long.difficulty);
  assert.ok(branchy.noteCount > long.noteCount);
  assert.ok(branchy.bpm >= long.bpm);
  assert.ok(branchy.difficulty < 1);
});

test('task estimate is explicit and reacts to requested scope', () => {
  const small = estimateTask('写一个加法函数');
  const large = estimateTask('写一个游戏，包含动画、登录认证、数据库、权限、并发状态、文件上传、网络接口和测试');
  assert.equal(small.estimated, true);
  assert.ok(large.lines > small.lines);
  assert.ok(large.complexity > small.complexity);
  assert.ok(large.difficulty > small.difficulty);
  assert.ok(large.bpm > small.bpm);
  assert.ok(large.noteCount > small.noteCount);
});

test('architecture and algorithm requirements contribute beyond prompt length', () => {
  for (const task of [
    '实现分布式事务、回滚、容错、调度、编译器、解析器、实时渲染、图算法优化和多线程',
    'distributed transactions, rollback, fault tolerance, scheduler, compiler parser, real-time renderer, graph algorithms, multithreading, TLS WebSocket',
  ]) {
    const advanced = estimateTask(task);
    const sameLength = estimateTask('x'.repeat(task.length));
    assert.ok(advanced.complexity > sameLength.complexity);
    assert.ok(advanced.difficulty > sameLength.difficulty);
    assert.ok(advanced.noteCount > sameLength.noteCount);
    assert.ok(advanced.bpm > sameLength.bpm);
  }
});

test('large single-line payloads retain their line count but require a larger challenge', () => {
  const short = analyzeCode('const items = [1,2,3];');
  const long = analyzeCode(`const items = [${'12345,'.repeat(50000)}0];`);
  assert.equal(short.lines, 1);
  assert.equal(long.lines, 1);
  assert.ok(long.characters > 300000);
  assert.ok(long.complexity > short.complexity + 40);
  assert.ok(long.difficulty > short.difficulty);
  assert.ok(long.noteCount > short.noteCount);
  assert.ok(long.bpm > short.bpm);
  assert.ok(long.durationSeconds > short.durationSeconds);
});

test('task size is inferred once even for unusually long prompts', () => {
  const medium = estimateTask('x'.repeat(5000));
  const veryLong = estimateTask('x'.repeat(300000));
  assert.equal(medium.lines, 1200);
  assert.equal(veryLong.lines, 1200);
  assert.equal(medium.complexity, veryLong.complexity);
  assert.equal(medium.noteCount, veryLong.noteCount);
});

test('continuous metrics raise the baseline and do not use legacy level bands', () => {
  const empty = analyzeCode('');
  assert.equal(empty.difficulty, 0);
  assert.equal(empty.bpm, 150);
  assert.equal(empty.noteCount, 72);
  const one = analyzeCode('save(1);');
  const two = analyzeCode('save(1);\nsave(2);');
  assert.equal(one.level, two.level);
  assert.ok(two.difficulty > one.difficulty);
  assert.ok(two.bpm > one.bpm);
  assert.ok(two.noteCount > one.noteCount);
  assert.deepEqual(createChart({ level: 1 }, 'legacy'), createChart({ level: 5 }, 'legacy'));
  const a = createChart({ difficulty: 0.501 }, 'continuous');
  const b = createChart({ difficulty: 0.502 }, 'continuous');
  assert.ok(b.bpm > a.bpm);
  assert.ok(b.scrollSpeed > a.scrollSpeed);
  assert.ok(b.hitWindowMs < a.hitWindowMs);
  assert.ok(b.perfectWindowMs <= a.perfectWindowMs);
});

function assertPlayable(chart) {
  assert.equal(chart.notes.length, chart.noteCount);
  assert.ok(chart.notes[0].timeMs >= chart.introMs);
  assert.ok(chart.introMs >= 1600);
  assert.ok(chart.perfectWindowMs > 0 && chart.perfectWindowMs < chart.hitWindowMs);
  assert.ok(chart.durationMs > Math.max(...chart.notes.map(note => note.endTimeMs)) + chart.hitWindowMs);
  const previousEnd = [-Infinity, -Infinity];
  const chords = new Map();
  for (const [index, note] of chart.notes.entries()) {
    assert.equal(note.id, index);
    assert.ok(note.lane === 0 || note.lane === 1);
    assert.ok(note.type === 'tap' || note.type === 'hold');
    assert.ok(Number.isInteger(note.timeMs));
    assert.ok(Number.isInteger(note.durationMs));
    assert.equal(note.endTimeMs, note.timeMs + note.durationMs);
    assert.equal(note.type === 'hold', note.durationMs > 0);
    assert.ok(note.timeMs - previousEnd[note.lane] >= chart.releaseGapMs, 'hold bodies and release windows cannot overlap the next head');
    assert.ok(chart.releaseGapMs > chart.hitWindowMs * 2);
    if (index > 0) assert.ok(note.timeMs >= chart.notes[index - 1].timeMs);
    previousEnd[note.lane] = note.endTimeMs;
    if (note.chordId !== null) {
      const group = chords.get(note.chordId) ?? [];
      group.push(note);
      chords.set(note.chordId, group);
    }
  }
  assert.ok(chart.notes.some(note => note.type === 'hold'));
  assert.ok(chords.size > 0);
  for (const group of chords.values()) {
    assert.equal(group.length, 2);
    assert.equal(group[0].timeMs, group[1].timeMs);
    assert.notEqual(group[0].lane, group[1].lane);
  }
  assert.deepEqual(new Set(chart.notes.map(note => note.lane)), new Set([0, 1]));
}

test('seeded charts contain reproducible chords and playable holds across continuous difficulty', () => {
  for (const difficulty of [0, 0.001, 0.17, 0.333, 0.5, 0.729, 0.999, 1]) {
    for (let seed = 0; seed < 100; seed += 1) {
      const chart = createChart({ difficulty }, seed);
      assert.deepEqual(chart, createChart({ difficulty }, seed));
      assertPlayable(chart);
      assert.ok(chart.durationMs < 120000, 'normal charts should finish within two minutes');
    }
  }
});

test('longer and more complex code makes a larger, denser chart', () => {
  const easy = createChart(analyzeCode('console.log(1);'), 'same');
  const hardCode = Array.from({ length: 150 }, () => 'if (ready) { for (const x of xs) { if (x.ok) { save(x); } } }').join('\n');
  const hard = createChart(analyzeCode(hardCode), 'same');
  assert.ok(hard.notes.length > easy.notes.length);
  assert.ok(hard.bpm > easy.bpm);
  const density = chart => (chart.notes.length - 1) / (chart.notes.at(-1).timeMs - chart.notes[0].timeMs);
  assert.ok(density(hard) > density(easy));
  assert.ok(hard.hitWindowMs < easy.hitWindowMs);
  assert.ok(hard.perfectWindowMs < easy.perfectWindowMs);
  assert.ok(hard.scrollSpeed > easy.scrollSpeed);
});

test('chart input bounds prevent impossible or unbounded charts', () => {
  const chart = createChart({ difficulty: NaN, level: 99, bpm: Infinity, noteCount: -100 }, 0);
  assert.equal(chart.notes.length, 72);
  assert.ok(Number.isFinite(chart.durationMs));
  assert.equal(chart.bpm, 150);
  assert.equal(chart.scrollSpeed, 0.38);
  assertPlayable(chart);
  const maximum = createChart({ difficulty: 99, bpm: 100000, noteCount: 100000 }, 1);
  assert.equal(maximum.notes.length, 360);
  assert.equal(maximum.difficulty, 1);
  assert.equal(maximum.bpm, 230);
  assert.equal(maximum.scrollSpeed, 0.76);
  assert.equal(maximum.perfectWindowMs, 30);
  assert.equal(maximum.hitWindowMs, 85);
  assertPlayable(maximum);
  const minimum = createChart({ difficulty: -99, bpm: -1, noteCount: -1 }, 2);
  assert.equal(minimum.difficulty, 0);
  assert.equal(minimum.bpm, 150);
  assert.equal(minimum.notes.length, 72);
  assertPlayable(minimum);
});

test('duration includes a trailing hold tail rather than only the last head', () => {
  let found = false;
  for (let seed = 0; seed < 100 && !found; seed += 1) {
    const chart = createChart({ difficulty: 0.7 }, seed);
    const lastHead = chart.notes.at(-1).timeMs;
    const lastTail = Math.max(...chart.notes.map(note => note.endTimeMs));
    if (lastTail > lastHead + chart.hitWindowMs) {
      found = true;
      assert.ok(chart.durationMs > lastTail + chart.hitWindowMs);
    }
  }
  assert.ok(found, 'seeded coverage must exercise a tail beyond the final head');
});

test('all subjects and legacy difficulty inputs generate three distinct explainable questions', () => {
  assert.equal(SUBJECTS.length, 7);
  for (const subject of SUBJECTS) {
    for (const level of [1, 3, 5]) {
      for (let seed = 0; seed < 200; seed += 1) {
        const quiz = generateQuiz(subject.id, level, seed);
        assert.equal(quiz.length, 3);
        assert.equal(new Set(quiz.map(item => item.id)).size, 3);
        assert.equal(new Set(quiz.map(item => item.prompt)).size, 3);
        for (const item of quiz) {
          assert.equal(item.options.length, 4);
          assert.equal(new Set(item.options).size, 4, item.prompt);
          assert.ok(Number.isInteger(item.answerIndex) && item.answerIndex >= 0 && item.answerIndex < 4);
          assert.ok(item.explanation.length > 8);
        }
      }
    }
  }
});

test('quiz seed is deterministic while variants and continuous targets change', () => {
  for (const subject of SUBJECTS) {
    assert.deepEqual(generateQuiz(subject.id, 3, 'repeat'), generateQuiz(subject.id, 3, 'repeat'));
    const variants = new Set(Array.from({ length: 15 }, (_, index) => JSON.stringify(generateQuiz(subject.id, 3, index))));
    assert.ok(variants.size > 10);
    assert.notDeepEqual(generateQuiz(subject.id, 1, 0).map(item => item.prompt), generateQuiz(subject.id, 5, 0).map(item => item.prompt));
  }
  assert.throws(() => generateQuiz('unknown', 1, 0), RangeError);
});

test('result replies preserve the requested exact strings', () => {
  assert.equal(FAILURE_REPLY, '菜逼还让我写代码');
  assert.equal(EXIT_REPLY, '连挑战都不敢，杂鱼呢');
});
