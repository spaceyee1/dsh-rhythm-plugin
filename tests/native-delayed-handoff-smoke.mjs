/**
 * Original local-only Windows smoke for a 2300ms delayed terminal response.
 * No model or user project files are used. Cleans up its own process and server.
 * Run: node tests/native-delayed-handoff-smoke.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

if (process.platform !== 'win32') throw new Error('This smoke requires Windows PowerShell/WPF.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return; await sleep(20); }
  throw new Error(`Timeout: ${label}`);
}
let child, port, trace = '', exited = false, oldRequests = 0;
let oldPassed = false, nextSelected = false, terminalDeliveryAt = 0, successorRequestAt = 0;
const tokens = { controller: 'controller1234567890', old: 'oldchallenge1234567890', next: 'newchallenge1234567890' };
const urlFor = token => `http://127.0.0.1:${port}/?token=${token}`;
const startAt = Date.now();
const metrics = { lines: 1, complexity: 6, level: 1 };
const chart = { bpm: 120, durationMs: 10000, hitWindowMs: 158, notes: [{ id: 0, lane: 0, timeMs: 2500 }] };
function gameState(id, status, feedback = []) {
  return { id, status, activity: status === 'passed' ? 'finished' : 'challenge', serverNow: Date.now(), startAt,
    metrics, chart, subjects: [], judgements: {}, hits: feedback.length, misses: 0, totalNotes: 1, missRate: 0,
    combo: feedback.length, perfectHits: feedback.length, goodHits: 0, feedback, nextUrl: null };
}
const server = createServer((request, response) => {
  const token = new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get('token');
  const send = state => { if (response.destroyed) return; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(state)); };
  if (token === tokens.controller) {
    send({ client: 'native-controller', enabled: true, serverNow: Date.now(), currentUrl: urlFor(nextSelected ? tokens.next : tokens.old) });
  } else if (token === tokens.old) {
    oldRequests++;
    if (oldPassed) {
      nextSelected = true;
      const state = gameState('delayed-old', 'passed', [{ id: 1, lane: 0, noteId: 0, grade: 'perfect', offsetMs: 0, source: 'hit', counted: true, combo: 1, at: Date.now() }]);
      setTimeout(() => { terminalDeliveryAt = Date.now(); send(state); }, 2300).unref();
    } else send(gameState('delayed-old', 'rhythm'));
  } else if (token === tokens.next) {
    successorRequestAt ||= Date.now(); send(gameState('delayed-successor', 'choose'));
  } else { response.statusCode = 404; response.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
port = server.address().port;
try {
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = fileURLToPath(new URL('../desktop/overlay.ps1', import.meta.url));
  child = spawn(executable, ['-NoProfile', '-STA', '-File', script, '-Url', urlFor(tokens.controller), '-TraceStartup'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { trace += data.toString(); });
  child.stderr.on('data', data => { trace += data.toString(); });
  child.on('exit', () => { exited = true; });
  await waitFor(() => oldRequests >= 2 || exited, 'native accepted old rhythm');
  assert.equal(exited, false, trace);
  oldPassed = true;
  await waitFor(() => successorRequestAt && terminalDeliveryAt || exited, 'delayed terminal delivery and successor');
  assert.equal(exited, false, trace);
  await sleep(300);
  assert.ok(successorRequestAt > terminalDeliveryAt, 'Successor must wait for delayed terminal response');
  assert.ok(trace.includes('feedback game=delayed-old seq=1'), 'Delayed old terminal feedback must render');
  console.log(JSON.stringify({ result: 'PASS', oldResponseDelayMs: 2300, successorLoadedBeforeOldTerminalDelivery: successorRequestAt < terminalDeliveryAt,
    successorLeadMs: terminalDeliveryAt - successorRequestAt,
    oldTerminalFeedbackWasRendered: trace.includes('feedback game=delayed-old seq=1'), trace }));
} finally {
  child?.kill();
  if (child && !exited) await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(2000)]);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
