import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { registerFileCommands, type FileCommandDeps } from '../../src/extension/commands/files';

function makeView(selection: unknown[], visible = true): vscode.TreeView<unknown> {
  return { selection, visible } as unknown as vscode.TreeView<unknown>;
}

function createDeps(filesView: vscode.TreeView<unknown>, filesPanelView: vscode.TreeView<unknown>) {
  const refreshCalls: boolean[] = [];
  const deps = {
    context: { subscriptions: [] } as unknown as vscode.ExtensionContext,
    filesProvider: {
      refresh: () => undefined,
      listWorktreePaths: async () => [],
      listWorktreePathsForRepo: async () => [],
      getFilter: () => '',
      setFilter: () => undefined
    } as unknown as FileCommandDeps['filesProvider'],
    filesView,
    filesPanelView,
    projectsProvider: {
      refresh: async (force?: boolean) => {
        refreshCalls.push(Boolean(force));
      }
    } as unknown as FileCommandDeps['projectsProvider'],
    favoritesStore: {
      pinToWorkspace: async () => undefined,
      unpinFromWorkspace: async () => undefined,
      remove: async () => undefined,
      move: async () => undefined
    } as unknown as FileCommandDeps['favoritesStore'],
    filterPresetStore: {} as FileCommandDeps['filterPresetStore'],
    refreshCalls
  };
  return deps;
}

describe('registerFileCommands delete', () => {
  it('deletes multiselection from forgeflow.files keyboard context', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-'));
    const fileA = path.join(root, 'a.txt');
    const fileB = path.join(root, 'b.txt');
    const panelOnly = path.join(root, 'panel.txt');
    await fs.promises.writeFile(fileA, 'a');
    await fs.promises.writeFile(fileB, 'b');
    await fs.promises.writeFile(panelOnly, 'c');

    const filesView = makeView([{ path: fileA }, { path: fileB }], true);
    const filesPanelView = makeView([{ path: panelOnly }], true);
    const deps = createDeps(filesView, filesPanelView);
    const windowAny = vscode.window as unknown as {
      showWarningMessage: (message: string, ...items: string[]) => Thenable<string | undefined>;
    };
    const originalWarning = windowAny.showWarningMessage;
    windowAny.showWarningMessage = async (message: string) => {
      if (message.startsWith('ForgeFlow: Delete')) {
        return 'Delete';
      }
      return undefined;
    };

    try {
      registerFileCommands(deps);

      await vscode.commands.executeCommand('forgeflow.files.delete', { viewId: 'forgeflow.files' });

      assert.equal(fs.existsSync(fileA), false);
      assert.equal(fs.existsSync(fileB), false);
      assert.equal(fs.existsSync(panelOnly), true);
      assert.equal(deps.refreshCalls.length, 1);
    } finally {
      windowAny.showWarningMessage = originalWarning;
      await fs.promises.rm(root, { recursive: true, force: true });
      for (const disposable of deps.context.subscriptions) {
        (disposable as { dispose?: () => void }).dispose?.();
      }
    }
  });

  it('deletes multiselection from forgeflow.files.panel keyboard context', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-'));
    const fileA = path.join(root, 'a.txt');
    const fileB = path.join(root, 'b.txt');
    const sideOnly = path.join(root, 'side.txt');
    await fs.promises.writeFile(fileA, 'a');
    await fs.promises.writeFile(fileB, 'b');
    await fs.promises.writeFile(sideOnly, 'c');

    const filesView = makeView([{ path: sideOnly }], true);
    const filesPanelView = makeView([{ path: fileA }, { path: fileB }], true);
    const deps = createDeps(filesView, filesPanelView);
    const windowAny = vscode.window as unknown as {
      showWarningMessage: (message: string, ...items: string[]) => Thenable<string | undefined>;
    };
    const originalWarning = windowAny.showWarningMessage;
    windowAny.showWarningMessage = async (message: string) => {
      if (message.startsWith('ForgeFlow: Delete')) {
        return 'Delete';
      }
      return undefined;
    };

    try {
      registerFileCommands(deps);

      await vscode.commands.executeCommand('forgeflow.files.delete', { viewId: 'forgeflow.files.panel' });

      assert.equal(fs.existsSync(fileA), false);
      assert.equal(fs.existsSync(fileB), false);
      assert.equal(fs.existsSync(sideOnly), true);
      assert.equal(deps.refreshCalls.length, 1);
    } finally {
      windowAny.showWarningMessage = originalWarning;
      await fs.promises.rm(root, { recursive: true, force: true });
      for (const disposable of deps.context.subscriptions) {
        (disposable as { dispose?: () => void }).dispose?.();
      }
    }
  });
});
