import { strict as assert } from 'assert';
import { buildStatusLabel, parseTrack } from '../../src/git/gitParsing';

describe('git parsing', () => {
  it('parses track info', () => {
    assert.deepEqual(parseTrack(undefined), { ahead: 0, behind: 0, isGone: false });
    assert.deepEqual(parseTrack('gone'), { ahead: 0, behind: 0, isGone: true });
    assert.deepEqual(parseTrack('ahead 2'), { ahead: 2, behind: 0, isGone: false });
    assert.deepEqual(parseTrack('behind 3'), { ahead: 0, behind: 3, isGone: false });
    assert.deepEqual(parseTrack('ahead 1, behind 4'), { ahead: 1, behind: 4, isGone: false });
  });

  it('builds status labels', () => {
    const label = buildStatusLabel({
      isCurrent: true,
      isGone: false,
      hasUpstream: true,
      ahead: 1,
      behind: 0,
      isMerged: false,
      isStale: true,
      ageDays: 10
    });
    assert.equal(label, 'current · ahead 1 · stale 10d');
  });

  it('reports clean when nothing applies', () => {
    const label = buildStatusLabel({
      isCurrent: false,
      isGone: false,
      hasUpstream: true,
      ahead: 0,
      behind: 0,
      isMerged: false,
      isStale: false
    });
    assert.equal(label, 'clean');
  });
});
