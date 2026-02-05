import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { pastePaths } from '../../src/extension/fsActions';
import { deletePaths } from '../../src/extension/fsActions';

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.promises.stat(candidate);
    return true;
  } catch {
    return false;
  }
}

describe('pastePaths', () => {
  it('skips cut+paste into the same folder', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-'));
    try {
      const source = path.join(root, 'file.txt');
      await fs.promises.writeFile(source, 'data');

      await pastePaths(root, { mode: 'cut', paths: [source] });

      assert.equal(await pathExists(source), true);
      assert.equal(await pathExists(path.join(root, 'file - Copy.txt')), false);
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it('creates a copy when copy+pasting into the same folder', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-'));
    try {
      const source = path.join(root, 'file.txt');
      await fs.promises.writeFile(source, 'data');

      await pastePaths(root, { mode: 'copy', paths: [source] });

      assert.equal(await pathExists(source), true);
      assert.equal(await pathExists(path.join(root, 'file - Copy.txt')), true);
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });
});

describe('deletePaths', () => {
  it('continues after a delete failure and reports a warning', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-'));
    const windowAny = vscode.window as unknown as { showWarningMessage: (message: string, ...items: string[]) => Thenable<string | undefined> };
    const workspaceAny = vscode.workspace as unknown as { fs: { delete: (uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }) => Thenable<void> } };
    const originalWarning = windowAny.showWarningMessage;
    const originalDelete = workspaceAny.fs.delete;
    let warnings = 0;
    let lastMessage = '';
    windowAny.showWarningMessage = async (message: string) => {
      if (message.startsWith('ForgeFlow: Delete')) {
        return 'Delete';
      }
      warnings += 1;
      lastMessage = message;
      return undefined;
    };
    try {
      const existing = path.join(root, 'exists.txt');
      const missing = path.join(root, 'missing.txt');
      await fs.promises.writeFile(existing, 'data');

      workspaceAny.fs.delete = async (uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }) => {
        if (uri.fsPath.endsWith('missing.txt')) {
          const err = new Error('ENOENT');
          (err as Error & { code?: string }).code = 'ENOENT';
          throw err;
        }
        return originalDelete(uri, options);
      };

      await deletePaths([existing, missing]);

      assert.equal(await pathExists(existing), false);
      assert.equal(warnings, 1);
      assert.equal(lastMessage.includes('Failed to delete'), true);
    } finally {
      windowAny.showWarningMessage = originalWarning;
      workspaceAny.fs.delete = originalDelete;
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });
});
