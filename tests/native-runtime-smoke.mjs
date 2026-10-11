/**
 * Original integration smoke harness. Uses the real published Harness runtime,
 * a scripted in-process LLM adapter, and a counter-only tool. No API key or
 * external model is used. No Harness profiles are read or changed.
 *
 * Run from the package directory after installing isolated test dependencies:
 * npm install --no-save --ignore-scripts --package-lock=false --omit=optional @deepseek-ai/cordis@4.0.4 @deepseek-ai/dsh-agent@0.2.0-rc.2 @deepseek-ai/dsh-agent-loop@0.2.0-rc.2 @deepseek-ai/dsh-llm@0.2.0-rc.2 @deepseek-ai/dsh-session@0.2.0-rc.2 @deepseek-ai/dsh-session-projection@0.2.0-rc.2 @deepseek-ai/dsh-system-prompt@0.2.0-rc.2 @deepseek-ai/dsh-tools@0.2.0-rc.2
 * node tests/native-runtime-smoke.mjs
 *
 * Requires local loopback HTTP access for the challenge UI protocol.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import SessionStore from '@deepseek-ai/dsh-session';
import SessionProjections from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import arcade from '../src/plugin.mjs';
import { generateQuiz, FAILURE_REPLY, EXIT_REPLY } from '../src/core.mjs';



async function runScenario(label, plan, draftCode = '', { suspendProvider = false, defaultOff = false, enableAfterFirstTurn = false } = {}) {
  const ctx = new Context();
  const fibers = [];
  const challenges = [];
  const errors = [];
  const events = [];
  let providerCalls = 0;
  let toolCalls = 0;
  let challengeCount = 0;
  let providerAborted = false;
  const providerReady = Promise.withResolvers();
  const snapshots = [];
  let controllerUrl;

  async function play(gameUrl, strategy) {
    assert.ok(strategy, 'Unexpected extra challenge');
    const url = new URL(gameUrl);
    const apiUrl = path => new URL(`${path}?token=${encodeURIComponent(url.searchParams.get('token'))}`, url);
    const state = await (await fetch(apiUrl('/api/state'))).json();
    async function action(payload) {
      const response = await fetch(apiUrl('/api/action'), { method: 'POST', headers: { 'content-type': 'application/json', origin: url.origin }, body: JSON.stringify(payload) });
      const value = await response.json();
      assert.equal(response.status, 200, JSON.stringify(value));
      return value;
    }
    if (strategy === 'exit') return action({ action: 'exit' });
    const questions = generateQuiz('math', state.metrics, url.searchParams.get('token'));
    await action({ action: 'start-quiz', subject: 'math' });
    let result;
    for (const question of questions) {
      result = await action({ action: 'answer', questionId: question.id, answerIndex: strategy.startsWith('pass') ? question.answerIndex : (question.answerIndex + 1) % question.options.length });
      if (result.status === 'passed' || result.status === 'failed') break;
    }
    assert.equal(result.status, strategy.startsWith('pass') ? 'passed' : 'failed');
    if (strategy === 'pass-then-exit') {
      // Exit only once the real loop has entered a live, suspended provider call.
      await providerReady.promise;
      const generating = await (await fetch(apiUrl('/api/state'))).json();
      assert.equal(generating.activity, 'generating');
      assert.equal(generating.status, 'passed');
      assert.equal(generating.bubbles.some(bubble => bubble.kind === 'code'), false);
      result = await action({ action: 'exit' });
      assert.equal(result.status, 'passed', 'Exiting must not rewrite the settled score');
      assert.equal(result.activity, 'finished');
      assert.equal(result.reply, EXIT_REPLY);
      assert.equal(result.bubbles.some(bubble => bubble.kind === 'code'), false);
      snapshots.push(result);
    }
  }

  ctx.logger.exporter({ export(message) {
    const line = message.args.map(String).join(' ');
    controllerUrl = line.match(/\[Code Arcade Control\]\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+)/)?.[1] ?? controllerUrl;
    const url = line.match(/\[Code Arcade\]\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+)/)?.[1];
    if (url) {
      const operation = play(url, plan[challengeCount++]);
      challenges.push(operation);
      operation.catch(error => errors.push(error));
    }
  } });
  ctx.on('agent/error', ({ error }) => errors.push(error));
  ctx.on('session/event', (_session, event) => { events.push(event); });

  class ScriptedAdapter extends LlmAdapter {
    async *stream(options) {
      providerCalls++;
      if (draftCode && providerCalls === 1) {
        const block = { type: 'tool-call', id: 'native-smoke-write', name: 'write_probe', arguments: JSON.stringify({ code: draftCode }) };
        yield { type: 'block-start', index: 0, blockType: 'tool-call' };
        yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments };
        yield { type: 'block-end', index: 0, block };
        if (suspendProvider) {
          // A full pending tool draft exists upstream, but no finish has released it.
          assert.ok(options.signal, 'Real Harness loop must pass an AbortSignal');
          await new Promise(resolve => {
            const onAbort = () => { providerAborted = true; resolve(); };
            options.signal.addEventListener('abort', onAbort, { once: true });
            providerReady.resolve();
            if (options.signal.aborted) {
              options.signal.removeEventListener('abort', onAbort);
              onAbort();
            }
          });
          assert.equal(options.signal.aborted, true);
          yield { type: 'finish', reason: { kind: 'aborted' } };
          return;
        }
        yield { type: 'finish', reason: { kind: 'tool-calls' } };
        return;
      }
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: 'accepted' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'accepted' } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }

  let handle;
  try {
    for (const plugin of [AgentRegistry, SessionStore, SessionProjections, SystemPrompt, ToolRuntime, LlmRuntime, AgentLoop]) {
      fibers.push(await ctx.plugin(plugin, {}));
    }
    fibers.push(await ctx.plugin({ name: 'native-smoke-fixture', inject: ['llm', 'tools'], apply(scope) {
      scope.llm.registerAdapter(['native-smoke'], new ScriptedAdapter());
      scope.tools.register({ name: 'write_probe', description: 'An isolated counter, no filesystem writes.', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, async execute() { toolCalls++; return 'counter incremented'; } });
    } }));
    // Only the five gate fixtures opt in; default-off fixtures exercise the shipped default.
    fibers.push(await ctx.plugin(arcade, { openOverlay: false, chooseTimeoutMs: 15000, ...(defaultOff ? {} : { initialEnabled: true }) }));
    handle = await ctx.agents.create({ sessionId: randomUUID(), agentOptions: { provider: 'native-smoke', model: 'scripted' } });
    async function followupAndWait(text) {
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
      let timeout;
      try {
        await Promise.race([handle.agent.whenIdle(), new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Native runtime smoke timed out')), 20000); })]);
      } finally { clearTimeout(timeout); }
    }
    await followupAndWait('写一个函数');
    if (defaultOff) {
      assert.ok(controllerUrl, 'A persistent controller is available before opting in');
      const control = new URL(controllerUrl);
      const stateUrl = new URL(`/api/state${control.search}`, control);
      const before = await (await fetch(stateUrl)).json();
      assert.equal(before.enabled, false);
      assert.equal(before.currentUrl, null);
      assert.equal(challengeCount, 0);
      assert.equal(providerCalls, 1);
      const firstMessages = events.filter(event => event.type === 'assistant/message').flatMap(event => event.data.message.content).filter(block => block.type === 'text').map(block => block.text);
      assert.deepEqual(firstMessages, ['accepted'], 'The disabled plugin must leave ordinary generation unchanged');
      if (enableAfterFirstTurn) {
        const response = await fetch(new URL(`/api/action${control.search}`, control), { method: 'POST', headers: { 'content-type': 'application/json', origin: control.origin }, body: JSON.stringify({ action: 'set-enabled', enabled: true }) });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).enabled, true);
        assert.equal(providerCalls, 1, 'Checking the box must never start an LLM request');
        assert.equal(challengeCount, 0, 'Checking the box waits for the next task');
        await followupAndWait('再写一个函数');
        const after = await (await fetch(stateUrl)).json();
        assert.equal(after.enabled, true);
        assert.ok(after.currentUrl, 'The next task is connected to its challenge');
      }
    }
    await Promise.all(challenges);
    assert.equal(errors.length, 0, errors.map(error => error.stack).join('\n'));
    const messages = events.filter(event => event.type === 'assistant/message').flatMap(event => event.data.message.content).filter(block => block.type === 'text').map(block => block.text);
    const expectedReply = ['exit', 'pass-then-exit'].includes(plan.at(-1)) ? EXIT_REPLY : plan.at(-1) === 'fail' ? FAILURE_REPLY : 'accepted';
    assert.equal(messages.at(-1), expectedReply);
    assert.equal(providerCalls, (defaultOff ? 1 : 0) + (plan[0]?.startsWith('pass') ? (draftCode && plan.at(-1) === 'pass' ? 2 : 1) : 0));
    assert.equal(toolCalls, draftCode && plan.at(-1) === 'pass' ? 1 : 0);
    assert.equal(challengeCount, plan.length);
    if (suspendProvider) {
      assert.equal(providerAborted, true, 'Exit must reach the live provider AbortSignal');
      assert.equal(providerCalls, 1, 'The exact exit reply must be a local stream with no second model call');
      assert.equal(toolCalls, 0, 'Buffered tools must never execute after exit');
      assert.deepEqual(messages, [EXIT_REPLY]);
      assert.equal(events.filter(event => event.type === 'assistant/message').flatMap(event => event.data.message.content).some(block => block.type === 'tool-call'), false, 'Buffered tool calls must never reach the assistant transcript');
      assert.equal(snapshots.length, 1);
      assert.equal(snapshots[0].bubbles.filter(bubble => bubble.kind === 'reply').at(-1).text, EXIT_REPLY);
    }
    const result = { label, providerCalls, toolCalls, challengeCount, reply: messages.at(-1), eventCount: events.length, ...(suspendProvider ? { providerAborted, codeBubbles: snapshots[0].bubbles.filter(bubble => bubble.kind === 'code').length } : {}) };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    if (handle) await handle.dispose();
    for (const fiber of fibers.reverse()) await fiber.dispose();
    await ctx.fiber.dispose();
  }
}

await runScenario('initial quiz failure', ['fail']);
await runScenario('initial exit', ['exit']);
const longCode = Array.from({ length: 1000 }, (_, index) => `if (condition${index}) { value += ${index}; }`).join('\n');
await runScenario('actual code top-up failure', ['pass', 'fail'], longCode);
await runScenario('accepted draft executes once', ['pass', 'pass'], longCode);
await runScenario('exit aborts suspended real-loop provider', ['pass-then-exit'], 'const shouldNeverBeReleased = true;', { suspendProvider: true });
await runScenario('default off leaves ordinary generation unchanged', [], '', { defaultOff: true });
await runScenario('checking controller enables challenge on next task', ['pass'], '', { defaultOff: true, enableAfterFirstTurn: true });

