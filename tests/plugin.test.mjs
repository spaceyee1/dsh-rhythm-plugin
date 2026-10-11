import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, codeFromChunks, taskText } from '../src/plugin.mjs';
import { generateQuiz, analyzeCode, FAILURE_REPLY, EXIT_REPLY } from '../src/core.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('first challenge estimates the latest user request rather than unrelated system and assistant history', () => {
  const content = text => [{ type: 'text', text }];
  assert.equal(taskText([
    { role: 'system', content: content('数据库认证并发'.repeat(1000)) },
    { role: 'user', content: content('写一个分布式事务数据库') },
    { role: 'assistant', content: content('if(x){for(;;){run()}}'.repeat(1000)) },
    { role: 'user', content: content('写一个加法函数') },
  ]), '写一个加法函数');
  assert.equal(taskText([{ content: content('legacy user request') }]), 'legacy user request');
  assert.equal(taskText([{ role: 'system', content: content('internal') }]), '');
});
async function harness(t, config = {}) {
  const handlers = new Map();
  const links = [];
  let controlUrl;
  const cleanup = [];
  const agent = { id: 'session-A', inbox: { clear() { agent.cleared = true; } } };
  const ctx = {
    agents: { currentInitiator: () => agent, list: () => [agent], isOwnedBy: () => false },
    logger: { info: line => {
      if (line.startsWith('[Code Arcade]')) links.push(line.split(' ').at(-1));
      if (line.startsWith('[Code Arcade Control]')) controlUrl = new URL(line.split(' ').at(-1));
    }, warn() {} },
    on: (name, fn) => handlers.set(name, fn), effect: fn => cleanup.push(fn()),
  };
  await apply(ctx, { openOverlay: false, initialEnabled: true, ...config });
  t.after(async () => { for (const clean of cleanup) await clean(); });
  async function waitLink(index = 0) {
    for (let i = 0; i < 200 && !links[index]; i++) await sleep(5);
    assert.ok(links[index], 'challenge URL should be available');
    const url = new URL(links[index]);
    const token = url.searchParams.get('token');
    const state = () => fetch(`${url.origin}/api/state?token=${token}`).then(r => r.json());
    const action = body => fetch(`${url.origin}/api/action?token=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    return { token, state, action };
  }
  async function answer(game, pass) {
    const state = await game.action({ action: 'start-quiz', subject: 'math' });
    const questions = generateQuiz('math', state.metrics, game.token);
    for (const q of questions.slice(0, pass ? 3 : 2)) await game.action({ action: 'answer', questionId: q.id, answerIndex: pass ? q.answerIndex : (q.answerIndex + 1) % q.options.length });
  }
  function preStep(turn = 1, signal = new AbortController().signal) {
    return handlers.get('agent/pre-step')({ agent, messages: [{ content: [{ type: 'text', text: '写一个加法函数' }] }], turn, step: 0, signal }, async () => ({ kind: 'enter' }));
  }
  const control = {
    state: () => fetch(`${controlUrl.origin}/api/state${controlUrl.search}`).then(response => response.json()),
    set: enabled => fetch(`${controlUrl.origin}/api/action${controlUrl.search}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-enabled', enabled }) }).then(response => response.json()),
  };
  return { ctx, handlers, agent, waitLink, answer, preStep, control, links };
}

function upstreamTool(code) {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'tool-1', name: 'write_file', arguments: JSON.stringify({ path: 'out.js', content: code }) } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ];
}
const replyOf = chunks => chunks.filter(c => c.type === 'text-delta').map(c => c.text).join('');

test('unchecked passes Harness output unchanged; checking only gates the next coding step', async t => {
  const h = await harness(t, { initialEnabled: false });
  assert.equal((await h.control.state()).enabled, false);
  assert.deepEqual(await h.preStep(), { kind: 'enter' });
  const original = upstreamTool('const originalHarnessCode = true;');
  const output = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => original));
  assert.deepEqual(output, original);
  assert.equal(h.links.length, 0);
  await h.control.set(true);
  assert.equal(h.links.length, 0, 'Checkbox must never invoke the model or create a task');
  // The already admitted step remains untouched even if enabled midway through its stream.
  assert.deepEqual(await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => original)), original);
  const admission = h.preStep();
  const game = await h.waitLink();
  await h.control.set(false);
  await admission;
  assert.equal((await h.control.state()).currentUrl, null);
  assert.equal((await game.state()).status, 'exited');
  let calls = 0;
  const refused = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => { calls++; return original; }));
  assert.equal(calls, 0);
  assert.equal(replyOf(refused), EXIT_REPLY);
  assert.deepEqual(await h.preStep(2), { kind: 'enter' });
  assert.deepEqual(await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => original)), original);
});

test('unchecking during live generation aborts the provider and emits only the local exit reply', async t => {
  const h = await harness(t);
  const abort = new AbortController();
  const followups = [];
  h.agent.cancel = () => abort.abort();
  h.agent.followup = message => followups.push(message);
  const admission = h.preStep(1, abort.signal);
  const game = await h.waitLink();
  await h.answer(game, true);
  await admission;
  const ready = Promise.withResolvers();
  let upstreamClosed = false;
  const output = Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A', signal: abort.signal }, async function* () {
    try {
      yield upstreamTool('const privateDraft = true;')[1];
      ready.resolve();
      await new Promise(resolve => abort.signal.addEventListener('abort', resolve, { once: true }));
    } finally { upstreamClosed = true; }
  }));
  await ready.promise;
  await h.control.set(false);
  assert.deepEqual(await output, []);
  assert.equal(upstreamClosed, true);
  assert.equal(abort.signal.aborted, true);
  assert.equal(followups.length, 1);
  await h.control.set(false);
  assert.equal(followups.length, 1);
  const nextSignal = new AbortController().signal;
  await h.handlers.get('agent/pre-step')({ agent: h.agent, turn: 2, signal: nextSignal, messages: followups }, async () => ({ kind: 'enter' }));
  let calls = 0;
  const refused = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A', signal: nextSignal }, () => { calls++; return []; }));
  assert.equal(calls, 0);
  assert.equal(replyOf(refused), EXIT_REPLY);
  assert.equal((await game.state()).bubbles.some(bubble => bubble.kind === 'code'), false);
});

test('initial two wrong answers or exit emits exact refusal and never calls the coding provider', async t => {
  for (const mode of ['failed', 'exited']) {
    const h = await harness(t);
    const admission = h.preStep();
    const game = await h.waitLink();
    if (mode === 'failed') await h.answer(game, false);
    else await game.action({ action: 'exit' });
    await admission;
    let calls = 0;
    const chunks = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => { calls++; return upstreamTool('function secret() {}'); }));
    assert.equal(calls, 0);
    assert.equal(replyOf(chunks), mode === 'failed' ? FAILURE_REPLY : EXIT_REPLY);
    assert.equal(chunks.some(c => c.block?.type === 'tool-call'), false);
    assert.equal(h.agent.cleared, true);
    assert.deepEqual(await h.preStep(), { kind: 'reject' });
  }
});

test('passing challenge releases a small original tool call unchanged', async t => {
  const h = await harness(t);
  const admission = h.preStep();
  await h.answer(await h.waitLink(), true);
  await admission;
  const original = upstreamTool('const sum = (a,b) => a+b;');
  const chunks = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => original));
  assert.deepEqual(chunks, original);
  assert.equal((await (await h.waitLink()).state()).bubbles.filter(bubble => bubble.kind === 'code').length, 0, 'Generated code is delivered only to Harness, without extra desktop bubbles');
});

test('larger real code opens a second gate; failure publishes no original code or tools', async t => {
  const h = await harness(t);
  const admission = h.preStep();
  await h.answer(await h.waitLink(), true);
  await admission;
  const original = upstreamTool(Array.from({ length: 200 }, (_, i) => `if (x${i}) { console.log(${i}); }`).join('\n'));
  const output = Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => original));
  const second = await h.waitLink(1);
  assert.equal((await second.state()).metrics.estimated, undefined);
  await h.answer(second, false);
  const chunks = await output;
  assert.equal(replyOf(chunks), FAILURE_REPLY);
  assert.equal(chunks.some(c => c.block?.type === 'tool-call'), false);
  assert.equal(JSON.stringify(chunks).includes('console.log'), false);
  assert.equal((await second.state()).bubbles.some(bubble => bubble.kind === 'code'), false);
});

test('cancelling while waiting rejects admission without opening provider or leaving the game pending', async t => {
  const h = await harness(t);
  const controller = new AbortController();
  const admission = h.preStep(1, controller.signal);
  const game = await h.waitLink();
  controller.abort();
  assert.deepEqual(await admission, { kind: 'reject' });
  assert.equal((await game.state()).status, 'cancelled');
});

test('concurrent challenges wait their turn; a queued cancellation exits without displacing the visible game', async t => {
  const h = await harness(t);
  const first = h.preStep();
  const visible = await h.waitLink();
  const abort = new AbortController();
  const secondAgent = { id: 'session-B', inbox: { clear() {} } };
  const second = h.handlers.get('agent/pre-step')({ agent: secondAgent, messages: [{ content: [{ type: 'text', text: '写一个函数' }] }], turn: 1, signal: abort.signal }, async () => ({ kind: 'enter' }));
  abort.abort();
  const result = await Promise.race([second, sleep(1000).then(() => 'timed-out')]);
  assert.deepEqual(result, { kind: 'reject' });
  assert.equal(h.links.length, 1);
  assert.equal((await visible.state()).status, 'choose');
  await h.control.set(false);
  await first;
});

test('unchecking settles an active and queued independent agent without requiring either signal to abort', async t => {
  const h = await harness(t);
  const signalA = new AbortController().signal;
  const signalB = new AbortController().signal;
  const first = h.preStep(1, signalA);
  await h.waitLink();
  const other = { id: 'session-B', inbox: { clear() {} } };
  h.ctx.agents.list = () => [h.agent, other];
  const second = h.handlers.get('agent/pre-step')({ agent: other, messages: [{ role: 'user', content: [{ type: 'text', text: '写一个函数' }] }], turn: 1, signal: signalB }, async () => ({ kind: 'enter' }));
  await h.control.set(false);
  let timeout;
  const settled = await Promise.race([Promise.all([first, second]), new Promise(resolve => { timeout = setTimeout(() => resolve('timeout'), 1000); })]);
  clearTimeout(timeout);
  assert.notEqual(settled, 'timeout');
  assert.equal(signalA.aborted, false); assert.equal(signalB.aborted, false);
  assert.equal(h.links.length, 1, 'Queued cancellation must not display a new game');
  for (const agent of [h.agent, other]) {
    h.ctx.agents.currentInitiator = () => agent;
    let calls = 0;
    const reply = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: agent.id }, () => { calls++; return []; }));
    assert.equal(calls, 0); assert.equal(replyOf(reply), EXIT_REPLY);
  }
});

test('payload extraction uses finalized blocks once and includes unknown tool names', () => {
  const code = 'if (ready) { run(); }';
  const args = JSON.stringify({ nested: { code } });
  const chunks = [{ type: 'tool-call-delta', index: 0, argumentsDelta: args }, { type: 'block-end', index: 0, block: { type: 'tool-call', name: 'new_custom_executor', arguments: args } }];
  const extracted = codeFromChunks(chunks);
  assert.ok(extracted.includes(code));
  assert.ok(extracted.includes('"nested":') && extracted.includes('"code":'));
  assert.equal(extracted.split(code).length - 1, 1);
});

test('tool accounting retains keys, booleans, null and numbers while decoding each code string once', () => {
  const code = 'if (ready) { save("original_value"); }';
  const payload = { "can't_mask_next_value": code, flags: [true, false, null, 0, 123.5], nested: { ["key".repeat(1000)]: [] } };
  const extracted = codeFromChunks([{ type: 'block-end', index: 0, block: { type: 'tool-call', arguments: JSON.stringify(payload) } }]);
  assert.ok(extracted.includes(`"can't_mask_next_value":\n${code}`));
  assert.ok(extracted.includes('true,\nfalse,\nnull,\n0,\n123.5'));
  assert.ok(extracted.includes('key'.repeat(1000)));
  assert.equal(extracted.split('original_value').length - 1, 1, 'Decoded strings must not also be counted as their full raw JSON');
  assert.equal(analyzeCode(extracted).branches, 1, 'Quoted metadata keys cannot mask the code value or create branches');
  for (const value of [[], {}, true, false, null, 0, 123.5]) {
    const literal = JSON.stringify(value);
    assert.equal(codeFromChunks([{ type: 'block-end', index: 0, block: { type: 'tool-call', arguments: literal } }]), literal);
  }
});

test('large numeric and empty-container tool payloads open a second gate and cannot escape a refusal', async t => {
  for (const value of [12345678, [], {}, [{}, [[]]]]) {
    const h = await harness(t);
    const admission = h.preStep();
    await h.answer(await h.waitLink(), true);
    await admission;
    const argumentsText = JSON.stringify({ path: 'data.json', values: Array(100000).fill(value) });
    const original = [{ type: 'block-end', index: 0, block: { type: 'tool-call', id: 'structured-tool', name: 'write_json', arguments: argumentsText } }, { type: 'finish', reason: { kind: 'tool-calls' } }];
    const output = Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => original));
    const second = await h.waitLink(1);
    assert.ok((await second.state()).metrics.characters >= argumentsText.length - 4);
    await h.answer(second, false);
    const refused = await output;
    assert.equal(replyOf(refused), FAILURE_REPLY);
    assert.equal(refused.some(chunk => chunk.block?.type === 'tool-call'), false);
    assert.equal(JSON.stringify(refused).includes('data.json'), false);
  }
});

test('text accounting includes prose, all fenced bodies and code outside fences', () => {
  const text = '说明文字\n```js\nconst fenced = 1;\n```\nif (unfenced) { run(); }\n~~~python\nwhile ready:\n    save()\n~~~';
  const chunks = [{ type: 'text-delta', index: 0, text }, { type: 'block-end', index: 0, block: { type: 'text', text } }];
  const extracted = codeFromChunks(chunks);
  assert.equal(extracted, text.replace(/`{3,}|~{3,}/g, ''));
  assert.ok(extracted.includes('说明文字'));
  assert.ok(extracted.includes('if (unfenced)'));
  assert.ok(extracted.includes('while ready:'));
  assert.equal(extracted.match(/const fenced/g).length, 1);
});

test('a short fence cannot hide a larger plain-code draft from the second gate', async t => {
  const h = await harness(t);
  const admission = h.preStep();
  await h.answer(await h.waitLink(), true);
  await admission;
  const plainCode = Array.from({ length: 200 }, (_, index) => `if (ready${index}) { save(${index}); }`).join('\n');
  const text = `\`\`\`js\nconst example = 1;\n\`\`\`\n${plainCode}`;
  const original = [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text }, { type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'finish', reason: { kind: 'stop' } }];
  const output = Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => original));
  const second = await h.waitLink(1);
  const state = await second.state();
  assert.ok(state.metrics.lines >= 200);
  assert.ok(state.metrics.branches >= 200);
  await h.answer(second, false);
  const refused = await output;
  assert.equal(replyOf(refused), FAILURE_REPLY);
  assert.equal(JSON.stringify(refused).includes('ready199'), false);
});

test('auxiliary title/compaction calls pass through even when the coding turn is refused', async t => {
  const h = await harness(t);
  const admission = h.preStep();
  await (await h.waitLink()).action({ action: 'exit' });
  await admission;
  const auxiliary = [{ type: 'text-delta', index: 0, text: 'session title' }, { type: 'finish', reason: { kind: 'stop' } }];
  const result = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A', purpose: 'session-title' }, () => auxiliary));
  assert.deepEqual(result, auxiliary);
});

test('refusing a parent cancels all live descendants while leaving unrelated agents alone', async t => {
  const h = await harness(t);
  const cancelled = [];
  const child = { id: 'child', cancel: cause => cancelled.push(['child', cause]) };
  const grandchild = { id: 'grandchild', cancel: cause => cancelled.push(['grandchild', cause]) };
  const unrelated = { id: 'other', cancel: cause => cancelled.push(['other', cause]) };
  h.ctx.agents.list = () => [grandchild, unrelated, h.agent, child];
  h.ctx.agents.isOwnedBy = (id, parent) => id === 'child' && parent === h.agent || id === 'grandchild' && parent === child;
  const admission = h.preStep();
  await (await h.waitLink()).action({ action: 'exit' });
  await admission;
  assert.deepEqual(cancelled.map(([id]) => id).sort(), ['child', 'grandchild']);
  assert.ok(cancelled.every(([, cause]) => cause.kind === 'hook' && cause.reason === EXIT_REPLY));
});

test('real provider failures preserve the retry protocol instead of becoming challenge refusals', async t => {
  const h = await harness(t);
  const admission = h.preStep();
  await h.answer(await h.waitLink(), true);
  await admission;
  const error = [{ type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: 'retry later' } } }];
  assert.deepEqual(await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => error)), error);
});

test('error and aborted attempts expose only known usage and failure metadata, never draft blocks or replay', async t => {
  for (const kind of ['error', 'aborted']) {
    const h = await harness(t);
    const admission = h.preStep();
    await h.answer(await h.waitLink(), true);
    await admission;
    const secret = 'private_unapproved_draft';
    const failure = { code: kind === 'error' ? 'RATE_LIMIT' : 'ABORTED', message: 'retry later', status: 429, providerRetryAfterMs: 1500, requestId: 'request-1', offloadImages: 2 };
    const usage = { inputTokens: 13, outputTokens: 17, totalTokens: 30, cacheReadTokens: 3, cacheWriteTokens: 0, reasoningTokens: 7 };
    const chunks = [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: secret },
      { type: 'block-end', index: 0, block: { type: 'text', text: secret } },
      { type: 'block-start', index: 1, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 1, text: secret },
      { type: 'block-end', index: 1, block: { type: 'reasoning', text: secret } },
      { type: 'block-start', index: 2, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 2, id: 'private-tool', name: 'write_file', argumentsDelta: JSON.stringify({ content: secret }) },
      { type: 'block-end', index: 2, block: { type: 'tool-call', id: 'private-tool', name: 'write_file', arguments: JSON.stringify({ content: secret }) } },
      { type: 'usage', usage: { ...usage, opaqueDraft: secret }, opaqueDraft: secret },
      { type: 'finish', reason: { kind, failure: { ...failure, opaqueDraft: secret } }, replayState: { response: { draft: secret }, blocks: [secret] }, opaqueDraft: secret },
    ];
    const output = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => chunks));
    assert.deepEqual(output, [{ type: 'usage', usage }, { type: 'finish', reason: { kind, failure } }]);
    assert.equal(JSON.stringify(output).includes(secret), false);
    assert.equal(h.links.length, 1);
    const retry = upstreamTool('const acceptedRetry = true;');
    assert.deepEqual(await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => retry)), retry);
  }
});

test('buffer overflow closes upstream iterator and releases only the fixed refusal', async t => {
  const h = await harness(t, { maxBufferedBytes: 4096 });
  const admission = h.preStep();
  await h.answer(await h.waitLink(), true);
  await admission;
  let closed = false;
  async function* draft() {
    try { yield { type: 'text-delta', index: 0, text: 'x'.repeat(5000) }; }
    finally { closed = true; }
  }
  const chunks = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, draft));
  assert.equal(closed, true);
  assert.equal(replyOf(chunks), FAILURE_REPLY);
});

test('cumulative source byte limit includes inserted newlines and permits the exact boundary', async t => {
  for (const extraByte of [false, true]) {
    const h = await harness(t, { maxBufferedBytes: 4096 });
    const admission = h.preStep();
    await h.answer(await h.waitLink(), true);
    await admission;
    // Include the decoded payload's keys/path and the host's separator newline,
    // without counting the original JSON's escaped string representation again.
    const overhead = Buffer.byteLength(`\n${codeFromChunks(upstreamTool(''))}`);
    const contentBytes = 2048 - overhead;
    const first = upstreamTool('x'.repeat(contentBytes));
    const second = upstreamTool('y'.repeat(contentBytes + (extraByte ? 1 : 0)));
    assert.equal(Buffer.byteLength(`\n${codeFromChunks(first)}`), 2048);
    assert.equal(Buffer.byteLength(`\n${codeFromChunks(second)}`), extraByte ? 2049 : 2048);
    assert.deepEqual(await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => first)), first);
    const result = await Array.fromAsync(h.handlers.get('llm/stream')({ sessionId: 'session-A' }, () => second));
    if (extraByte) {
      assert.equal(replyOf(result), FAILURE_REPLY);
      assert.equal(result.some(chunk => chunk.block?.type === 'tool-call'), false);
    } else assert.deepEqual(result, second);
    assert.equal(h.links.length, 1);
  }
});
