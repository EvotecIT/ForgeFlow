import { strict as assert } from 'assert';
import { buildAdminCommand, buildProcessCommand, buildTerminalCommand, quotePowerShellLiteral } from '../../src/run/commandBuilder';
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
