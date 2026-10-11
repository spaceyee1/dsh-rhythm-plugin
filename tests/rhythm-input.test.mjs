import test from 'node:test';
import assert from 'node:assert/strict';
import { Challenge } from '../src/bridge.mjs';
import { analyzeCode } from '../src/core.mjs';

const hold = (id, lane, timeMs, durationMs) => ({ id, lane, timeMs, durationMs, endTimeMs: timeMs + durationMs, type: 'hold' });
const tap = (id, lane, timeMs) => ({ id, lane, timeMs, durationMs: 0, endTimeMs: timeMs, type: 'tap' });
function fixture(notes) {
  let time = 0;
  const game = new Challenge(analyzeCode('return 1;'), { clock: () => time, now: () => time });
  game.action({ action: 'start-rhythm' });
  game.chart = { ...game.chart, hitWindowMs: 100, perfectWindowMs: 40, notes };
  return { game, at(t) { time = t; game.tick(); }, input(action, lane) { return game.action({ action, lane }); } };
}

test('D/F chord requires both lanes; one held key cannot score the other', () => {
  const f = fixture([tap(0, 0, 1000), tap(1, 1, 1000)]);
  f.at(1000); f.input('press', 0);
  assert.equal(f.game.hits, 1);
  assert.equal(f.game.status, 'rhythm');
  f.input('press', 0);
  assert.equal(f.game.hits, 1);
  f.input('press', 1);
  assert.equal(f.game.hits, 2);
  assert.equal(f.game.status, 'passed');
});

test('same-millisecond chord replies have strictly ordered snapshot revisions', () => {
  const f = fixture([tap(0, 0, 1000), tap(1, 1, 1000), tap(2, 0, 2000)]);
  f.at(1000);
  const first = f.input('press', 0);
  const second = f.input('press', 1);
  assert.equal(first.serverNow, second.serverNow);
  assert.ok(second.revision > first.revision);
  assert.equal(first.hits, 1); assert.equal(second.hits, 2);
});

test('hold head gives feedback but only a sustained tail earns one judgement', () => {
  const f = fixture([hold(0, 0, 1000, 900), tap(1, 1, 2500)]);
  f.at(1000); let state = f.input('press', 0);
  assert.equal(state.hits, 0);
  assert.equal(state.judgements[0], undefined);
  assert.equal(state.activeHolds[0].endTimeMs, 1900);
  assert.equal(state.feedback.at(-1).source, 'hold-start');
  assert.equal(state.feedback.at(-1).counted, false);
  f.at(1899); assert.equal(f.game.hits, 0);
  f.at(1900); state = f.game.snapshot();
  assert.equal(state.hits, 1);
  assert.equal(state.judgements[0], 'perfect');
  assert.equal(state.activeHolds[0], undefined);
  f.input('release', 0); f.at(2100);
  assert.equal(f.game.hits, 1);
});

test('early hold release counts a single MISS, and replay cannot recover that note', () => {
  const f = fixture([hold(0, 0, 1000, 900), ...Array.from({ length: 4 }, (_, i) => tap(i + 1, i % 2, 3000 + i * 1000))]);
  f.at(1000); f.input('press', 0);
  f.at(1500); f.input('release', 0);
  assert.equal(f.game.misses, 1);
  assert.equal(f.game.status, 'rhythm');
  assert.equal(f.game.feedback.at(-1).source, 'hold-release');
  f.input('press', 0); f.input('release', 0); f.at(2100);
  assert.equal(f.game.misses, 1);
  assert.equal(f.game.hits, 0);
});

test('35ms tail tolerance is inclusive and can only earn GOOD', () => {
  for (const delta of [-36, -35, -1, 0]) {
    const f = fixture([hold(0, 0, 1000, 900)]);
    f.at(1000); f.input('press', 0);
    f.at(1900 + delta); f.input('release', 0);
    assert.equal(f.game.judgements[0], delta < -35 ? 'miss' : delta < 0 ? 'good' : 'perfect');
    assert.equal(f.game.hits + f.game.misses, 1);
  }
});

test('two simultaneous holds finish independently and use their head timing grades', () => {
  const f = fixture([hold(0, 0, 1000, 800), hold(1, 1, 1000, 1300)]);
  f.at(1000); f.input('press', 0);
  f.at(1050); f.input('press', 1);
  f.at(1800); assert.equal(f.game.hits, 1);
  f.input('release', 0);
  f.at(2300);
  assert.equal(f.game.status, 'passed');
  assert.equal(f.game.perfectHits, 1); assert.equal(f.game.goodHits, 1);
});

test('OS key repeat or holding through the next head never auto-hits a second note', () => {
  const f = fixture([hold(0, 0, 1000, 800), tap(1, 0, 2200)]);
  f.at(1000); f.input('press', 0); f.at(1800);
  f.at(2200); f.input('press', 0);
  assert.equal(f.game.hits, 1);
  f.at(2301);
  assert.equal(f.game.judgements[1], 'miss');
  assert.equal(f.game.status, 'failed');
});

test('legacy hit pulse cannot complete a long hold; all missed hold heads are counted once', () => {
  const f = fixture([hold(0, 0, 1000, 800)]);
  f.at(1000); f.input('hit', 0);
  assert.equal(f.game.status, 'failed'); assert.equal(f.game.misses, 1);
  const missed = fixture([hold(0, 0, 1000, 800)]);
  missed.at(1101); missed.at(2000);
  assert.equal(missed.game.misses, 1);
});

test('invalid lanes are rejected on press and release; forged hold duration does not count', () => {
  const f = fixture([hold(0, 0, 1000, 800)]);
  assert.throws(() => f.input('press', 2), /轨道/);
  assert.throws(() => f.input('release', '0'), /轨道/);
  f.at(1000);
  f.game.action({ action: 'press', lane: 0, durationMs: 99999, grade: 'perfect', elapsedMs: 1800 });
  f.at(1200); f.input('release', 0);
  assert.equal(f.game.judgements[0], 'miss');
});

test('mixed chord and hold scoring preserves exactly 20% while a second missed hold fails', () => {
  const f = fixture([hold(0, 0, 1000, 700), tap(1, 0, 2200), tap(2, 1, 2200), tap(3, 0, 2600), tap(4, 1, 2600)]);
  f.at(1000); f.input('press', 0); f.at(1200); f.input('release', 0);
  for (const time of [2200, 2600]) {
    f.at(time);
    f.input('press', 0); f.input('press', 1);
    f.input('release', 0); f.input('release', 1);
  }
  assert.equal(f.game.hits, 4); assert.equal(f.game.misses, 1);
  assert.equal(f.game.status, 'passed'); assert.equal(f.game.snapshot().missRate, 0.2);
  const g = fixture([hold(0, 0, 1000, 700), hold(1, 1, 1000, 700), tap(2, 0, 2200), tap(3, 1, 2200), tap(4, 0, 2600)]);
  g.at(1000); g.input('press', 0); g.input('press', 1);
  g.at(1200); g.input('release', 0); g.input('release', 1);
  assert.equal(g.game.misses, 2); assert.equal(g.game.status, 'failed');
});

test('real generated tap/chord/hold charts can all be completed using only down/up events', () => {
  for (const code of ['return 1;', 'if(x){for(;;){if(y){run();}}}\n'.repeat(180)]) {
    for (let seed = 0; seed < 8; seed++) {
      let time = 0;
      const game = new Challenge(analyzeCode(code), { clock: () => time, now: () => time });
      game.token = `playable-${seed}`;
      game.action({ action: 'start-rhythm' });
      const events = game.chart.notes.flatMap(n => [{ at: n.timeMs, action: 'press', lane: n.lane }, { at: (n.endTimeMs ?? n.timeMs) + 1, action: 'release', lane: n.lane }]);
      events.sort((a, b) => a.at - b.at || (a.action === 'release' ? -1 : 1));
      for (const event of events) { time = event.at; game.action(event); }
      assert.equal(game.status, 'passed');
      assert.equal(game.misses, 0);
      assert.equal(game.hits, game.chart.notes.length);
      assert.equal(game.perfectHits, game.hits);
    }
  }
});
