import { strict as assert } from 'assert';
import { buildAdminCommand, buildInlinePowerShellArgs, buildProcessCommand, buildTerminalCommand, quotePowerShellLiteral } from '../../src/run/commandBuilder';
import type { PowerShellProfile, RunRequest } from '../../src/models/run';

const profile: PowerShellProfile = {
  id: 'pwsh',
  label: 'PowerShell 7+',
  kind: 'pwsh'
};

describe('PowerShell command builder', () => {
  it('quotes PowerShell literals safely', () => {
    assert.equal(quotePowerShellLiteral("C:\\Temp\\O'Hara.ps1"), "'C:\\Temp\\O''Hara.ps1'");
  });

  it('builds process command with -File', () => {
    const request: RunRequest = { filePath: '/tmp/test.ps1' };
    const command = buildProcessCommand(request, profile);
    assert.equal(command.executable, 'pwsh');
    assert.ok(command.args.includes('-File'));
    assert.ok(command.args.includes('/tmp/test.ps1'));
    if (process.platform === 'win32') {
      assert.ok(command.args.includes('-ExecutionPolicy'));
    }
  });

  it('builds process command with -NoExit when keepOpen is true', () => {
    const request: RunRequest = { filePath: '/tmp/test.ps1' };
    const command = buildProcessCommand(request, profile, true);
    assert.ok(command.args.includes('-NoExit'));
  });

  it('builds terminal command with Set-Location when cwd provided', () => {
    const request: RunRequest = { filePath: '/tmp/test.ps1', workingDirectory: '/tmp' };
    const command = buildTerminalCommand(request);
    assert.ok(command.commandLine.includes('Set-Location'));
    assert.ok(command.commandLine.includes("'/tmp'"));
  });

  it('builds terminal command with keepOpen wrapper when enabled', () => {
    const request: RunRequest = { filePath: '/tmp/test.ps1', workingDirectory: '/tmp' };
    const command = buildTerminalCommand(request, { keepOpen: 'onError', executable: 'pwsh' });
    assert.ok(command.commandLine.includes('pwsh'));
    assert.ok(command.commandLine.includes('Press Enter'));
  });

  it('builds inline args with child process when keepOpen enabled', () => {
    const request: RunRequest = { filePath: '/tmp/test.ps1', workingDirectory: '/tmp' };
    const args = buildInlinePowerShellArgs(request, 'onError', 'pwsh');
    const scriptIndex = args.findIndex((arg) => arg === '-Command');
    assert.ok(scriptIndex >= 0);
    const script = args[scriptIndex + 1];
    assert.equal(typeof script, 'string');
    if (typeof script === 'string') {
      assert.ok(script.includes('pwsh'));
      assert.ok(script.includes('-File'));
      assert.ok(script.includes('Press Enter'));
    }
  });

  it('omits prompt when keepOpenPrompt is false', () => {
    const request: RunRequest = { filePath: '/tmp/test.ps1', workingDirectory: '/tmp' };
    const args = buildInlinePowerShellArgs(request, 'onError', 'pwsh', false);
    const scriptIndex = args.findIndex((arg) => arg === '-Command');
    assert.ok(scriptIndex >= 0);
    const script = args[scriptIndex + 1];
    assert.equal(typeof script, 'string');
    if (typeof script === 'string') {
      assert.equal(script.includes('Press Enter'), false);
      assert.equal(script.includes('$ffExit'), false);
    }
  });

  it('builds admin command with Start-Process', () => {
    const request: RunRequest = { filePath: 'C:\\Temp\\Run.ps1', workingDirectory: 'C:\\Temp' };
    const command = buildAdminCommand(request, profile);
    assert.equal(command.executable, 'powershell.exe');
    assert.ok(command.args.includes('-Command'));
  });

  it('builds admin command with -NoExit when keepOpen is true', () => {
    const request: RunRequest = { filePath: 'C:\\Temp\\Run.ps1', workingDirectory: 'C:\\Temp' };
    const command = buildAdminCommand(request, profile, true);
    const scriptArgIndex = command.args.findIndex((arg) => arg === '-Command');
    assert.ok(scriptArgIndex >= 0);
    const script = command.args[scriptArgIndex + 1];
    assert.equal(typeof script, 'string');
    if (typeof script === 'string') {
      assert.ok(script.includes('-NoExit'));
    }
  });
});
