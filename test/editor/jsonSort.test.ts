import { strict as assert } from 'assert';
import { applySelectionBaseIndent, orderKeys, sortJsonText } from '../../src/editor/jsonSort';

describe('json sorting', () => {
  it('sorts object keys recursively', () => {
    assert.equal(
      sortJsonText('{"z":1,"a":{"b":2,"a":1}}', { mode: 'alpha', direction: 'asc', indent: 2 }),
      '{\n  "a": {\n    "a": 1,\n    "b": 2\n  },\n  "z": 1\n}'
    );
  });

  it('sorts alphanumerically', () => {
    const sorted = orderKeys(['item10', 'item2', 'item1'], {}, { mode: 'alphaNumeric', direction: 'asc' });
    assert.deepEqual(sorted, ['item1', 'item2', 'item10']);
  });

  it('supports override and underride keys', () => {
    const sorted = orderKeys(['version', 'name', 'scripts', 'dependencies'], {}, {
      mode: 'alpha',
      direction: 'asc',
      orderOverride: ['name', 'version'],
      orderUnderride: ['dependencies']
    });
    assert.deepEqual(sorted, ['name', 'version', 'scripts', 'dependencies']);
  });

  it('accepts comments and trailing commas while producing clean JSON', () => {
    assert.equal(
      sortJsonText('{\n  // keep parseable\n  "b": 2,\n  "a": 1,\n}', {
        mode: 'alpha',
        direction: 'asc',
        indent: 2
      }),
      '{\n  "a": 1,\n  "b": 2\n}'
    );
  });

  it('offsets sorted selection continuation lines to the selection column', () => {
    assert.equal(
      applySelectionBaseIndent('{\n  "a": 1,\n  "b": 2\n}', 4),
      '{\n      "a": 1,\n      "b": 2\n    }'
    );
  });
});
