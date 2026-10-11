/**
 * Original integration regression using the real published Harness runtime,
 * an in-process scripted LLM adapter, and a counter-only tool. No API key,
 * external model or Harness profile is read or changed.
 *
 * Verifies that an error attempt preserves retry diagnostics and token usage,
 * while text/tool/replay drafts reach neither live frames nor durable events.
 * The retry succeeds normally after exactly one initial challenge.
 *
 * From the package directory, install optional isolated test dependencies:
 * npm install --no-save --ignore-scripts --package-lock=false --omit=optional @deepseek-ai/cordis@4.0.4 @deepseek-ai/dsh-agent@0.2.0-rc.2 @deepseek-ai/dsh-agent-loop@0.2.0-rc.2 @deepseek-ai/dsh-llm@0.2.0-rc.2 @deepseek-ai/dsh-session@0.2.0-rc.2 @deepseek-ai/dsh-session-projection@0.2.0-rc.2 @deepseek-ai/dsh-system-prompt@0.2.0-rc.2 @deepseek-ai/dsh-tools@0.2.0-rc.2
 * node tests/runtime-provider-retry-smoke.mjs
 *
 * Requires local loopback HTTP access. Cleans up its own runtime and server.
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
import { generateQuiz } from '../src/core.mjs';

const ctx = new Context();
const fibers = [];
const events = [];
const frames = [];
const failures = [];
const errors = [];
const challenges = [];
const secret = 'private_unapproved_draft_for_failed_request';
const failure = { code: 'RATE_LIMIT', message: 'retry later', status: 429, providerRetryAfterMs: 3, requestId: 'error-request' };
let providerCalls = 0;
let toolCalls = 0;
let handle;

class Adapter extends LlmAdapter {
  async *stream() {
    providerCalls++;
    if (providerCalls === 1) {
      const block = { type: 'tool-call', id: 'failed-write', name: 'write_probe', arguments: JSON.stringify({ code: secret }) };
      yield { type: 'block-start', index: 0, blockType: 'tool-call' };
      yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments };
      yield { type: 'block-end', index: 0, block };
      yield { type: 'usage', usage: { inputTokens: 13, outputTokens: 17, totalTokens: 30 } };
      yield { type: 'finish', reason: { kind: 'error', failure }, replayState: { response: { draft: secret }, blocks: [secret] } };
      return;
    }
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: 'accepted' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'accepted' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

ctx.logger.exporter({ export(message) {
  const match = message.args.map(String).join(' ').match(/\[Code Arcade\]\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+)/)?.[1];
  if (!match) return;
  const operation = (async () => {
    const url = new URL(match);
    const action = async body => {
      const response = await fetch(`${url.origin}/api/action${url.search}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 200);
      return response.json();
    };
    const started = await action({ action: 'start-quiz', subject: 'math' });
    for (const question of generateQuiz('math', started.metrics, url.searchParams.get('token'))) await action({ action: 'answer', questionId: question.id, answerIndex: question.answerIndex });
  })();
  operation.catch(error => errors.push(error));
  challenges.push(operation);
} });
ctx.on('session/event', (_session, event) => events.push(event));
ctx.on('agent/assistant-stream', event => frames.push(event.frame));
ctx.on('agent/error', event => errors.push(event.error));
ctx.on('agent/request-error', (event, next) => {
  failures.push(event.failure);
  return failures.length === 1 ? Promise.resolve({ kind: 'retry' }) : next();
});

try {
  for (const plugin of [AgentRegistry, SessionStore, SessionProjections, SystemPrompt, ToolRuntime, LlmRuntime, AgentLoop]) fibers.push(await ctx.plugin(plugin, {}));
  fibers.push(await ctx.plugin({ name: 'provider-retry-review', inject: ['llm', 'tools'], apply(scope) {
    scope.llm.registerAdapter(['retry-review'], new Adapter());
    scope.tools.register({ name: 'write_probe', description: 'Counter only.', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, async execute() { toolCalls++; return 'counter'; } });
  } }));
  fibers.push(await ctx.plugin(arcade, { openOverlay: false, initialEnabled: true, chooseTimeoutMs: 10000 }));
  handle = await ctx.agents.create({ sessionId: randomUUID(), agentOptions: { provider: 'retry-review', model: 'scripted' } });
  handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '写一个函数' }], source: { kind: 'user' } }));
  let timeout;
  try { await Promise.race([handle.agent.whenIdle(), new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Retry review timed out')), 15000); })]); }
  finally { clearTimeout(timeout); }
  await Promise.all(challenges);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, [failure]);
  assert.equal(providerCalls, 2);
  assert.equal(toolCalls, 0);
  assert.equal(challenges.length, 1);
  assert.equal(JSON.stringify(frames).includes(secret), false);
  assert.equal(JSON.stringify(events).includes(secret), false);
  const messages = events.filter(event => event.type === 'assistant/message').flatMap(event => event.data.message.content).filter(block => block.type === 'text').map(block => block.text);
  assert.deepEqual(messages, ['accepted']);
  const attempts = events.filter(event => event.type === 'assistant/attempt');
  assert.equal(attempts.length, 1);
  assert.ok(JSON.stringify(attempts).includes('RATE_LIMIT'));
  assert.ok(JSON.stringify(attempts).includes('17'));
  console.log(JSON.stringify({ result: 'PASS', providerCalls, toolCalls, challengeCount: challenges.length, retryFailurePreserved: failures[0], failedAttempts: attempts.length, liveDraftExposed: false, storedDraftExposed: false, reply: messages[0] }));
} finally {
  if (handle) await handle.dispose();
  for (const fiber of fibers.reverse()) await fiber.dispose();
  await ctx.fiber.dispose();
}

