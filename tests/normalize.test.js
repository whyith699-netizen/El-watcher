import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeTitle, parseMoodleDate, typeFromUrl,
  fingerprint, normalizeItem,
} from '../src/normalize.js';
import { diffItems, sanityCheck } from '../src/diff.js';
import { redact } from '../src/redact.js';

describe('normalizeTitle', () => {
  it('collapse whitespace', () => { assert.equal(normalizeTitle('  Foo  Bar  '), 'Foo Bar'); });
  it('handle empty', () => { assert.equal(normalizeTitle(''), ''); assert.equal(normalizeTitle(null), ''); });
  it('handle unicode', () => { assert.equal(normalizeTitle('Tugas  Bahasa Indonesia'), 'Tugas Bahasa Indonesia'); });
});

describe('parseMoodleDate', () => {
  it('parse 12 Aug (no year)', () => {
    const r = parseMoodleDate('12 Aug');
    assert.match(r, /^\d{4}-\d{2}-12T\d{2}:\d{2}:\d{2}\+07:00$/);
  });
  it('parse 12 Aug 14:30', () => {
    const r = parseMoodleDate('12 Aug 14:30');
    assert.match(r, /14:30/);
  });
  it('parse 25 Dec 2026 08:00', () => {
    const r = parseMoodleDate('25 Dec 2026 08:00');
    assert.match(r, /2026-12-25T08:00/);
  });
  it('return null for garbage', () => { assert.equal(parseMoodleDate('garbage'), null); });
  it('handle empty', () => { assert.equal(parseMoodleDate(''), null); });
});

describe('typeFromUrl', () => {
  it('quiz', () => { assert.equal(typeFromUrl('https://elearning.sma1klaten.sch.id/mod/quiz/view.php?id=123'), 'quiz'); });
  it('assign', () => { assert.equal(typeFromUrl('/mod/assign/'), 'assignment'); });
  it('forum', () => { assert.equal(typeFromUrl('/mod/forum/'), 'announcement'); });
  it('fallback', () => { assert.equal(typeFromUrl('/mod/unknown/'), 'other'); assert.equal(typeFromUrl(''), 'other'); });
});

describe('fingerprint', () => {
  it('stable for same input', () => {
    const item = { accountId: 'a', course: 'X', type: 'quiz', title: 'UH 1', url: '/mod/quiz/view.php?id=1' };
    assert.equal(fingerprint(item), fingerprint(item));
  });
  it('different for different title', () => {
    const a = { accountId: 'a', course: 'X', type: 'quiz', title: 'UH 1', url: '/mod/quiz/view.php?id=1' };
    const b = { ...a, title: 'UH 2' };
    assert.notEqual(fingerprint(a), fingerprint(b));
  });
});

describe('diffItems', () => {
  const mk = (t, title) => ({ fingerprint: t, title, accountId: 'a', course: 'X', type: 'quiz', url: '/mod/quiz/view.php?id=1', dueAt: null });
  const nowIso = '2026-08-15T00:00:00+07:00';

  it('new item → created', () => {
    const events = diffItems([], [mk('f1', 'Tugas 1')], nowIso);
    assert.equal(events.length, 1); assert.equal(events[0].kind, 'created');
  });
  it('same item → no event', () => {
    const events = diffItems([mk('f1', 'Tugas 1')], [mk('f1', 'Tugas 1')], nowIso);
    assert.equal(events.length, 0);
  });
  it('title changed → updated', () => {
    const events = diffItems([mk('f1', 'Tugas 1')], [mk('f1', 'Tugas 1 REVISI')], nowIso);
    assert.equal(events.length, 1); assert.equal(events[0].kind, 'updated');
  });
  it('item gone → removed', () => {
    const events = diffItems([mk('f1', 'Tugas 1')], [], nowIso);
    assert.equal(events.length, 1); assert.equal(events[0].kind, 'removed');
  });
  it('multiple changes', () => {
    const events = diffItems([mk('f1', 'A'), mk('f2', 'B')], [mk('f1', 'A'), mk('f3', 'C')], nowIso);
    const kinds = events.map((e) => e.kind).sort();
    assert.deepEqual(kinds, ['created', 'removed']);
  });
});

describe('sanityCheck', () => {
  const sane = { maxDropRatio: 0.5, maxNewBurst: 15, minBaseline: 5 };
  it('first-run → ok', () => { assert.deepEqual(sanityCheck([], [{ fingerprint: 'x' }], sane), { ok: true, reason: 'first-run' }); });
  it('empty dashboard → block', () => {
    const prev = Array.from({ length: 10 }, (_, i) => ({ fingerprint: String(i) }));
    assert.equal(sanityCheck(prev, [], sane).ok, false);
  });
  it('drop >50% → block', () => {
    const prev = Array.from({ length: 10 }, (_, i) => ({ fingerprint: String(i) }));
    const next = Array.from({ length: 3 }, (_, i) => ({ fingerprint: String(i) }));
    assert.equal(sanityCheck(prev, next, sane).ok, false);
  });
  it('normal drop → ok', () => {
    const prev = Array.from({ length: 10 }, (_, i) => ({ fingerprint: String(i) }));
    const next = Array.from({ length: 6 }, (_, i) => ({ fingerprint: String(i) }));
    assert.deepEqual(sanityCheck(prev, next, sane), { ok: true, reason: 'ok' });
  });
});

describe('redact', () => {
  it('MoodleSession', () => { assert.match(redact('MoodleSession=abc123'), /\[REDACTED\]/); });
  it('username=xxx', () => { assert.match(redact('username=secret'), /\[REDACTED\]/); });
  it('logintoken in URL', () => { assert.match(redact('login.php?logintoken=xyz'), /\[REDACTED\]/); });
  it('passthrough', () => { assert.equal(redact('normal text'), 'normal text'); });
});
