import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTION_BANK, QUESTION_BANK_METADATA, QUESTION_SOURCES,
  generateResearchQuiz, researchDifficulty,
} from '../src/question-bank.mjs';

const subjects = ['politics', 'history', 'chemistry', 'physics', 'math', 'literature', 'philosophy'];
const science = ['chemistry', 'physics', 'math'];
function randomFor(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32);
}

test('seven subjects provide 84 original templates with traceable checked sources', () => {
  assert.deepEqual(Object.keys(QUESTION_BANK).sort(), [...subjects].sort());
  assert.equal(Object.values(QUESTION_BANK).flat().length, 84);
  assert.equal(Object.keys(QUESTION_SOURCES).length, 46);
  const allIds = new Set();
  const usedSources = new Set();
  for (const subject of subjects) {
    assert.equal(QUESTION_BANK[subject].length, 12);
    assert.equal(QUESTION_BANK_METADATA[subject].count, 12);
    for (const template of QUESTION_BANK[subject]) {
      assert.ok(!allIds.has(template.id), `duplicate template: ${template.id}`);
      allIds.add(template.id);
      assert.ok(template.difficulty >= .58 && template.difficulty <= 1);
      assert.ok(template.source.title.length > 10);
      assert.equal(template.source.checked, '2026-10-11');
      assert.equal(new URL(template.source.url).protocol, 'https:');
      assert.ok(Object.values(QUESTION_SOURCES).includes(template.source));
      usedSources.add(template.source);
    }
  }
  assert.equal(usedSources.size, 46, 'every listed source is used by at least one template');
});

test('all templates retain exactly four distinct choices across parameter variation', () => {
  for (const template of Object.values(QUESTION_BANK).flat()) {
    for (let seed = 1; seed <= 60; seed++) {
      const question = template.make(randomFor(seed), seed / 60);
      const options = [question.answer, ...question.distractors];
      assert.equal(options.length, 4, template.id);
      assert.equal(new Set(options).size, 4, template.id);
      assert.ok(options.every(option => typeof option === 'string' && option.length > 0), template.id);
      assert.ok(question.prompt.length > 20, template.id);
      assert.ok(question.explanation.length > 25, template.id);
      if (question.parameters) assert.ok(Number.isFinite(question.numericAnswer), template.id);
    }
  }
});

test('every science template varies its problem parameters rather than only answer order', () => {
  for (const subject of science) {
    for (const template of QUESTION_BANK[subject]) {
      const forms = new Set();
      for (let seed = 1; seed <= 100; seed++) {
        const question = template.make(randomFor(seed), .8);
        assert.ok(question.parameters && Object.keys(question.parameters).length > 0, template.id);
        forms.add(JSON.stringify(question.parameters));
      }
      assert.ok(forms.size >= 5, `${template.id} only has ${forms.size} variants in this sample`);
    }
  }
});

test('quiz generation returns three distinct seeded, reproducible questions and shuffled answers', () => {
  for (const subject of subjects) {
    const positions = new Set();
    for (let seed = 1; seed <= 100; seed++) {
      const quiz = generateResearchQuiz(subject, { difficulty: .623 }, `shape-${seed}`);
      assert.deepEqual(quiz, generateResearchQuiz(subject, { difficulty: .623 }, `shape-${seed}`));
      assert.equal(quiz.length, 3);
      assert.equal(new Set(quiz.map(question => question.templateId)).size, 3);
      assert.equal(new Set(quiz.map(question => question.id)).size, 3);
      for (const question of quiz) {
        assert.equal(question.subject, subject);
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options).size, 4);
        assert.ok(Number.isInteger(question.answerIndex) && question.answerIndex >= 0 && question.answerIndex < 4);
        assert.deepEqual(question.sources, [question.source]);
        assert.ok(question.sources[0].url.startsWith('https://'));
        positions.add(question.answerIndex);
      }
    }
    assert.deepEqual([...positions].sort(), [0, 1, 2, 3], `${subject} answer positions`);
  }
});

test('continuous difficulty takes precedence over legacy level and handles invalid input', () => {
  assert.equal(researchDifficulty({ difficulty: .423, level: 5, complexity: 1000 }), .423);
  assert.equal(researchDifficulty({ difficulty: 2 }), 1);
  assert.equal(researchDifficulty({ difficulty: -1 }), 0);
  assert.equal(researchDifficulty({ complexity: 145 }), 1 - Math.exp(-1));
  assert.equal(researchDifficulty({ complexity: -10 }), 0);
  assert.equal(researchDifficulty({}), 0);
  assert.equal(researchDifficulty({ difficulty: NaN }), 0);
  assert.equal(researchDifficulty(NaN), 0);
  for (let level = 1; level <= 5; level++) {
    assert.equal(researchDifficulty(level), (level - 1) / 4);
    assert.equal(researchDifficulty({ level }), (level - 1) / 4);
  }
  assert.equal(researchDifficulty(.75), .75);
  assert.equal(researchDifficulty({ difficulty: 1 }), 1);
  const lower = generateResearchQuiz('math', { difficulty: .421, level: 5 }, 'continuous');
  const higher = generateResearchQuiz('math', { difficulty: .422, level: 1 }, 'continuous');
  assert.ok(Math.abs((higher[0].targetDifficulty - lower[0].targetDifficulty) - .0004) < 1e-12);
  assert.throws(() => generateResearchQuiz('unknown', { difficulty: .5 }, 1), /学科/);
});

test('low baseline is already demanding and high complexity moves to harder templates', () => {
  for (const subject of subjects) {
    const totals = [0, 0];
    for (let seed = 1; seed <= 60; seed++) {
      for (const [index, difficulty] of [0, 1].entries()) {
        totals[index] += generateResearchQuiz(subject, { difficulty }, `baseline-${seed}`)
          .reduce((sum, question) => sum + question.difficulty, 0) / 3;
      }
    }
    const [low, high] = totals.map(value => value / 60);
    assert.ok(low >= .6, `${subject}: baseline ${low}`);
    assert.ok(high >= .85, `${subject}: upper ${high}`);
    assert.ok(high - low > .1, `${subject}: insufficient change ${low} -> ${high}`);
  }
});

test('power-law extrapolation explicitly states its premise and numeric displays are finite', () => {
  const rate = QUESTION_BANK.chemistry.find(template => template.id === 'chem-rate-orders').make(randomFor(19));
  assert.match(rate.prompt, /v=k\[A\]\^m\[B\]\^n/);
  assert.match(rate.prompt, /k不变/);
  for (const subject of science) {
    for (const template of QUESTION_BANK[subject]) {
      for (let seed = 1; seed <= 30; seed++) {
        const question = template.make(randomFor(seed));
        for (const option of [question.answer, ...question.distractors]) {
          assert.ok(Number.isFinite(Number(option)), `${template.id}: ${option}`);
        }
      }
    }
  }
});
