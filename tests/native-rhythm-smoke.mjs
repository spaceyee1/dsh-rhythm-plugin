/**
 * Optional Windows rhythm integration check using the real original WPF client
 * and a localhost bridge. No external model, API key or project files are used.
 * Run: node tests/native-rhythm-smoke.mjs
 * The short fixture chart exercises timing, feedback, heartbeat and handoff;
 * the test cleans up its own native process and bridge on completion or failure.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

if (process.platform !== 'win32') throw new Error('Native rhythm verification requires Windows PowerShell/WPF.');
const candidates = [new URL('../outputs/dsh-code-arcade/', import.meta.url), new URL('../', import.meta.url)];
const packageRoot = candidates.find(candidate => existsSync(fileURLToPath(new URL('src/bridge.mjs', candidate))));
if (!packageRoot) throw new Error('Cannot locate the original Code Arcade package.');
const { createBridge } = await import(new URL('src/bridge.mjs', packageRoot));
const { analyzeCode, FAILURE_REPLY } = await import(new URL('src/core.mjs', packageRoot));

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(condition, label, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (condition()) return;
    await sleep(20);
  }
  throw new Error(`Timed out: ${label}`);
}
async function waitElapsed(game, target) {
  while (true) {
    const remaining = target - (game.clock() - game.started);
    if (remaining <= 0) return;
    await sleep(Math.min(20, remaining));
  }
}

let child;
let exited = false;
let trace = '';
let current;
let exitCalls = 0;
const games = [];
const disconnectMs = 1500;
const bridge = await createBridge({
  disconnectMs, chooseTimeoutMs: 30000,
  onEnabledChange(enabled) { if (!enabled && current) current.action({ action: 'exit' }); },
});
const action = async (url, payload) => {
  const target = new URL(url);
  const response = await fetch(`${target.origin}/api/action${target.search}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
};
const create = id => {
  if (current) {
    if (current.status === 'passed') current.setActivity('finished');
    else if (current.status === 'choose') current.finish('cancelled');
  }
  const game = bridge.createChallenge(analyzeCode('const add = (a, b) => a + b;'), { id, onExit() { exitCalls++; } });
  if (current) current.nextUrl = game.url;
  current = game;
  games.push(game);
  bridge.controller.setCurrent(game);
  return game;
};
const startShort = game => {
  // A short original fixture chart exercises the production timing protocol.
  game.action({ action: 'start-rhythm' });
  game.chart.notes = [
    { id: 0, lane: 0, timeMs: 2500 },
    { id: 1, lane: 1, timeMs: 3200 },
    { id: 2, lane: 0, timeMs: 3900 },
  ].map(note => ({ ...note, type: 'tap', durationMs: 0, endTimeMs: note.timeMs }));
  game.chart.introMs = 2500;
  game.chart.perfectWindowMs = 50;
  game.chart.hitWindowMs = 158;
  game.chart.durationMs = 4400;
};
async function pass(game, handoff) {
  startShort(game);
  const grades = [];
  for (const [index, offset] of [[0, 0], [1, 90], [2, 0]]) {
    const note = game.chart.notes[index];
    await waitElapsed(game, note.timeMs + offset);
    const state = await action(game.url, { action: 'hit', lane: note.lane });
    grades.push(state.feedback.at(-1).grade);
  }
  assert.deepEqual(grades, ['perfect', 'good', 'perfect']);
  assert.equal(game.status, 'passed');
  assert.equal(game.combo, 3);
  assert.equal(game.maxCombo, 3);
  assert.equal(game.perfectHits, 2);
  assert.equal(game.goodHits, 1);
  assert.equal(game.feedback.at(-1).id, 3);
  assert.equal(game.feedback.at(-1).grade, 'perfect', 'Terminal state retains the final judgement');
  game.setActivity('generating');
  return handoff?.();
}

try {
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = fileURLToPath(new URL('desktop/overlay.ps1', packageRoot));
  child = spawn(executable, ['-NoProfile', '-STA', '-File', script, '-Url', bridge.controller.url, '-TraceStartup'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', bytes => { trace = (trace + bytes.toString()).slice(-30000); });
  child.stderr.on('data', bytes => { trace = (trace + bytes.toString()).slice(-30000); });
  child.on('exit', () => { exited = true; });
  await waitFor(() => bridge.controller.lastSeen !== undefined || exited, 'native controller first heartbeat');
  assert.equal(exited, false, trace);
  assert.equal(bridge.controller.enabled, false);
  assert.equal(bridge.controller.currentUrl, null);
  await action(bridge.controller.url, { action: 'set-enabled', enabled: true });
  await sleep(350);
  assert.equal(bridge.controller.currentUrl, null, 'Checking alone does not start a task');

  const first = create('native-rhythm-pass');
  await waitFor(() => first.lastSeen !== undefined || exited, 'first real challenge heartbeat');
  assert.equal(exited, false, trace);
  await pass(first);
  const before = first.lastSeen;
  await sleep(disconnectMs + 1000);
  assert.equal(first.activity, 'generating');
  assert.equal(first.exitRequested, false);
  assert.equal(exitCalls, 0);
  assert.ok(first.lastSeen > before + disconnectMs, 'Hidden successful rhythm keeps its own heartbeat');

  const second = create('native-rhythm-handoff');
  await waitFor(() => second.lastSeen !== undefined || exited, 'handoff challenge heartbeat');
  assert.equal(exited, false, trace);
  const third = await pass(second, () => create('native-rhythm-after-handoff'));
  await waitFor(() => third.lastSeen !== undefined || exited, 'next queued challenge heartbeat');
  assert.equal(exited, false, trace);
  await sleep(750);

  const missed = create('native-rhythm-miss');
  await waitFor(() => missed.lastSeen !== undefined || exited, 'failure challenge heartbeat');
  assert.equal(exited, false, trace);
  startShort(missed);
  await waitFor(() => missed.status === 'failed' || exited, 'automatic MISS failure', 6000);
  assert.equal(exited, false, trace);
  assert.equal(missed.reply, FAILURE_REPLY);
  assert.equal(missed.feedback.at(-1).grade, 'miss');
  assert.equal(missed.feedback.at(-1).counted, true);
  await sleep(900);
  const lastSeen = missed.lastSeen;
  await sleep(400);
  assert.equal(missed.lastSeen, lastSeen, 'Finished failed game stops its own polling');
  assert.equal(bridge.controller.enabled, true, 'Failure does not destroy the persistent switch');

  await action(bridge.controller.url, { action: 'set-enabled', enabled: false });
  assert.equal(bridge.controller.enabled, false);
  const dispatched = [...trace.matchAll(/feedback game=(\S+) seq=(\d+) grade=(\S+) combo=(\d+)/g)].map(match => ({
    game: match[1], id: Number(match[2]), grade: match[3], combo: Number(match[4]),
  }));
  for (const id of ['native-rhythm-pass', 'native-rhythm-handoff']) {
    assert.deepEqual(dispatched.filter(event => event.game === id).map(({ id: eventId, grade, combo }) => [eventId, grade, combo]), [
      [1, 'perfect', 1], [2, 'good', 2], [3, 'perfect', 3],
    ], `${id}: each feedback dispatches exactly once despite repeated polls`);
    const finalFeedback = trace.indexOf(`feedback game=${id} seq=3 grade=perfect combo=3`);
    const scheduled = trace.indexOf(`terminal-hide-scheduled game=${id}`);
    const hidden = trace.indexOf('terminal-hidden', scheduled);
    assert.ok(finalFeedback >= 0 && finalFeedback < scheduled && scheduled < hidden, `${id}: final feedback precedes delayed hide, including immediate FIFO handoff`);
  }
  assert.deepEqual(dispatched.filter(event => event.game === 'native-rhythm-miss').map(({ id, grade, combo }) => [id, grade, combo]), [[1, 'miss', 0]]);
  const missFeedback = trace.indexOf('feedback game=native-rhythm-miss seq=1 grade=miss combo=0');
  const missScheduled = trace.indexOf('terminal-hide-scheduled game=native-rhythm-miss');
  assert.ok(missFeedback >= 0 && missFeedback < missScheduled && missScheduled < trace.indexOf('terminal-hidden', missScheduled), 'Failing MISS feedback precedes delayed hide');
  console.log(JSON.stringify({
    result: 'PASS', grades: ['PERFECT', 'GOOD', 'PERFECT'], combo: 3,
    terminalFeedbackPreserved: true, successfulHiddenHeartbeatMs: disconnectMs + 1000,
    immediateNextChallengeHandoff: true, automaticMissFailure: true,
    exactlyOnceFeedbackDispatches: dispatched.length, finalFeedbackBeforeDelayedHide: true,
    finishedGameStopsPolling: true, normalExitCallbacks: exitCalls,
  }));
  console.log(trace.trim());
} catch (error) {
  console.error(trace.trim());
  throw error;
} finally {
  for (const game of games) {
    if (game.status === 'passed') game.setActivity('finished');
    else game.finish('cancelled');
  }
  bridge.controller.setEnabled(false);
  child?.kill();
  if (child && !exited) await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(2000)]);
  await bridge.close();
}
