import test from 'node:test';
import assert from 'node:assert/strict';
import { Challenge, NativeController, createBridge } from '../src/bridge.mjs';
import { analyzeCode, generateQuiz, FAILURE_REPLY, EXIT_REPLY } from '../src/core.mjs';

const metrics = () => analyzeCode('function add(a,b) { return a+b; }');
function controlled(options = {}) {
  let time = 0;
  const game = new Challenge(metrics(), { clock: () => time, now: () => time, ...options });
  return { game, advance: value => { time = value; game.tick(); } };
}

test('exactly 20% MISS passes, more than 20% fails before the chart ends', async () => {
  const first = controlled();
  first.game.action({ action: 'start-rhythm' });
  first.game.chart.notes = Array.from({ length: 5 }, (_, id) => ({ id, lane: 0, timeMs: 3000 + id * 1000 }));
  for (let id = 0; id < 4; id++) {
    first.advance(3000 + id * 1000);
    first.game.action({ action: 'hit', lane: 0 });
  }
  first.advance(8000);
  assert.equal(first.game.status, 'passed');
  assert.equal(first.game.snapshot().missRate, 0.2);

  const second = controlled();
  second.game.action({ action: 'start-rhythm' });
  second.game.chart.notes = Array.from({ length: 5 }, (_, id) => ({ id, lane: 0, timeMs: 3000 + id * 1000 }));
  second.advance(4500);
  assert.deepEqual(await second.game.done, { status: 'failed', reply: FAILURE_REPLY });
});

test('server timing grades the inclusive 50ms PERFECT and original GOOD window boundaries', () => {
  for (const offset of [-160, -51, -50, 0, 50, 51, 160]) {
    const { game, advance } = controlled();
    game.action({ action: 'start-rhythm' });
    game.chart = { ...game.chart, perfectWindowMs: 50, hitWindowMs: 160, notes: [{ id: 'boundary', lane: 0, timeMs: 1000 }] };
    advance(1000 + offset);
    // Client-supplied timing, note ID, grade and counters must not affect judgement.
    const state = game.action({ action: 'hit', lane: 0, grade: 'perfect', noteId: 'forged', offsetMs: 0, score: 999999, hits: 999999 });
    const grade = Math.abs(offset) <= 50 ? 'perfect' : 'good';
    assert.equal(state.judgements.boundary, grade, `offset ${offset}`);
    assert.equal(state.hits, 1);
    assert.equal(state.perfectHits, grade === 'perfect' ? 1 : 0);
    assert.equal(state.goodHits, grade === 'good' ? 1 : 0);
    assert.equal(state.perfectWindowMs, 50);
    assert.deepEqual(state.feedback, [{ id: 1, lane: 0, noteId: 'boundary', grade, offsetMs: offset, source: 'hit', counted: true, combo: 1, at: 1000 + offset }]);
    assert.equal(state.status, 'passed');
  }
});

test('outside-window early presses stay uncounted; late presses get one automatic note MISS', () => {
  for (const offset of [-161, 161]) {
    const { game, advance } = controlled();
    game.action({ action: 'start-rhythm' });
    game.chart = { ...game.chart, hitWindowMs: 160, notes: Array.from({ length: 5 }, (_, id) => ({ id, lane: 0, timeMs: 1000 + id * 1000 })) };
    advance(1000 + offset);
    const state = game.action({ action: 'hit', lane: 0 });
    assert.equal(state.hits, 0);
    assert.equal(state.misses, offset < 0 ? 0 : 1);
    assert.equal(state.judgements[0], offset < 0 ? undefined : 'miss');
    const empty = state.feedback.at(-1);
    assert.deepEqual(empty, { id: offset < 0 ? 1 : 2, lane: 0, noteId: null, grade: 'miss', offsetMs: null, source: 'hit', counted: false, combo: 0, at: 1000 + offset });
    if (offset > 0) assert.deepEqual(state.feedback[0], { id: 1, lane: 0, noteId: 0, grade: 'miss', offsetMs: null, source: 'timeout', counted: true, combo: 0, at: 1161 });
    game.tick();
    assert.equal(game.feedback.length, offset < 0 ? 1 : 2, 'Repeated ticks cannot duplicate an automatic MISS');
    assert.equal(state.status, 'rhythm', 'One miss in five keeps the exact 20% boundary');
  }
});

test('both lanes share a combo, GOOD extends it, and an automatic MISS clears it without losing maxCombo', () => {
  const { game, advance } = controlled();
  game.action({ action: 'start-rhythm' });
  game.chart = { ...game.chart, hitWindowMs: 160, notes: [
    { id: 0, lane: 0, timeMs: 1000 }, { id: 1, lane: 1, timeMs: 1000 },
    { id: 2, lane: 1, timeMs: 2000 }, { id: 3, lane: 0, timeMs: 3000 },
    { id: 4, lane: 1, timeMs: 4000 },
  ] };
  advance(1000);
  game.action({ action: 'hit', lane: 0 });
  assert.equal(game.judgements[1], undefined, 'The other lane remains independent');
  game.action({ action: 'hit', lane: 1 });
  advance(2051);
  game.action({ action: 'hit', lane: 1 });
  assert.equal(game.combo, 3);
  assert.equal(game.maxCombo, 3);
  advance(3161);
  assert.equal(game.combo, 0);
  assert.equal(game.maxCombo, 3);
  advance(4000);
  const state = game.action({ action: 'hit', lane: 1 });
  assert.equal(state.combo, 1);
  assert.equal(state.maxCombo, 3);
  assert.equal(state.perfectHits, 3);
  assert.equal(state.goodHits, 1);
  assert.equal(state.hits, 4);
  assert.equal(state.misses, 1);
  assert.equal(state.status, 'passed');
  assert.deepEqual(state.feedback.map(event => [event.lane, event.grade]), [[0, 'perfect'], [1, 'perfect'], [1, 'good'], [0, 'miss'], [1, 'perfect']]);
  assert.deepEqual(state.feedback.map(event => event.combo), [1, 2, 3, 0, 1]);
});

test('empty presses and replayed hits show MISS feedback, reset combo, and cannot spoof note scores', () => {
  const { game, advance } = controlled();
  game.action({ action: 'start-rhythm' });
  game.chart = { ...game.chart, hitWindowMs: 160, notes: [{ id: 0, lane: 0, timeMs: 1000 }, { id: 1, lane: 1, timeMs: 2000 }] };
  advance(1000);
  game.action({ action: 'hit', lane: 1, noteId: 0, grade: 'perfect', misses: -100 });
  assert.equal(game.judgements[0], undefined);
  assert.equal(game.hits, 0);
  assert.equal(game.misses, 0);
  game.action({ action: 'hit', lane: 0 });
  assert.equal(game.combo, 1);
  game.action({ action: 'hit', lane: 0 });
  assert.equal(game.combo, 0);
  assert.equal(game.maxCombo, 1);
  assert.equal(game.hits, 1);
  assert.equal(game.misses, 0);
  assert.equal(game.feedback.at(-1).counted, false);
  advance(2051);
  const state = game.action({ action: 'hit', lane: 1, grade: 'perfect', perfectHits: 999, combo: 999 });
  assert.equal(state.judgements[1], 'good');
  assert.equal(state.perfectHits, 1);
  assert.equal(state.goodHits, 1);
  assert.equal(state.combo, 1);
  assert.equal(state.missRate, 0);
  assert.equal(state.status, 'passed');
});

test('feedback retains the latest 32 unique sequential events and freezes after terminal scoring', () => {
  const { game, advance } = controlled();
  game.action({ action: 'start-rhythm' });
  game.chart = { ...game.chart, hitWindowMs: 160, notes: [{ id: 0, lane: 0, timeMs: 1000 }] };
  for (let i = 0; i < 40; i++) game.action({ action: 'hit', lane: i % 2 });
  assert.equal(game.feedback.length, 32);
  assert.deepEqual(game.feedback.map(event => event.id), Array.from({ length: 32 }, (_, index) => index + 9));
  assert.equal(game.misses, 0);
  advance(1000);
  game.action({ action: 'hit', lane: 0 });
  assert.equal(game.feedback.length, 32);
  assert.equal(game.feedback[0].id, 10);
  assert.equal(game.feedback.at(-1).id, 41);
  assert.equal(game.feedback.at(-1).grade, 'perfect');
  game.action({ action: 'hit', lane: 0 });
  advance(2000);
  assert.equal(game.feedback.at(-1).id, 41);
  assert.equal(game.misses, 0);
});

test('quiz fails on second wrong answer, three answers with one wrong pass', async () => {
  for (const answers of [[false, false], [true, false, true]]) {
    const { game } = controlled();
    game.action({ action: 'start-quiz', subject: 'math' });
    for (const correct of answers) {
      const question = game.questions[game.questionIndex];
      game.action({ action: 'answer', questionId: question.id, answerIndex: correct ? question.answerIndex : (question.answerIndex + 1) % question.options.length });
    }
    assert.equal((await game.done).status, answers.length === 2 ? 'failed' : 'passed');
    assert.equal(game.snapshot().question, undefined);
  }
});

test('duplicate answers, wrong lanes, score spoofing and switching mode are rejected', () => {
  const { game } = controlled();
  const state = game.action({ action: 'start-quiz', subject: 'math' });
  assert.equal(Object.hasOwn(state.question, 'answerIndex'), false);
  const question = game.questions[0];
  game.action({ action: 'answer', questionId: question.id, answerIndex: question.answerIndex });
  assert.throws(() => game.action({ action: 'answer', questionId: question.id, answerIndex: 0 }), /重复提交/);
  assert.throws(() => game.action({ action: 'start-rhythm' }));
  assert.throws(() => game.action({ action: 'passed', score: 100 }));
});

test('exit, lost heartbeat and cancellation all settle; successful game cannot be overwritten', async () => {
  const exit = controlled();
  exit.game.action({ action: 'exit' });
  assert.equal((await exit.game.done).reply, EXIT_REPLY);
  const lost = controlled();
  lost.game.seen();
  lost.advance(8001);
  assert.equal((await lost.game.done).reply, EXIT_REPLY);
  const signal = new AbortController();
  const cancelled = new Challenge(metrics(), { signal: signal.signal });
  signal.abort();
  assert.equal((await cancelled.done).status, 'cancelled');
  const done = controlled();
  done.game.finish('passed');
  done.game.action({ action: 'exit' });
  assert.equal(done.game.status, 'passed');
});

test('choice deadline applies only to the choice page, leaving hard questions and active rhythm to heartbeat checks', () => {
  const chooser = controlled({ chooseTimeoutMs: 1000 });
  chooser.advance(1001);
  assert.equal(chooser.game.status, 'exited');
  for (const action of [{ action: 'start-rhythm' }, { action: 'start-quiz', subject: 'math' }]) {
    const f = controlled({ chooseTimeoutMs: 1000, disconnectMs: 5000 });
    f.advance(800); f.game.action(action); f.advance(1500);
    assert.equal(f.game.status, action.action === 'start-rhythm' ? 'rhythm' : 'quiz');
    f.advance(5801); assert.equal(f.game.status, 'exited');
  }
});

test('code bubbles carry sequence IDs and timestamps, cap content and retain only the latest 16', () => {
  const { game, advance } = controlled();
  assert.equal(game.snapshot().activity, 'challenge');
  assert.deepEqual(game.snapshot().bubbles, []);
  advance(73);
  const first = game.publishBubble('x'.repeat(2500));
  assert.deepEqual(first, { id: 1, text: 'x'.repeat(2000), kind: 'code', timestamp: 73 });
  for (let i = 0; i < 20; i++) game.publishBubble(`part ${i}`, 'code');
  const state = game.snapshot();
  assert.equal(state.bubbles.length, 16);
  assert.equal(state.bubbles[0].id, 6);
  assert.equal(state.bubbles.at(-1).id, 21);
  assert.throws(() => game.publishBubble({ source: 'no' }), /文本/);
  assert.throws(() => game.setActivity('unknown'), /活动/);
  game.nextUrl = 'http://127.0.0.1/next';
  assert.equal(game.snapshot().nextUrl, game.nextUrl);
});

test('exiting passed generation cancels the host once while keeping settled scoring immutable', async () => {
  let exits = 0;
  const { game } = controlled({ onExit: () => { exits++; } });
  game.finish('passed');
  const result = await game.done;
  game.setActivity('generating');
  const state = game.action({ action: 'exit' });
  game.action({ action: 'exit' });
  assert.equal(exits, 1);
  assert.equal(state.status, 'passed');
  assert.equal(state.activity, 'finished');
  assert.equal(state.reply, EXIT_REPLY);
  assert.equal(state.bubbles.at(-1).text, EXIT_REPLY);
  assert.equal(state.bubbles.at(-1).kind, 'reply');
  assert.deepEqual(result, { status: 'passed', reply: '' });
  assert.deepEqual(await game.done, result);
});

test('passed generation disconnect cancels host, but finished and superseded views do not', () => {
  for (const state of ['generating', 'finished', 'superseded']) {
    let exits = 0;
    const { game, advance } = controlled({ onExit: () => { exits++; } });
    game.finish('passed');
    game.seen();
    game.setActivity(state === 'finished' ? 'finished' : 'generating');
    if (state === 'superseded') game.nextUrl = 'http://127.0.0.1/next';
    advance(8001);
    if (state === 'generating') {
      assert.equal(exits, 1);
      assert.equal(game.activity, 'finished');
    } else {
      game.action({ action: 'exit' });
      assert.equal(exits, 0);
    }
    assert.equal(game.status, 'passed');
  }
});

test('HTTP bridge authenticates per challenge, checks origin, hides answers and isolates sessions', async t => {
  const bridge = await createBridge();
  t.after(() => bridge.close());
  const first = bridge.createChallenge(metrics());
  const second = bridge.createChallenge(metrics());
  const action = (game, body, headers = {}) => fetch(`${bridge.origin}/api/action?token=${game.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await fetch(`${bridge.origin}/api/state?token=bogus`)).status, 404);
  assert.equal((await action(first, { action: 'exit' }, { Origin: 'https://attacker.invalid' })).status, 403);
  const state = await (await action(first, { action: 'start-quiz', subject: 'physics' })).json();
  assert.equal(JSON.stringify(state).includes('answerIndex'), false);
  const questions = generateQuiz('physics', state.metrics, first.token);
  for (const q of questions) await action(first, { action: 'answer', questionId: q.id, answerIndex: q.answerIndex });
  assert.equal((await first.done).status, 'passed');
  assert.equal(second.status, 'choose');
  assert.equal((await fetch(bridge.origin)).status, 404);
  const native = await (await fetch(first.url)).json();
  assert.equal(native.client, 'native-wpf');
  assert.equal((await fetch(`${bridge.origin}/app.js`)).status, 404);
});

test('HTTP polling keeps passed sessions alive and delivers code bubbles; exit calls the host', async t => {
  const bridge = await createBridge();
  t.after(() => bridge.close());
  let exits = 0;
  const game = bridge.createChallenge(metrics(), { onExit: () => { exits++; } });
  game.finish('passed');
  game.setActivity('generating');
  game.publishBubble('const answer = 42;');
  const state = await (await fetch(`${bridge.origin}/api/state?token=${game.token}`)).json();
  assert.equal(state.activity, 'generating');
  assert.equal(state.status, 'passed');
  assert.equal(state.bubbles[0].text, 'const answer = 42;');
  const response = await fetch(`${bridge.origin}/api/action?token=${game.token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'exit' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).activity, 'finished');
  assert.equal(exits, 1);
});

test('native controller starts disabled, switches only on boolean changes, and isolates callback errors', async () => {
  const changes = [];
  const controller = new NativeController({ onEnabledChange: enabled => { changes.push(enabled); return Promise.reject(new Error('host unavailable')); } });
  assert.equal(controller.enabled, false);
  assert.deepEqual(controller.snapshot().currentUrl, null);
  controller.setEnabled(false);
  controller.setEnabled(true);
  controller.setEnabled(true);
  controller.setEnabled(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(changes, [true, false]);
  assert.throws(() => controller.setEnabled('true'), /布尔/);
  assert.throws(() => new NativeController({ initialEnabled: 1 }), /布尔/);
  const throwing = new NativeController({ onEnabledChange() { throw new Error('callback failure'); } });
  assert.doesNotThrow(() => throwing.setEnabled(true));
  assert.equal(throwing.enabled, true);
});

test('controller heartbeat is independent, ignores an unseen client, and disables once on disconnect', () => {
  let time = 0;
  const changes = [];
  const controller = new NativeController({ initialEnabled: true, disconnectMs: 8000, clock: () => time, now: () => 12345, onEnabledChange: enabled => changes.push(enabled) });
  time = 100000;
  controller.tick();
  assert.equal(controller.enabled, true, 'No disconnect before the first client poll');
  controller.seen();
  time += 8000;
  controller.tick();
  assert.equal(controller.enabled, true);
  time++;
  controller.tick();
  controller.tick();
  assert.deepEqual(changes, [false]);
  assert.equal(controller.snapshot().serverNow, 12345);
  controller.action({ action: 'set-enabled', enabled: true });
  controller.tick();
  assert.equal(controller.enabled, true, 'An explicit switch is a fresh heartbeat');
});

test('HTTP controller has its own token and state, remains available, and leaves challenge ownership to host', async t => {
  const changes = [];
  const bridge = await createBridge({ onEnabledChange: enabled => changes.push(enabled) });
  t.after(() => bridge.close());
  const { controller } = bridge;
  const game = bridge.createChallenge(metrics());
  assert.notEqual(controller.token, game.token);
  assert.match(controller.token, /^[a-f0-9]{64}$/);
  assert.equal(new URL(controller.url).searchParams.get('token'), controller.token);
  const stateUrl = `${bridge.origin}/api/state?token=${controller.token}`;
  let state = await (await fetch(stateUrl)).json();
  assert.deepEqual(Object.keys(state).sort(), ['client', 'currentUrl', 'enabled', 'revision', 'serverNow'].sort());
  assert.equal(state.client, 'native-controller');
  assert.equal(state.enabled, false);
  assert.equal(state.currentUrl, null);
  controller.setCurrent(game);
  state = await (await fetch(stateUrl)).json();
  assert.equal(state.currentUrl, game.url);
  const action = async (token, body, headers = {}) => fetch(`${bridge.origin}/api/action?token=${token}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const switched = await action(controller.token, { action: 'set-enabled', enabled: true });
  assert.equal(switched.status, 200);
  assert.equal((await switched.json()).enabled, true);
  assert.equal((await action(game.token, { action: 'set-enabled', enabled: false })).status, 400);
  assert.equal(controller.enabled, true, 'A challenge token cannot control the switch');
  assert.equal((await action(controller.token, { action: 'start-quiz', subject: 'math' })).status, 400);
  controller.setEnabled(false);
  assert.equal(game.status, 'choose', 'Only the host decides whether switching off cancels a challenge');
  controller.setCurrent(null);
  assert.equal((await (await fetch(stateUrl)).json()).currentUrl, null);
  assert.deepEqual(changes, [true, false]);
  assert.equal((await (await fetch(controller.url)).json()).client, 'native-controller');
  assert.equal((await fetch(`${bridge.origin}/api/state?token=invalid-controller`)).status, 404);
});

test('controller snapshots order a same-millisecond toggle after the preceding poll', () => {
  const controller = new NativeController({ now: () => 1234 });
  const old = controller.snapshot();
  const changed = controller.action({ action: 'set-enabled', enabled: true });
  assert.equal(old.serverNow, changed.serverNow);
  assert.ok(changed.revision > old.revision);
  assert.equal(old.enabled, false); assert.equal(changed.enabled, true);
});

test('HTTP controller rejects invalid values and cross-origin writes without opening CORS', async t => {
  const bridge = await createBridge();
  t.after(() => bridge.close());
  const { controller } = bridge;
  const action = (body, headers = {}) => fetch(`${bridge.origin}/api/action?token=${controller.token}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  for (const enabled of [undefined, 'true', 1, 0, null, [], {}]) {
    assert.equal((await action({ action: 'set-enabled', enabled })).status, 400);
    assert.equal(controller.enabled, false);
  }
  assert.equal((await action({ action: 'set-enabled', enabled: true }, { origin: 'https://attacker.invalid' })).status, 403);
  assert.equal(controller.enabled, false);
  const state = await fetch(`${bridge.origin}/api/state?token=${controller.token}`, { headers: { origin: 'https://attacker.invalid' } });
  assert.equal(state.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(`${bridge.origin}/api/action?token=${controller.token}`, { method: 'OPTIONS', headers: { origin: 'https://attacker.invalid' } })).status, 404);
  await assert.rejects(createBridge({ initialEnabled: 'yes' }), /布尔/);
});
