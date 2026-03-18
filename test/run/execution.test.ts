import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../../src/models/project';
import type { RunRequest } from '../../src/models/run';
import { runProjectEntryPoint } from '../../src/extension/run/execution';

describe('runProjectEntryPoint', () => {
  it('runs the only runnable entry point without showing a picker', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-run-'));
    const scriptPath = path.join(tempRoot, 'build.ps1');
    await fs.promises.writeFile(scriptPath, 'Write-Host test');

    const project: Project = {
      id: 'proj-1',
      name: 'Project One',
      path: tempRoot,
      type: 'powershell',
      tags: [],
      pinnedItems: [],
      entryPointOverrides: []
    };

    let quickPickCalls = 0;
    const originalShowQuickPick = vscode.window.showQuickPick;
    const originalGetConfiguration = vscode.workspace.getConfiguration;
    vscode.window.showQuickPick = async <T extends vscode.QuickPickItem>(): Promise<T | undefined> => {
      quickPickCalls += 1;
      return undefined;
    };
    vscode.workspace.getConfiguration = () => ({
      get: <T>(_key: string, defaultValue?: T): T => defaultValue as T
    }) as never;

    const runRequests: RunRequest[] = [];

    try {
      await runProjectEntryPoint(
        project,
        {
          getEntryPointGroups: async () => ({
            entryPoints: [
              {
                label: 'build.ps1',
                path: scriptPath,
                kind: 'powershell',
                source: 'auto'
              }
            ],
            buildScripts: []
          })
        } as never,
        {
          run: async (request: RunRequest) => {
            runRequests.push(request);
          }
        } as never,
        {
          list: () => [project],
          updateLastActivity: async () => undefined
        } as never,
        {
          list: () => []
        } as never,
        {
          add: async () => undefined
        } as never
      );
    } finally {
      vscode.window.showQuickPick = originalShowQuickPick;
      vscode.workspace.getConfiguration = originalGetConfiguration;
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }

    assert.equal(quickPickCalls, 0);
    assert.equal(runRequests.length, 1);
    assert.equal(runRequests[0]?.filePath, scriptPath);
    assert.equal(runRequests[0]?.projectId, project.id);
    assert.equal(runRequests[0]?.workingDirectory, tempRoot);
  });
});
