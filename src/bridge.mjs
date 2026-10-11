import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { SUBJECTS, createChart, generateQuiz, FAILURE_REPLY, EXIT_REPLY } from './core.mjs';

const TERMINAL = new Set(['passed', 'failed', 'exited', 'cancelled']);
const PERFECT_WINDOW_MS = 50;
const HOLD_RELEASE_GRACE_MS = 35;

export class Challenge {
  constructor(metrics, { id, demo = false, now = Date.now, clock = () => performance.now(), chooseTimeoutMs = 600000, disconnectMs = 8000, signal, onExit } = {}) {
    this.id = id ?? randomBytes(16).toString('hex');
    this.token = randomBytes(32).toString('hex');
    this.metrics = metrics;
    this.demo = demo;
    this.now = now;
    this.clock = clock;
    this.created = clock();
    this.chooseTimeoutMs = chooseTimeoutMs;
    this.disconnectMs = disconnectMs;
    this.lastSeen = undefined;
    this.status = 'choose';
    this.activity = 'challenge';
    this.bubbles = [];
    this.bubbleSequence = 0;
    this.onExit = onExit;
    this.exitRequested = false;
    this.mode = null;
    this.hits = 0;
    this.perfectHits = 0;
    this.goodHits = 0;
    this.misses = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.feedback = [];
    this.feedbackSequence = 0;
    this.snapshotRevision = 0;
    this.correct = 0;
    this.wrong = 0;
    this.questionIndex = 0;
    this.judgements = Object.create(null);
    this.activeHolds = Object.create(null);
    this.pressedLanes = [false, false];
    this.done = new Promise(resolve => { this.resolve = resolve; });
    this.abort = () => this.finish('cancelled');
    this.signal = signal;
    if (signal?.aborted) this.abort();
    else signal?.addEventListener('abort', this.abort, { once: true });
  }

  finish(status) {
    if (TERMINAL.has(this.status)) return;
    this.status = status;
    this.activeHolds = Object.create(null);
    this.pressedLanes = [false, false];
    this.finishedAt = this.clock();
    this.reply = status === 'failed' ? FAILURE_REPLY : status === 'exited' ? EXIT_REPLY : '';
    if (status !== 'passed') this.setActivity('finished');
    this.signal?.removeEventListener('abort', this.abort);
    this.resolve({ status, reply: this.reply });
  }

  publishBubble(text, kind = 'code') {
    if (typeof text !== 'string') throw new TypeError('气泡内容必须为文本');
    if (typeof kind !== 'string' || !kind || kind.length > 32) throw new TypeError('无效气泡类型');
    const bubble = { id: ++this.bubbleSequence, text: text.slice(0, 2000), kind, timestamp: this.now() };
    this.bubbles.push(bubble);
    if (this.bubbles.length > 16) this.bubbles.splice(0, this.bubbles.length - 16);
    return bubble;
  }

  setActivity(activity) {
    if (!['challenge', 'generating', 'finished'].includes(activity)) throw new Error('无效活动状态');
    this.activity = activity;
    if (activity === 'finished') this.sessionFinishedAt = this.clock();
    else this.sessionFinishedAt = undefined;
  }

  requestExit() {
    if (!TERMINAL.has(this.status)) {
      this.finish('exited');
      return;
    }
    if (this.status !== 'passed' || this.activity !== 'generating' || this.nextUrl || this.exitRequested) return;
    this.exitRequested = true;
    this.reply = EXIT_REPLY;
    this.setActivity('finished');
    this.publishBubble(EXIT_REPLY, 'reply');
    try {
      const pending = this.onExit?.();
      if (pending?.catch) pending.catch(() => {});
    } catch { /* A host callback cannot invalidate the settled challenge or HTTP response. */ }
  }

  seen() { this.lastSeen = this.clock(); }

  judge(note, lane, grade, offsetMs, source, counted) {
    if (note) {
      if (this.judgements[note.id]) return;
      this.judgements[note.id] = grade;
      delete this.activeHolds[note.id];
    }
    if (grade === 'miss') {
      this.combo = 0;
      if (counted) this.misses++;
    } else {
      this.hits++;
      if (grade === 'perfect') this.perfectHits++;
      else this.goodHits++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    this.emitFeedback(note, lane, grade, offsetMs, source, counted);
  }

  emitFeedback(note, lane, grade, offsetMs, source, counted) {
    this.feedback.push({ id: ++this.feedbackSequence, lane, noteId: note?.id ?? null, grade, offsetMs, source, counted, combo: this.combo, at: this.now() });
    if (this.feedback.length > 32) this.feedback.splice(0, this.feedback.length - 32);
  }

  checkResult() {
    // Each lane of a chord and each complete hold is one note. No head/tail
    // double counting; integer comparison keeps exactly 20% as a pass.
    if (this.misses * 5 > this.chart.notes.length) this.finish('failed');
    else if (this.hits + this.misses === this.chart.notes.length) this.finish('passed');
  }

  pressLane(lane, source = 'press') {
    if (this.pressedLanes[lane]) return;
    this.pressedLanes[lane] = true;
    const elapsed = this.clock() - this.started;
    const candidates = this.chart.notes.filter(note => note.lane === lane && !this.judgements[note.id] && !this.activeHolds[note.id] && Math.abs(note.timeMs - elapsed) <= this.chart.hitWindowMs);
    candidates.sort((a, b) => Math.abs(a.timeMs - elapsed) - Math.abs(b.timeMs - elapsed));
    const note = candidates[0];
    if (!note) { this.judge(null, lane, 'miss', null, source, false); return; }
    const offsetMs = elapsed - note.timeMs;
    const grade = Math.abs(offsetMs) <= (this.chart.perfectWindowMs ?? PERFECT_WINDOW_MS) ? 'perfect' : 'good';
    if (note.type === 'hold' && note.durationMs > 0) {
      this.activeHolds[note.id] = { lane, endTimeMs: note.endTimeMs ?? note.timeMs + note.durationMs, grade, offsetMs };
      this.emitFeedback(note, lane, grade, offsetMs, 'hold-start', false);
    } else this.judge(note, lane, grade, offsetMs, source, true);
  }

  releaseLane(lane) {
    this.pressedLanes[lane] = false;
    const elapsed = this.clock() - this.started;
    for (const note of this.chart.notes) {
      const held = this.activeHolds[note.id];
      if (!held || held.lane !== lane) continue;
      const complete = elapsed >= held.endTimeMs - HOLD_RELEASE_GRACE_MS;
      this.judge(note, lane, complete ? (elapsed >= held.endTimeMs ? held.grade : 'good') : 'miss',
        elapsed - held.endTimeMs, complete ? 'hold-complete' : 'hold-release', true);
    }
  }

  tick() {
    const time = this.clock();
    if (TERMINAL.has(this.status)) {
      if (this.status === 'passed' && this.activity === 'generating' && !this.nextUrl && this.lastSeen !== undefined && time - this.lastSeen > this.disconnectMs) this.requestExit();
      return;
    }
    if ((this.status === 'choose' && time - this.created > this.chooseTimeoutMs) || (this.lastSeen !== undefined && time - this.lastSeen > this.disconnectMs)) {
      this.finish('exited');
      return;
    }
    if (this.status !== 'rhythm') return;
    const elapsed = time - this.started;
    for (const note of this.chart.notes) {
      const held = this.activeHolds[note.id];
      if (held && elapsed >= held.endTimeMs) {
        this.judge(note, note.lane, this.pressedLanes[note.lane] ? held.grade : 'miss', held.offsetMs, 'hold-complete', true);
      } else if (!held && !this.judgements[note.id] && elapsed > note.timeMs + this.chart.hitWindowMs) {
        this.judge(note, note.lane, 'miss', null, 'timeout', true);
      }
    }
    this.checkResult();
  }

  action(input) {
    this.tick();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('无效操作');
    if (input.action === 'exit') {
      this.requestExit();
      return this.snapshot();
    }
    if (TERMINAL.has(this.status)) return this.snapshot();
    this.seen();
    if (input.action === 'start-rhythm' && this.status === 'choose') {
      this.mode = 'rhythm';
      this.chart = createChart(this.metrics, this.token);
      this.started = this.clock();
      this.startAt = this.now();
      this.status = 'rhythm';
    } else if (input.action === 'start-quiz' && this.status === 'choose') {
      if (!SUBJECTS.some(subject => subject.id === input.subject)) throw new Error('请选择一个学科');
      this.mode = 'quiz';
      this.subject = input.subject;
      this.questions = generateQuiz(input.subject, this.metrics, this.token);
      this.status = 'quiz';
    } else if (['hit', 'press', 'release'].includes(input.action) && this.status === 'rhythm') {
      if (input.lane !== 0 && input.lane !== 1) throw new Error('无效轨道');
      if (input.action === 'release') this.releaseLane(input.lane);
      else if (input.action === 'press') this.pressLane(input.lane);
      else if (!this.pressedLanes[input.lane]) {
        // Compatibility with old one-shot clients cannot bypass a hold.
        this.pressLane(input.lane, 'hit');
        this.releaseLane(input.lane);
      }
      this.checkResult();
    } else if (input.action === 'answer' && this.status === 'quiz') {
      const question = this.questions[this.questionIndex];
      if (input.questionId !== question.id) throw new Error('题目已更新，请勿重复提交');
      if (!Number.isInteger(input.answerIndex) || input.answerIndex < 0 || input.answerIndex >= question.options.length) throw new Error('无效答案');
      const correct = input.answerIndex === question.answerIndex;
      this.answerFeedback = { correct, explanation: question.explanation, sources: question.sources ?? [] };
      if (correct) this.correct++;
      else this.wrong++;
      this.questionIndex++;
      if (this.wrong >= 2) this.finish('failed');
      else if (this.questionIndex === 3) this.finish('passed');
    } else throw new Error('当前阶段不能执行此操作');
    return this.snapshot();
  }

  snapshot() {
    const question = this.status === 'quiz' ? this.questions[this.questionIndex] : undefined;
    return {
      id: this.id, revision: ++this.snapshotRevision, demo: this.demo, status: this.status, mode: this.mode, subject: this.subject, metrics: this.metrics, subjects: SUBJECTS,
      chart: this.chart, startAt: this.startAt, serverNow: this.now(), judgements: this.judgements,
      activeHolds: this.activeHolds, pressedLanes: [...this.pressedLanes],
      hits: this.hits, misses: this.misses, totalNotes: this.chart?.notes.length ?? 0,
      perfectHits: this.perfectHits, goodHits: this.goodHits, combo: this.combo, maxCombo: this.maxCombo,
      perfectWindowMs: this.chart?.perfectWindowMs ?? PERFECT_WINDOW_MS, holdReleaseGraceMs: HOLD_RELEASE_GRACE_MS, feedback: this.feedback,
      missRate: this.chart ? this.misses / this.chart.notes.length : 0,
      question: question ? { id: question.id, prompt: question.prompt, options: question.options, sources: question.sources ?? [] } : undefined,
      questionIndex: this.questionIndex, correct: this.correct, wrong: this.wrong,
      answerFeedback: this.answerFeedback, reply: this.reply ?? '',
      activity: this.activity, bubbles: this.bubbles, nextUrl: this.nextUrl,
    };
  }
}

export class NativeController {
  constructor({ initialEnabled = false, onEnabledChange, disconnectMs = 8000, now = Date.now, clock = () => performance.now() } = {}) {
    if (typeof initialEnabled !== 'boolean') throw new TypeError('启用状态必须为布尔值');
    this.token = randomBytes(32).toString('hex');
    this.enabled = initialEnabled;
    this.snapshotRevision = 0;
    this.currentUrl = null;
    this.onEnabledChange = onEnabledChange;
    this.disconnectMs = disconnectMs;
    this.now = now;
    this.clock = clock;
    this.lastSeen = undefined;
  }

  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('启用状态必须为布尔值');
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    try {
      const pending = this.onEnabledChange?.(enabled);
      if (pending?.catch) pending.catch(() => {});
    } catch { /* The local switch remains usable when a host callback fails. */ }
  }

  setCurrent(gameOrNull) {
    if (gameOrNull !== null && typeof gameOrNull?.url !== 'string') throw new TypeError('无效挑战会话');
    this.currentUrl = gameOrNull?.url ?? null;
  }

  seen() { this.lastSeen = this.clock(); }

  tick() {
    if (this.enabled && this.lastSeen !== undefined && this.clock() - this.lastSeen > this.disconnectMs) this.setEnabled(false);
  }

  action(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.action !== 'set-enabled') throw new Error('无效控制操作');
    this.setEnabled(input.enabled);
    this.seen();
    return this.snapshot();
  }

  snapshot() {
    return { client: 'native-controller', revision: ++this.snapshotRevision, enabled: this.enabled, serverNow: this.now(), currentUrl: this.currentUrl };
  }
}

export async function createBridge({ port = 0, chooseTimeoutMs = 600000, disconnectMs = 8000, initialEnabled = false, onEnabledChange } = {}) {
  const games = new Map();
  const controller = new NativeController({ initialEnabled, onEnabledChange, disconnectMs });
  let origin;
  const send = (res, code, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, {
      'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    });
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(origin).host) return send(res, 403, { error: '无效主机' });
      const url = new URL(req.url, origin);
      const token = url.searchParams.get('token');
      const target = token === controller.token ? controller : games.get(token);
      if (!target) return send(res, 404, { error: '挑战不存在或已过期。请在 Harness 原生悬浮窗中操作。' });
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, target === controller ? controller.snapshot() : { client: 'native-wpf', message: '请在桌面透明悬浮窗中操作。' });
      if (req.method === 'GET' && url.pathname === '/api/state') {
        target.tick(); target.seen();
        return send(res, 200, target.snapshot());
      }
      if (req.method === 'POST' && url.pathname === '/api/action') {
        if (req.headers.origin && req.headers.origin !== origin) return send(res, 403, { error: '拒绝跨域操作' });
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8192) return send(res, 413, { error: '请求过大' });
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return send(res, 200, target.action(body));
      }
      send(res, 404, { error: '接口不存在' });
    } catch (error) {
      if (!res.headersSent) send(res, 400, { error: error.message });
      else res.end();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  controller.url = `${origin}/?token=${controller.token}`;
  function add(metrics, options = {}) {
    const game = new Challenge(metrics, { chooseTimeoutMs, disconnectMs, ...options });
    game.url = `${origin}/?token=${game.token}`;
    games.set(game.token, game);
    return game;
  }
  const timer = setInterval(() => {
    controller.tick();
    for (const [token, game] of games) {
      game.tick();
      if (game.sessionFinishedAt !== undefined && game.clock() - game.sessionFinishedAt > 180000) games.delete(token);
    }
  }, 30);
  timer.unref();
  return {
    origin, controller, createChallenge: add,
    async close() {
      clearInterval(timer);
      for (const game of games.values()) {
        if (game.status === 'passed') game.requestExit();
        game.finish('cancelled');
      }
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      games.clear();
    },
  };
}
