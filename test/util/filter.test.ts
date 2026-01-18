import { strict as assert } from 'assert';
import { matchesFilter, matchesFilterQuery } from '../../src/util/filter';

describe('filter matching', () => {
  it('matches substrings', () => {
    assert.equal(matchesFilter('ForgeFlow', 'flow', 'substring'), true);
    assert.equal(matchesFilter('ForgeFlow', 'zz', 'substring'), false);
  });

  it('matches fuzzy subsequences', () => {
    assert.equal(matchesFilter('ForgeFlow', 'ff', 'fuzzy'), true);
    assert.equal(matchesFilter('ForgeFlow', 'fgw', 'fuzzy'), true);
    assert.equal(matchesFilter('ForgeFlow', 'zf', 'fuzzy'), false);
  });

  it('supports include/exclude tokens', () => {
    assert.equal(matchesFilterQuery('ForgeFlow project runner', 'forge -runner', 'substring'), false);
    assert.equal(matchesFilterQuery('ForgeFlow project runner', 'forge runner', 'substring'), true);
    assert.equal(matchesFilterQuery('ForgeFlow project runner', '+forge -runner', 'substring'), false);
  });

  it('supports quoted tokens', () => {
    assert.equal(matchesFilterQuery('ForgeFlow project runner', '"project runner"', 'substring'), true);
    assert.equal(matchesFilterQuery('ForgeFlow project runner', '"project runner" -forge', 'substring'), false);
  });
});
