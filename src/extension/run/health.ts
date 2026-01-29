import * as vscode from 'vscode';
import { getForgeFlowSettings } from '../../util/config';
import { resolveProfile, resolveExecutablePath } from '../../run/powershellProfiles';

export function schedulePowerShellProfileHealthCheck(delayMs = 1500): void {
  setTimeout(() => {
    void checkPowerShellProfileHealth();
  }, delayMs);
}

async function checkPowerShellProfileHealth(): Promise<void> {
  const settings = getForgeFlowSettings();
  const defaultId = settings.defaultProfileId;
  if (!defaultId) {
    return;
  }
  const profile = resolveProfile(defaultId, settings.powershellProfiles);
  if (!profile) {
    return;
  }
  const executable = resolveExecutablePath(profile);
  if (executable) {
    return;
  }

  const detail = profile.kind === 'custom' && profile.executablePath ? ` (${profile.executablePath})` : '';
  const choice = await vscode.window.showWarningMessage(
    `ForgeFlow: Default PowerShell profile "${profile.label}"${detail} is not available.`,
    'Manage Profiles',
    'Open Settings'
  );
  if (choice === 'Manage Profiles') {
    await vscode.commands.executeCommand('forgeflow.powershell.manageProfiles');
  } else if (choice === 'Open Settings') {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'forgeflow.powershell');
  }
}
