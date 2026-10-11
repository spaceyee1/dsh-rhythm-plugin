import { randomUUID } from 'node:crypto';
import { createBridge } from './bridge.mjs';
import { launchOverlay } from './desktop.mjs';
import { analyzeCode, estimateTask, FAILURE_REPLY, EXIT_REPLY } from './core.mjs';

export const name = 'code-arcade';
export const inject = ['agents', 'llm'];

const cost = metrics => metrics.lines + metrics.complexity * 6;
const textOf = messages => messages.flatMap(message => message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');

// Older assistant output and system instructions are not the user's current
// coding request. Actual generated content is measured again before release.
export function taskText(messages = []) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role !== 'user') continue;
    const text = textOf([messages[index]]);
    if (text.trim()) return text;
  }
  return textOf(messages.filter(message => !message.role));
}

export function codeFromChunks(chunks) {
  const blocks = new Map();
  for (const chunk of chunks) {
    if (chunk.type === 'text-delta') {
      const previous = blocks.get(chunk.index) ?? { type: 'text', text: '' };
      previous.text += chunk.text;
      blocks.set(chunk.index, previous);
    } else if (chunk.type === 'tool-call-delta') {
      const previous = blocks.get(chunk.index) ?? { type: 'tool-call', arguments: '' };
      previous.arguments += chunk.argumentsDelta;
      blocks.set(chunk.index, previous);
    } else if (chunk.type === 'block-end') blocks.set(chunk.index, { ...chunk.block });
  }
  const pieces = [];
  for (const block of blocks.values()) {
    if (block.type === 'text') {
      // Conservatively count the entire response, including prose and code
      // outside fences. Fence markers must not turn the body into lexical strings.
      pieces.push(block.text.replace(/`{3,}|~{3,}/g, ''));
    } else if (block.type === 'tool-call') {
      // Count every tool payload, including shell/PTC/delegation, so renaming a write tool cannot skip the gate.
      try {
        const collect = value => {
          // Decode string values once so real code keeps its branches. Retain
          // numeric/boolean/null data too; a large structured write must not
          // shrink to its filename. Quoted keys preserve size without treating
          // metadata names (or an apostrophe in a key) as source-code tokens.
          if (typeof value === 'string') return value;
          if (Array.isArray(value)) return value.length ? `[\n${value.map(collect).join(',\n')}\n]` : '[]';
          if (value !== null && typeof value === 'object') {
            const entries = Object.entries(value);
            return entries.length ? `{\n${entries.map(([key, item]) => `${JSON.stringify(key)}:\n${collect(item)}`).join(',\n')}\n}` : '{}';
          }
          return JSON.stringify(value);
        };
        pieces.push(collect(JSON.parse(block.arguments)));
      } catch (error) {
        // Incomplete JSON still consumes budget; the normal tool parser will reject it if released.
        pieces.push(block.arguments ?? '');
      }
    }
  }
  return pieces.join('\n');
}

export async function* refusalStream(reply) {
  yield { type: 'block-start', index: 0, blockType: 'text' };
  yield { type: 'text-delta', index: 0, text: reply };
  yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } };
  yield { type: 'finish', reason: { kind: 'stop' } };
}

function* providerFailureStream(chunks, reason) {
  const usageFields = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'];
  for (const chunk of chunks) {
    if (chunk.type !== 'usage') continue;
    const usage = Object.fromEntries(usageFields.filter(field => Number.isFinite(chunk.usage?.[field]) && chunk.usage[field] >= 0).map(field => [field, chunk.usage[field]]));
    yield { type: 'usage', usage };
  }
  // Failed calls have no approved content. Keep only the known diagnostic
  // fields needed by Harness retry policy, never opaque replay envelopes.
  const failure = {};
  for (const field of ['code', 'message', 'requestId']) if (typeof reason.failure?.[field] === 'string') failure[field] = reason.failure[field];
  for (const field of ['status', 'providerRetryAfterMs', 'offloadImages']) if (Number.isFinite(reason.failure?.[field])) failure[field] = reason.failure[field];
  yield { type: 'finish', reason: { kind: reason.kind, ...(reason.failure ? { failure } : {}) } };
}

export async function apply(ctx, config = {}) {
  const settings = { port: 0, chooseTimeoutMs: 600000, disconnectMs: 8000, maxBufferedBytes: 8388608, ...config, openOverlay: config.openOverlay ?? config.openBrowser ?? true };
  for (const field of ['port', 'chooseTimeoutMs', 'disconnectMs', 'maxBufferedBytes']) {
    if (!Number.isSafeInteger(settings[field]) || settings[field] < (field === 'port' ? 0 : 1)) throw new Error(`Code Arcade: ${field} 必须为有效整数`);
  }
  if (settings.port > 65535 || settings.disconnectMs < 1000 || settings.maxBufferedBytes < 4096 || typeof settings.openOverlay !== 'boolean') throw new Error('Code Arcade: 配置超出允许范围');
  if (settings.openOverlay && process.platform !== 'win32') throw new Error('Code Arcade 透明悬浮版目前支持 Windows。');
  const turns = new Map();
  const localReplies = new Map();
  let disposed = false;
  let overlay;
  let admission = Promise.resolve();
  let currentGame;
  const bridge = await createBridge({ ...settings, onEnabledChange: enabled => {
    if (enabled || disposed) return;
    bridge.controller.setCurrent(null);
    const active = [...turns.values()].filter(state => state.gated && !state.completed && !state.replied && !state.stopping);
    // A parent cancellation already cancels its descendants; only independent roots need a reply.
    const roots = active.filter(state => !active.some(other => other !== state && descendantsOf(other.agent).has(state.agent)));
    for (const state of roots) {
      if (state.game?.status === 'passed' && state.game.activity === 'generating') stopAndReply(state);
      else { refuse(state, EXIT_REPLY); state.game?.action({ action: 'exit' }); }
    }
  } });
  ctx.effect(() => async () => {
    disposed = true;
    overlay?.kill();
    await bridge.close();
    turns.clear();
    localReplies.clear();
  });

  function descendantsOf(agent) {
    const descendants = new Set([agent]);
    const agents = ctx.agents.list();
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of agents) {
        if (descendants.has(candidate)) continue;
        if ([...descendants].some(parent => ctx.agents.isOwnedBy(candidate.id, parent))) {
          descendants.add(candidate);
          changed = true;
        }
      }
    }
    return descendants;
  }

  function refuse(state, reply) {
    state.refusal = reply;
    state.agent.inbox.clear();
    for (const child of descendantsOf(state.agent)) {
      if (child !== state.agent) child.cancel({ kind: 'hook', reason: reply });
    }
  }

  function stopAndReply(state) {
    if (disposed || state.stopping) return;
    state.stopping = true;
    refuse(state, EXIT_REPLY);
    // Cancel the live provider/tools now. A separate local-only turn records the exact response.
    const id = randomUUID();
    localReplies.set(id, { reply: EXIT_REPLY, game: state.game });
    state.agent.cancel({ kind: 'hook', reason: EXIT_REPLY });
    state.agent.followup({
      id, role: 'user', source: { kind: 'code-arcade-control', form: 'notice', summary: '用户关闭代码挑战挂件' },
      content: [{ type: 'text', text: 'Code Arcade：用户已退出本次挑战，停止代码生成。' }],
    });
  }

  function showGame(game) {
    if (currentGame && currentGame !== game) currentGame.nextUrl = game.url;
    currentGame = game;
    bridge.controller.setCurrent(game);
  }

  // The checkbox lives for the plugin lifetime. Toggling it never starts a model request.
  ctx.logger.info(`[Code Arcade Control] ${bridge.controller.url}`);
  if (settings.openOverlay) overlay = launchOverlay(bridge.controller.url, { logger: ctx.logger, onClosed: () => {
    if (!disposed) bridge.controller.setEnabled(false);
  } });

  async function challenge(state, metrics, signal) {
    const previous = admission;
    let release;
    const slot = new Promise(resolve => { release = resolve; });
    admission = previous.then(() => slot);
    try {
      // An aborted queued agent leaves promptly while later tickets still wait for the active game.
      await new Promise(resolve => {
        if (signal?.aborted) { resolve(); return; }
        const abort = () => resolve();
        signal?.addEventListener('abort', abort, { once: true });
        previous.then(() => { signal?.removeEventListener('abort', abort); resolve(); });
      });
      if (signal?.aborted || disposed || state.refusal) return false;
      if (!bridge.controller.enabled) { refuse(state, EXIT_REPLY); return false; }
      const game = bridge.createChallenge(metrics, { signal, onExit: () => stopAndReply(state) });
      if (state.game?.status === 'passed') state.game.setActivity('finished');
      state.game = game;
      ctx.logger.info(`[Code Arcade] ${game.url}`);
      if (!signal?.aborted) showGame(game);
      const result = await game.done;
      if (result.status === 'passed') {
        state.credit = Math.ceil(cost(metrics) * 1.2);
        game.setActivity('generating');
        return true;
      }
      if (result.status === 'failed' || result.status === 'exited') {
        refuse(state, result.reply);
      }
      return false;
    } finally { release(); }
  }

  ctx.on('agent/pre-step', async (event, next) => {
    const control = event.messages.find(message => localReplies.has(message.id));
    if (control) {
      const local = localReplies.get(control.id);
      localReplies.delete(control.id);
      turns.set(event.agent.id, { agent: event.agent, turn: event.turn, refusal: local.reply, replied: false, game: local.game, signal: event.signal });
      return next();
    }
    let state = turns.get(event.agent.id);
    if ((!state || state.turn !== event.turn) && !bridge.controller.enabled) {
      turns.delete(event.agent.id);
      return next();
    }
    if (!state || state.turn !== event.turn) {
      state = { agent: event.agent, turn: event.turn, gated: true, credit: 0, source: '', refusal: '', replied: false, signal: event.signal };
      turns.set(event.agent.id, state);
      const metrics = estimateTask(taskText(event.messages));
      await challenge(state, metrics, event.signal);
    }
    if (event.signal?.aborted || disposed || state.replied) return { kind: 'reject' };
    // A refusal enters one local-only stream so the ordinary loop logs/displays the exact reply.
    return next();
  });

  ctx.on('llm/stream', async function* (options, next) {
    const agent = ctx.agents.currentInitiator();
    // Title/compaction helpers can inherit the agent's async context, but don't produce coding steps.
    if (options.purpose || options.sessionId !== agent?.id) { yield* next(); return; }
    const state = agent ? turns.get(agent.id) : undefined;
    if (!state) { yield* next(); return; }
    if (disposed || options.signal?.aborted) return;
    if (state.refusal) {
      state.replied = true;
      yield* refusalStream(state.refusal);
      return;
    }

    const buffered = [];
    let bytes = 0;
    let terminal;
    for await (const chunk of next()) {
      bytes += Buffer.byteLength(JSON.stringify(chunk), 'utf8');
      if (bytes > settings.maxBufferedBytes || buffered.length >= 100000) {
        refuse(state, FAILURE_REPLY);
        break; // Closing the upstream iterator releases the provider stream immediately.
      }
      buffered.push(chunk);
      if (chunk.type === 'finish') terminal = chunk.reason;
    }
    if (options.signal?.aborted || disposed) return;
    // Preserve genuine provider errors for the Harness retry/error policy; never publish partial tools.
    if (terminal?.kind === 'error' || terminal?.kind === 'aborted') { yield* providerFailureStream(buffered, terminal); return; }
    if (!state.refusal) {
      const newCode = codeFromChunks(buffered);
      if (newCode.trim()) {
        const appended = `\n${newCode}`;
        if (Buffer.byteLength(state.source, 'utf8') + Buffer.byteLength(appended, 'utf8') > settings.maxBufferedBytes) {
          refuse(state, FAILURE_REPLY);
        } else {
          state.source += appended;
          const actual = analyzeCode(state.source);
          if (cost(actual) > state.credit) await challenge(state, actual, options.signal ?? state.signal);
        }
      }
    }
    if (options.signal?.aborted || disposed) return;
    if (state.refusal) {
      state.replied = true;
      // Provider usage still belongs to this request even when the draft is discarded.
      const usage = buffered.findLast(chunk => chunk.type === 'usage');
      const replacement = [...await Array.fromAsync(refusalStream(state.refusal))];
      if (usage) replacement.splice(replacement.length - 1, 0, usage);
      yield* replacement;
    } else yield* buffered;
  });

  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle') return;
    const state = turns.get(agent.id);
    if (state) {
      state.completed = true;
      state.source = '';
      state.credit = 0;
    }
    const game = state?.game;
    if (game?.status === 'passed' && game.activity === 'generating') {
      game.setActivity('finished');
    }
  });
  ctx.on('agent/disposed', ({ agent }) => {
    const game = turns.get(agent.id)?.game;
    if (game?.status === 'passed') game.setActivity('finished');
    else game?.finish('cancelled');
    turns.delete(agent.id);
  });
}

export default { name, inject, apply };
