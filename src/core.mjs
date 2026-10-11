import { generateResearchQuiz } from './question-bank.mjs';
/**
 * Code Arcade's original challenge engine. No network, packages or game assets.
 * The analysis is a lexical estimate, not a language parser or complexity proof.
 */
export const FAILURE_REPLY = '菜逼还让我写代码';
export const EXIT_REPLY = '连挑战都不敢，杂鱼呢';

export const SUBJECTS = Object.freeze([
  { id: 'politics', label: '政治' },
  { id: 'history', label: '历史' },
  { id: 'chemistry', label: '化学' },
  { id: 'physics', label: '物理' },
  { id: 'math', label: '数学' },
  { id: 'literature', label: '文学' },
  { id: 'philosophy', label: '哲学' },
].map(Object.freeze));

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function randomSource(seed) {
  let state = hashSeed(seed ?? `${Date.now()}-${Math.random()}`);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function integer(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

// Replace strings and comments with spaces while retaining line boundaries.
// This deliberately treats a template literal as text: interpolation analysis
// requires the source language's parser and is outside a language-agnostic tool.
function codeOnly(text) {
  let mode = 'code';
  let quote = '';
  let result = '';
  for (let i = 0; i < text.length; i += 1) {
    const current = text[i];
    const next = text[i + 1];
    if (mode === 'line') {
      if (current === '\n') { mode = 'code'; result += '\n'; }
      else result += ' ';
    } else if (mode === 'block') {
      if (current === '*' && next === '/') { result += '  '; i += 1; mode = 'code'; }
      else result += current === '\n' ? '\n' : ' ';
    } else if (mode === 'string') {
      if (current === '\\' && next !== undefined) {
        result += next === '\n' ? ' \n' : '  ';
        i += 1;
      } else if (current === quote) { result += ' '; mode = 'code'; }
      else result += current === '\n' ? '\n' : ' ';
    } else if (current === '/' && next === '/') { result += '  '; i += 1; mode = 'line'; }
    else if (current === '/' && next === '*') { result += '  '; i += 1; mode = 'block'; }
    else if (current === '#') { result += ' '; mode = 'line'; }
    else if (current === '"' || current === "'" || current === '`') {
      quote = current; mode = 'string'; result += ' ';
    } else result += current;
  }
  return result;
}

function metricsFromCounts({ lines, characters, branches, nesting, estimated = false }) {
  // A long minified line still represents substantial code or data. Treat each
  // 120 characters as a size unit when that exceeds the physical line count.
  // Task estimates already infer code size from the prompt, so do not count
  // prompt characters as generated-code characters a second time.
  const effectiveSize = estimated ? lines : Math.max(lines, characters / 120);
  const complexity = Math.round((Math.log2(effectiveSize + 1) * 6 + branches * 2.2 + nesting * 4) * 10) / 10;
  // Smooth saturation keeps small changes relevant without allowing an
  // arbitrarily large source file to produce an unplayable chart. `level` is
  // retained for older consumers; no rhythm parameter is derived from it.
  const difficulty = 1 - Math.exp(-Math.max(0, complexity) / 145);
  const level = Math.round(1 + difficulty * 4);
  const bpm = Math.round((150 + difficulty * 80) * 100) / 100;
  const noteCount = Math.round(72 + 288 * difficulty ** 0.85);
  const estimatedDensity = bpm / 60 * (1.5 + difficulty * 0.25);
  const durationSeconds = Math.ceil(3 + noteCount / estimatedDensity);
  return { lines, characters, branches, nesting, complexity, difficulty, level, bpm, noteCount, durationSeconds, ...(estimated ? { estimated: true } : {}) };
}

export function analyzeCode(value) {
  const text = String(value ?? '');
  const stripped = codeOnly(text);
  const nonempty = stripped.split(/\r?\n/).filter(line => line.trim().length > 0);
  const branches = (stripped.match(/\b(?:if|else|elif|case|catch|for|while|switch|when|except|match)\b|&&|\|\||\?(?![?.])/g) ?? []).length;
  let nesting = 0;
  let depth = 0;
  for (const character of stripped) {
    if (character === '{') { depth += 1; nesting = Math.max(nesting, depth); }
    else if (character === '}') depth = Math.max(0, depth - 1);
  }
  // Python-style indentation is useful even when there are no braces.
  const indentWidths = nonempty.map(line => (line.match(/^[ \t]*/)?.[0] ?? '').replaceAll('\t', '    ').length);
  const distinctIndent = [...new Set(indentWidths.filter(width => width > 0))].sort((a, b) => a - b);
  nesting = Math.max(nesting, Math.min(12, distinctIndent.length));
  return metricsFromCounts({ lines: nonempty.length, characters: text.length, branches, nesting });
}

export function estimateTask(value) {
  const task = String(value ?? '').trim();
  const fragments = task.split(/[。；;\n，,]+/u).filter(part => part.trim());
  const ordinarySignals = (task.match(/(?:登录|认证|权限|数据库|异步|并发|加密|搜索|排序|缓存|支付|上传|下载|网络|接口|测试|文件|状态|游戏|动画|authentication|database|async|concurren|encrypt|search|sort|cache|payment|upload|download|network|\bapi\b|test|file|state|game|animation)/giu) ?? []).length;
  const advancedSignals = (task.match(/(?:分布式|事务|回滚|容错|调度|编译器|解析器|实时|渲染|图算法|优化|多线程|distributed|transaction|rollback|fault[ -]?toleran|schedul|compiler|parser|real[ -]?time|render|graph[ -]?algorithm|optimi[sz]|multi[ -]?thread|\btls\b|\bwebsocket\b)/giu) ?? []).length;
  // Architecture and algorithm terms predict more interacting code paths than
  // an ordinary feature term. This remains an explicit lexical estimate.
  const keywords = ordinarySignals + advancedSignals * 2;
  const lines = task.length === 0 ? 0 : Math.round(clamp(18 + task.length * 0.45 + fragments.length * 9 + keywords * 18, 20, 1200));
  const branches = task.length === 0 ? 0 : Math.round(fragments.length + keywords * 1.8);
  const nesting = task.length === 0 ? 0 : clamp(1 + keywords / 3, 1, 12);
  return metricsFromCounts({ lines, characters: task.length, branches, nesting, estimated: true });
}

export function createChart(metrics = {}, seed) {
  const random = randomSource(seed);
  const difficulty = clamp(numberOr(metrics.difficulty, 1 - Math.exp(-Math.max(0, numberOr(metrics.complexity, 0)) / 145)), 0, 1);
  const bpm = clamp(numberOr(metrics.bpm, 150 + difficulty * 80), 150, 230);
  const noteCount = clamp(Math.round(numberOr(metrics.noteCount, 72 + 288 * difficulty ** 0.85)), 72, 360);
  const scrollSpeed = Math.round((0.38 + difficulty * 0.38) * 1000) / 1000;
  const perfectWindowMs = Math.round((46 - difficulty * 16) * 10) / 10;
  const hitWindowMs = Math.round((125 - difficulty * 40) * 10) / 10;
  const introMs = Math.ceil(Math.max(1600, 700 / scrollSpeed + 300));
  const beatMs = 60000 / bpm;
  const gridMs = beatMs / 2;
  // Even the earliest next hit window starts after the previous window ends.
  // For a hold, this spacing starts at its tail and gives time to release and
  // press again. Both lanes remain independent while the other key is held.
  const releaseGapMs = Math.ceil(hitWindowMs * 2 + 24);
  const laneAvailableAt = [-Infinity, -Infinity];
  const notes = [];
  let chordSequence = 0;
  const addNote = (lane, timeMs, type = 'tap', durationMs = 0, chordId = null) => {
    const endTimeMs = timeMs + durationMs;
    notes.push({ id: notes.length, lane, timeMs, type, durationMs, endTimeMs, chordId });
    laneAvailableAt[lane] = endTimeMs + releaseGapMs;
  };
  const timeAt = tick => Math.round(introMs + tick * gridMs);
  const holdDuration = () => Math.round(beatMs * (1.25 + random() * (1.75 - difficulty * 0.75)));

  // Every normal chart teaches both mechanics, including the smallest chart.
  const openingChord = chordSequence++;
  addNote(0, timeAt(0), 'tap', 0, openingChord);
  addNote(1, timeAt(0), 'tap', 0, openingChord);
  let tick = Math.ceil(releaseGapMs / gridMs);
  addNote(random() < 0.5 ? 0 : 1, timeAt(tick), 'hold', Math.round(beatMs * 2));
  tick += 1;

  const restChance = 0.18 - difficulty * 0.10;
  const chordChance = 0.12 + difficulty * 0.20;
  const holdChance = 0.13 + difficulty * 0.04;
  while (notes.length < noteCount) {
    const timeMs = timeAt(tick);
    tick += 1;
    const available = [0, 1].filter(lane => timeMs >= laneAvailableAt[lane]);
    if (available.length === 0 || random() < restChance) continue;
    const lanes = available.length === 2 && notes.length + 2 <= noteCount && random() < chordChance
      ? available : [available[integer(random, 0, available.length - 1)]];
    const chordId = lanes.length === 2 ? chordSequence++ : null;
    for (const lane of lanes) {
      const hold = random() < holdChance;
      addNote(lane, timeMs, hold ? 'hold' : 'tap', hold ? holdDuration() : 0, chordId);
    }
  }
  const durationMs = Math.max(...notes.map(note => note.endTimeMs)) + Math.ceil(hitWindowMs) + 1000;
  return { difficulty, bpm, noteCount, scrollSpeed, perfectWindowMs, hitWindowMs, introMs, releaseGapMs, notes, durationMs };
}

export function generateQuiz(subject, metrics = {}, seed) {
  const subjectId = typeof subject === 'string' ? subject : subject?.id;
  if (!SUBJECTS.some(item => item.id === subjectId)) throw new RangeError(`未知学科：${String(subjectId)}`);
  return generateResearchQuiz(subjectId, metrics, seed);
}
