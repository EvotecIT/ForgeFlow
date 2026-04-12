import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { RunService } from '../../src/run/runService';
import type { PowerShellProfile, RunRequest } from '../../src/models/run';

describe('RunService', () => {
  it('uses managed terminals for integrated reused runs even when echoCommand is disabled', async () => {
    const profile: PowerShellProfile = {
      id: 'custom-pwsh',
      label: 'Custom PowerShell',
      kind: 'custom',
      executablePath: process.execPath
    };

    const originalGetConfiguration = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = () => ({
      get: <T>(key: string, defaultValue?: T): T => {
        const values = new Map<string, unknown>([
          ['powershell.profiles', [profile]],
          ['powershell.defaultProfileId', profile.id],
          ['run.defaultTarget', 'integrated'],
          ['run.integrated.reuseTerminal', true],
          ['run.integrated.reuseScope', 'profile'],
          ['run.integrated.perProjectTerminal', true],
          ['run.integrated.keepOpen', 'never'],
          ['run.integrated.echoCommand', false],
          ['run.integrated.keepOpenPrompt', true],
          ['run.showProfileToast', false]
        ]);
        return (values.has(key) ? values.get(key) : defaultValue) as T;
      }
    }) as never;

    const sentCommands: Array<{ text: string; addNewLine?: boolean }> = [];
    const terminal = {
      show: () => undefined,
      sendText: (text: string, addNewLine?: boolean) => {
        sentCommands.push({ text, addNewLine });
      }
    };

    const requests: Array<{ profile: PowerShellProfile; options: unknown }> = [];
    const service = new RunService(
      {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      } as never,
      {
        list: () => []
      } as never,
      {
        list: () => []
      } as never,
      {
        getTerminal: (requestedProfile: PowerShellProfile, options: unknown) => {
          requests.push({ profile: requestedProfile, options });
          return terminal as never;
        }
      } as never
    );

    const request: RunRequest = {
      filePath: '/tmp/test.ps1',
      workingDirectory: '/tmp',
      target: 'integrated',
      profileId: profile.id
    };

    try {
      await service.run(request);
    } finally {
      vscode.workspace.getConfiguration = originalGetConfiguration;
    }

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.profile.id, profile.id);
    assert.equal(sentCommands.length, 1);
    assert.equal(sentCommands[0]?.addNewLine, true);
    assert.ok(sentCommands[0]?.text.includes('/tmp/test.ps1'));
  });

  it('passes explicit new-terminal runs through with reuse disabled', async () => {
    const profile: PowerShellProfile = {
      id: 'custom-pwsh',
      label: 'Custom PowerShell',
      kind: 'custom',
      executablePath: process.execPath
    };

    const originalGetConfiguration = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = () => ({
      get: <T>(key: string, defaultValue?: T): T => {
        const values = new Map<string, unknown>([
          ['powershell.profiles', [profile]],
          ['powershell.defaultProfileId', profile.id],
          ['run.defaultTarget', 'integrated'],
          ['run.integrated.reuseTerminal', true],
          ['run.integrated.reuseScope', 'profile'],
          ['run.integrated.perProjectTerminal', true],
          ['run.integrated.keepOpen', 'never'],
          ['run.integrated.echoCommand', false],
          ['run.integrated.keepOpenPrompt', true],
          ['run.showProfileToast', false]
        ]);
        return (values.has(key) ? values.get(key) : defaultValue) as T;
      }
    }) as never;

    const requests: Array<{ profile: PowerShellProfile; options: unknown }> = [];
    const service = new RunService(
      {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      } as never,
      {
        list: () => []
      } as never,
      {
        list: () => []
      } as never,
      {
        getTerminal: (requestedProfile: PowerShellProfile, options: unknown) => {
          requests.push({ profile: requestedProfile, options });
          return {
            show: () => undefined,
            sendText: () => undefined
          } as never;
        }
      } as never
    );

    const request: RunRequest = {
      filePath: '/tmp/test.ps1',
      workingDirectory: '/tmp',
      target: 'integrated',
      profileId: profile.id,
      reuseTerminal: false
    };

    try {
      await service.run(request);
    } finally {
      vscode.workspace.getConfiguration = originalGetConfiguration;
    }

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.profile.id, profile.id);
    assert.deepEqual(requests[0]?.options, {
      reuseTerminal: false,
      reuseScope: 'profile',
      perProject: true,
      projectId: undefined,
      workingDirectory: '/tmp',
      shellPath: process.execPath
    });
  });
});
