import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { collectSelectedPaths } from '../../src/extension/selection';

function makeView(selection: unknown[], visible = true): vscode.TreeView<unknown> {
  return { selection, visible } as unknown as vscode.TreeView<unknown>;
}

describe('collectSelectedPaths', () => {
  it('prefers the target when another view has selection', () => {
    const nodeA = { path: '/tmp/a.txt' };
    const nodeB = { path: '/tmp/b.txt' };
    const filesView = makeView([nodeA], false);
    const filesPanelView = makeView([nodeB], true);

    const result = collectSelectedPaths(nodeB, filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/b.txt']);
  });

  it('uses the target view selection when target is in selection', () => {
    const nodeA = { path: '/tmp/a.txt' };
    const nodeB = { path: '/tmp/b.txt' };
    const nodeC = { path: '/tmp/c.txt' };
    const filesView = makeView([nodeA], false);
    const filesPanelView = makeView([nodeB, nodeC], true);

    const result = collectSelectedPaths(nodeB, filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/b.txt', '/tmp/c.txt']);
  });

  it('matches selections by normalized path', () => {
    const nodeA = { path: '/tmp/project/file.txt' };
    const filesView = makeView([nodeA], true);
    const filesPanelView = makeView([], false);

    const result = collectSelectedPaths('/tmp/project/./file.txt', filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/project/file.txt']);
  });

  it('deduplicates selections by normalized path', () => {
    const nodeA = { path: '/tmp/project/file.txt' };
    const nodeB = { path: '/tmp/project/./file.txt' };
    const filesView = makeView([nodeA, nodeB], true);
    const filesPanelView = makeView([], false);

    const result = collectSelectedPaths(undefined, filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/project/file.txt']);
  });

  if (process.platform === 'win32') {
    it('normalizes path casing and separators on Windows', () => {
      const nodeA = { path: 'C:\\Project\\File.txt' };
      const filesView = makeView([nodeA], true);
      const filesPanelView = makeView([], false);

      const result = collectSelectedPaths('c:/project/file.txt', filesView, filesPanelView);
      assert.deepEqual(result, ['C:\\Project\\File.txt']);
    });
  }
});
