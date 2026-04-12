import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../../src/models/project';
import type { RunRequest } from '../../src/models/run';
import { resolveDotnetProjectFile, runProjectEntryPoint } from '../../src/extension/run/execution';

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

describe('resolveDotnetProjectFile', () => {
  it('prefers sln over slnx when both solution formats are available', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-run-'));
    try {
      const sourcePath = path.join(tempRoot, 'src');
      const filePath = path.join(sourcePath, 'Program.cs');
      const slnPath = path.join(tempRoot, 'Zed.sln');
      const slnxPath = path.join(tempRoot, 'Alpha.slnx');
      await fs.promises.mkdir(sourcePath, { recursive: true });
      await fs.promises.writeFile(filePath, 'Console.WriteLine("test");');
      await fs.promises.writeFile(slnxPath, '<Solution />');
      await fs.promises.writeFile(slnPath, '');

      const resolved = await resolveDotnetProjectFile(filePath, tempRoot);

      assert.equal(resolved?.solutionFile, slnPath);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
