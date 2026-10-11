// Independent, entirely local arithmetic and sampling checks.
// Run: node --test tests/question-bank-independent.test.mjs
// Numerical integration, explicit outcomes and matrix multiplication validate
// the authored closed forms without merely repeating the same formulas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTION_BANK, generateResearchQuiz, researchDifficulty } from '../src/question-bank.mjs';

function random(seed) {
  let state = seed + 1;
  return () => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296);
}
function simpson(fn, lower, upper, steps = 256) {
  const width = (upper - lower) / steps;
  let sum = fn(lower) + fn(upper);
  for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * fn(lower + width * i);
  return sum * width / 3;
}
function integrateOde(fn, initial, until, steps = 128) {
  const h = until / steps;
  let value = initial;
  for (let i = 0; i < steps; i++) {
    const a = fn(value), b = fn(value + h * a / 2), c = fn(value + h * b / 2), d = fn(value + h * c);
    value += h * (a + 2 * b + 2 * c + d) / 6;
  }
  return value;
}
function determinant3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
function matrixMultiply(a, b) {
  return a.map(row => b[0].map((_, column) => row.reduce((sum, value, i) => sum + value * b[i][column], 0)));
}

const solve = {
  'chem-kc': p => p.hi ** 2 / (p.h * p.i),
  'chem-transform-k': p => Math.exp(-Math.log(p.k) / 2),
  'chem-compression': p => p.factor ** 2 / p.factor,
  'chem-buffer-ratio': p => -Math.log10(10 ** (-p.pKa) / p.ratio),
  'chem-buffer-titration': p => -Math.log10(10 ** (-p.pKa) * (p.acid + p.added) / (p.base - p.added)),
  'chem-weak-exact': p => {
    let lo = 0, hi = p.concentration;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (mid * mid / (p.concentration - mid) > p.ka) hi = mid; else lo = mid;
    }
    return -Math.log10((lo + hi) / 2);
  },
  'chem-half-life': p => 100 * Math.exp(-Math.LN2 / p.half * (p.half * p.count)),
  'chem-rate-orders': p => Math.exp(Math.log(p.a) * Math.log2(4) + Math.log(p.b) * Math.log2(2)),
  'chem-gibbs': p => (p.enthalpy * 1000 - p.temperature * p.entropy) / 1000,
  'chem-equilibrium-g': p => Math.exp(-p.delta * 1000 / (8.314462618 * p.temperature)),
  'chem-nernst': p => p.standard - 0.05916 / p.electrons * Math.log10(10 ** p.power),
  'chem-electrolysis': p => (p.current * p.time) * p.molarMass / (96500 * p.electrons),
  'phy-inelastic': p => {
    const finalV = (p.m1 * p.v1 + p.m2 * p.v2) / (p.m1 + p.m2);
    return (p.m1 * p.v1 ** 2 + p.m2 * p.v2 ** 2 - (p.m1 + p.m2) * finalV ** 2) / 2;
  },
  'phy-incline': p => 2 * (10 * p.distance * 0.6 - p.friction * 10 * 0.8 * p.distance),
  'phy-shm': p => Math.sqrt(2 * (p.spring * p.amplitude ** 2 / 2 - p.spring * (p.ratio * p.amplitude) ** 2 / 2) / p.mass),
  'phy-standing': p => Math.sqrt(p.tension / p.density) / (2 * p.length / p.harmonic),
  'phy-doppler': p => (p.sound + p.observer) / ((p.sound - p.moving) / p.emitted),
  'phy-interference': p => p.wavelength * 1e-9 * p.length / (p.index * p.gap * 1e-3) * 1000,
  'phy-carnot': p => p.heat - p.heat * p.cold / p.hot,
  'phy-entropy': p => p.moles * 8.314 * simpson(v => 1 / v, 1, p.factor, 1024),
  'phy-cycle': p => -((p.q1 - p.w1) + (p.q2 - p.w2)) + p.w3,
  'phy-network': p => (p.voltage / p.r1) / (1 / p.r1 + 1 / p.r2 + 1 / p.r3) / p.r2,
  'phy-dielectric': p => (p.capacitance * 1e-6 * p.voltage) ** 2 / (2 * p.dielectric * p.capacitance * 1e-6) * 1e6,
  'phy-rl': p => integrateOde(i => (p.voltage - p.resistance * i) / p.inductance, 0, p.inductance / p.resistance * Math.LN2),
  'math-bayes': p => {
    const truePositive = p.prior * p.sensitivity;
    const falsePositive = (100 - p.prior) * p.falsePositive;
    return truePositive / (truePositive + falsePositive);
  },
  'math-hypergeom': p => {
    let total = 0, favorable = 0;
    for (let a = 0; a < p.red + p.blue; a++) for (let b = a + 1; b < p.red + p.blue; b++) for (let c = b + 1; c < p.red + p.blue; c++) {
      total++;
      if ([a, b, c].filter(i => i < p.red).length === 2) favorable++;
    }
    return favorable / total;
  },
  'math-max-expectation': p => {
    let sum = 0;
    for (let x = 1; x <= p.n; x++) for (let y = 1; y <= p.n; y++) sum += Math.max(x, y);
    return sum / p.n ** 2;
  },
  'math-polynomial-integral': p => simpson(x => x * (p.a - x), 0, p.a),
  'math-improper-integral': p => simpson(x => x * Math.exp(-p.k * x), 0, 30 / p.k, 2048),
  'math-weighted-series': p => {
    let sum = 0;
    for (let n = 1; n <= 100; n++) sum += n / p.denominator ** n;
    return sum;
  },
  'math-matrix-power': p => {
    const matrix = [[p.a, p.b], [p.b, p.a]];
    let value = [[1, 0], [0, 1]];
    for (let i = 0; i < p.power; i++) value = matrixMultiply(value, matrix);
    return value[0][0] + value[1][1];
  },
  'math-projection': p => {
    const norm = Math.hypot(p.u, p.v);
    return (p.x * p.u / norm + p.y * p.v / norm) ** 2;
  },
  'math-rank-one-det': p => determinant3(p.u.map((u, i) => p.v.map((v, j) => u * v + (i === j ? 1 : 0)))),
  'math-constrained-max': p => {
    let maximum = 0;
    for (let i = 0; i <= 600; i++) { const x = p.sum * i / 600; maximum = Math.max(maximum, x * x * (p.sum - x)); }
    return maximum;
  },
  'math-linear-ode': p => integrateOde(y => p.b - p.a * y, p.initial, Math.LN2 / p.a),
  'math-conditional-binomial': p => {
    let positiveProbability = 0, positiveExpectation = 0;
    for (let outcome = 1; outcome < 2 ** p.n; outcome++) {
      const successes = outcome.toString(2).replaceAll('0', '').length;
      const probability = p.p ** successes * (1 - p.p) ** (p.n - successes);
      positiveProbability += probability;
      positiveExpectation += successes * probability;
    }
    return positiveExpectation / positiveProbability;
  },
};

test('36 science templates agree with independent calculations for 18,000 variants and have unique nearest answers', () => {
  assert.equal(Object.values(QUESTION_BANK).reduce((sum, bank) => sum + bank.length, 0), 84);
  let checked = 0;
  for (const subject of ['chemistry', 'physics', 'math']) {
    assert.equal(QUESTION_BANK[subject].length, 12);
    for (const template of QUESTION_BANK[subject]) {
      assert.equal(typeof solve[template.id], 'function', `missing independent solver: ${template.id}`);
      for (let seed = 0; seed < 500; seed++) {
        const item = template.make(random(seed), seed / 499);
        const expected = solve[template.id](item.parameters);
        assert.ok(Math.abs(item.numericAnswer - expected) < 1e-8 * Math.max(1, Math.abs(expected)), `${template.id}: formula mismatch`);
        const options = [item.answer, ...item.distractors];
        assert.equal(options.length, 4, template.id);
        assert.equal(new Set(options.map(Number)).size, 4, `${template.id}: equivalent numeric options`);
        assert.ok(options.every(v => Number.isFinite(Number(v))), template.id);
        const distances = options.map(v => Math.abs(Number(v) - expected));
        assert.ok(distances.slice(1).every(d => d > distances[0] + 1e-8), `${template.id}: correct answer is not uniquely closest`);
        checked++;
      }
    }
  }
  assert.equal(checked, 18000);
});

test('same-seed quiz mean never falls across 101 continuous difficulty values in all seven subjects', () => {
  assert.equal(Object.keys(QUESTION_BANK).length, 7);
  for (const subject of Object.keys(QUESTION_BANK)) {
    for (let seed = 0; seed < 60; seed++) {
      let previous = -Infinity;
      let first;
      for (let step = 0; step <= 100; step++) {
        const difficulty = step / 100;
        const quiz = generateResearchQuiz(subject, { difficulty }, seed);
        assert.equal(new Set(quiz.map(q => q.templateId)).size, 3);
        assert.equal(new Set(quiz.map(q => q.id)).size, 3);
        assert.equal(new Set(quiz.map(q => q.prompt)).size, 3);
        const mean = quiz.reduce((sum, item) => sum + item.difficulty, 0) / 3;
        assert.ok(mean >= previous - 1e-12, `${subject}/${seed}/${difficulty}: average became easier`);
        if (step === 0) first = mean;
        for (const item of quiz) {
          assert.equal(new Set(item.options).size, 4);
          assert.ok(item.answerIndex >= 0 && item.answerIndex < 4);
          assert.ok(item.sources?.length > 0 && item.sources.every(source => source.url.startsWith('https://')));
          assert.equal(item.targetDifficulty, 0.58 + 0.4 * difficulty);
        }
        previous = mean;
      }
      assert.ok(previous > first + 0.1, `${subject}/${seed}: complexity had too little effect`);
    }
  }
  assert.ok(researchDifficulty({ difficulty: 0.501 }) < researchDifficulty({ difficulty: 0.502 }));
});
