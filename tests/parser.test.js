import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeSources } from '../src/parser.js';

describe('mergeSources', () => {
  it('dedup by URL', () => {
    const timeline = [
      { title: 'UH 1', url: '/mod/quiz/view.php?id=1', course: 'Matematika', dateText: '12 Aug 10:00' },
    ];
    const cal = [
      { title: 'UH 1 (Calendar)', url: '/mod/quiz/view.php?id=1', course: '', dateText: '12 Aug 10:00' },
    ];
    const merged = mergeSources(timeline, cal);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].course, 'Matematika'); // timeline wins
  });
  it('different URL → kept separate', () => {
    const merged = mergeSources(
      [{ title: 'A', url: '/mod/quiz/view.php?id=1', course: 'X', dateText: '' }],
      [{ title: 'B', url: '/mod/quiz/view.php?id=2', course: 'Y', dateText: '' }],
    );
    assert.equal(merged.length, 2);
  });
  it('skip items without URL', () => {
    const merged = mergeSources([{ title: 'No URL', url: '', course: '', dateText: '' }], []);
    assert.equal(merged.length, 0);
  });
  it('empty inputs', () => {
    assert.deepEqual(mergeSources([], []), []);
  });
});
