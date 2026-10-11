/**
 * Optional Windows native-dialog integration smoke. Starts the original WPF client
 * against a local test bridge; no model, API key or project files are used.
 * Run with: node tests/native-dialog-smoke.mjs
 * The test creates and cleans up its own window and localhost server.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createBridge } from '../src/bridge.mjs';
import { analyzeCode, generateQuiz, EXIT_REPLY } from '../src/core.mjs';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(condition, label, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (condition()) return;
    await sleep(25);
  }
  throw new Error(`Timed out: ${label}`);
}

let game;
let exits = 0;
let child;
let trace = '';
let exited = false;
const disconnectMs = 1500;
const bridge = await createBridge({
  disconnectMs, chooseTimeoutMs: 30000,
  onEnabledChange(enabled) { if (!enabled && game) game.action({ action: 'exit' }); },
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

try {
  assert.equal(bridge.controller.enabled, false);
  assert.equal(bridge.controller.currentUrl, null);
  const script = fileURLToPath(new URL('../desktop/overlay.ps1', import.meta.url));
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  child = spawn(executable, ['-NoProfile', '-STA', '-File', script, '-Url', bridge.controller.url, '-TraceStartup'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', bytes => { trace = (trace + bytes.toString()).slice(-5000); });
  child.stderr.on('data', bytes => { trace = (trace + bytes.toString()).slice(-5000); });
  child.on('exit', () => { exited = true; });
  await waitFor(() => bridge.controller.lastSeen !== undefined || exited, 'native controller first heartbeat');
  assert.equal(exited, false, trace);
  assert.equal(bridge.controller.enabled, false);
  assert.equal(bridge.controller.currentUrl, null);

  await action(bridge.controller.url, { action: 'set-enabled', enabled: true });
  await sleep(500);
  assert.equal(bridge.controller.enabled, true);
  assert.equal(bridge.controller.currentUrl, null, 'Enabling alone must not create a challenge');
  game = bridge.createChallenge(analyzeCode('const add = (a, b) => a + b;'), { onExit() { exits++; } });
  bridge.controller.setCurrent(game);
  await waitFor(() => game.lastSeen !== undefined || exited, 'native challenge first heartbeat');
  assert.equal(exited, false, trace);
  assert.equal(game.status, 'choose');

  const quiz = await action(game.url, { action: 'start-quiz', subject: 'math' });
  for (const question of generateQuiz('math', quiz.metrics, game.token)) {
    await action(game.url, { action: 'answer', questionId: question.id, answerIndex: question.answerIndex });
  }
  assert.equal((await game.done).status, 'passed');
  game.setActivity('generating');
  const before = game.lastSeen;
  await sleep(disconnectMs + 1000);
  assert.equal(game.status, 'passed');
  assert.equal(game.activity, 'generating', 'Hiding a passed dialog must retain background generation');
  assert.equal(game.exitRequested, false);
  assert.equal(exits, 0, 'Normal terminal hiding must not signal user exit');
  assert.ok(game.lastSeen > before + disconnectMs, 'Hidden challenge must continue its own heartbeat');
  assert.equal(bridge.controller.enabled, true);

  await action(bridge.controller.url, { action: 'set-enabled', enabled: false });
  await sleep(150);
  assert.equal(game.exitRequested, true);
  assert.equal(game.activity, 'finished');
  assert.equal(game.reply, EXIT_REPLY);
  assert.equal(exits, 1);
  await action(bridge.controller.url, { action: 'set-enabled', enabled: false });
  await action(game.url, { action: 'exit' });
  assert.equal(exits, 1, 'Repeated disable and exit must remain idempotent');
  console.log(JSON.stringify({
    result: 'PASS', defaultUnchecked: true, checkingDoesNotStartTask: true,
    passedHiddenHeartbeatMs: disconnectMs + 1000, normalHideExitCalls: 0,
    explicitDisableExitCalls: exits, exactExitReply: game.reply === EXIT_REPLY,
  }));
} catch (error) {
  console.error(trace.trim());
  throw error;
} finally {
  if (game?.status === 'passed') game.setActivity('finished');
  bridge.controller.setEnabled(false);
  child?.kill();
  if (child && !exited) await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(2000)]);
  await bridge.close();
}
