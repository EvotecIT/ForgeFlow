import * as path from 'path';
import * as vscode from 'vscode';
import type { PowerShellProfile } from '../../models/run';
import { getAllProfiles, profileKindIcon, profileKindLabel } from '../../run/powershellProfiles';
import { stableIdFromPath } from '../../util/ids';
import { pickExecutablePath } from '../browserUtils';

export async function chooseProfileId(allowClear = false): Promise<string | null | undefined> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const profiles = config.get<PowerShellProfile[]>('powershell.profiles', []);
  const allProfiles = getAllProfiles(profiles);
  const items: Array<vscode.QuickPickItem & { id?: string; clear?: boolean }> = [];
  if (allowClear) {
    items.push({
      label: '$(circle-slash) Use default',
      description: 'Clear override',
      clear: true
    });
  }
  items.push({
    label: '$(plus) Add custom profile...',
    description: 'Choose a PowerShell executable'
  });
  for (const profile of allProfiles) {
    const icon = profileKindIcon(profile.kind);
    const label = icon ? `$(${icon}) ${profile.label}` : profile.label;
    const description = profileKindLabel(profile.kind);
    const detail = profile.kind === 'custom' ? profile.executablePath : undefined;
    items.push({ label, description, detail, id: profile.id });
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: allowClear ? 'Select PowerShell profile (or use default)' : 'Select PowerShell profile',
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!picked) {
    return undefined;
  }
  if (picked.clear) {
    return null;
  }
  if (!picked.id && picked.label.includes('Add custom profile')) {
    const customId = await createCustomProfile();
    return customId ?? undefined;
  }
  return picked.id;
}

export async function createCustomProfile(): Promise<string | undefined> {
  const exePath = await pickExecutablePath('Select PowerShell executable');
  if (!exePath) {
    return undefined;
  }
  const defaultLabel = path.basename(exePath);
  const label = await vscode.window.showInputBox({
    title: 'Profile label',
    prompt: 'Label for the custom profile',
    value: defaultLabel
  });
  if (!label) {
    return undefined;
  }
  const profile: PowerShellProfile = {
    id: `custom-${stableIdFromPath(exePath)}`,
    label,
    kind: 'custom',
    executablePath: exePath
  };
  const config = vscode.workspace.getConfiguration('forgeflow');
  const profiles = config.get<PowerShellProfile[]>('powershell.profiles', []);
  const nextProfiles = profiles.some((existing) => existing.id === profile.id)
    ? profiles.map((existing) => (existing.id === profile.id ? profile : existing))
    : [...profiles, profile];
  await config.update('powershell.profiles', nextProfiles, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage('ForgeFlow: Custom PowerShell profile added.', 3000);
  return profile.id;
}

export async function pickExternalSessionTarget(): Promise<{ profileId?: string; label?: string } | undefined> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const profiles = config.get<PowerShellProfile[]>('powershell.profiles', []);
  const allProfiles = getAllProfiles(profiles);
  const items: Array<vscode.QuickPickItem & { profileId?: string; all?: boolean }> = [
    {
      label: '$(trash) All external sessions',
      description: 'Reset all external PowerShell sessions',
      all: true
    }
  ];

  for (const profile of allProfiles) {
    const icon = profileKindIcon(profile.kind);
    const label = icon ? `$(${icon}) ${profile.label}` : profile.label;
    const description = profileKindLabel(profile.kind);
    const detail = profile.kind === 'custom' ? profile.executablePath : undefined;
    items.push({
      label,
      description,
      detail,
      profileId: profile.id
    });
  }

  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select external session to reset' });
  if (!pick) {
    return undefined;
  }
  if (pick.all) {
    return {};
  }
  if (!pick.profileId) {
    return undefined;
  }
  return { profileId: pick.profileId, label: pick.label };
}

export async function managePowerShellProfiles(): Promise<void> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const profiles = config.get<PowerShellProfile[]>('powershell.profiles', []);
  const allProfiles = getAllProfiles(profiles);
  const items: Array<vscode.QuickPickItem & { action: 'add' | 'edit' | 'remove'; profileId?: string }> = [
    {
      label: '$(plus) Add custom profile...',
      description: 'Choose a PowerShell executable',
      action: 'add'
    }
  ];
  for (const profile of allProfiles) {
    const icon = profileKindIcon(profile.kind);
    const label = icon ? `$(${icon}) ${profile.label}` : profile.label;
    const description = profileKindLabel(profile.kind);
    const detail = profile.kind === 'custom' ? profile.executablePath : 'Built-in profile';
    items.push({ label, description: `Edit ${description}`, detail, action: 'edit', profileId: profile.id });
    if (profile.kind === 'custom') {
      items.push({
        label,
        description: `Remove ${description}`,
        detail,
        action: 'remove',
        profileId: profile.id
      });
    }
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Manage PowerShell profiles',
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!pick) {
    return;
  }
  if (pick.action === 'add') {
    await createCustomProfile();
    return;
  }
  if (!pick.profileId) {
    return;
  }

  const existing = profiles.find((profile) => profile.id === pick.profileId);
  if (!existing) {
    vscode.window.showWarningMessage('ForgeFlow: Built-in profiles cannot be edited here.');
    return;
  }

  if (pick.action === 'remove') {
    const confirm = await vscode.window.showWarningMessage(
      `ForgeFlow: Remove PowerShell profile "${existing.label}"?`,
      { modal: true },
      'Remove'
    );
    if (confirm !== 'Remove') {
      return;
    }
    const nextProfiles = profiles.filter((profile) => profile.id !== existing.id);
    await config.update('powershell.profiles', nextProfiles, vscode.ConfigurationTarget.Global);
    const defaultId = config.get<string | undefined>('powershell.defaultProfileId');
    if (defaultId === existing.id) {
      await config.update('powershell.defaultProfileId', undefined, vscode.ConfigurationTarget.Global);
    }
    vscode.window.setStatusBarMessage('ForgeFlow: PowerShell profile removed.', 3000);
    return;
  }

  const newLabel = await vscode.window.showInputBox({
    title: 'Profile label',
    prompt: 'Label for the PowerShell profile',
    value: existing.label
  });
  if (!newLabel) {
    return;
  }
  const newPath = await vscode.window.showInputBox({
    title: 'Executable path',
    prompt: 'Path to the PowerShell executable',
    value: existing.executablePath ?? ''
  });
  if (!newPath) {
    return;
  }
  const updated: PowerShellProfile = {
    ...existing,
    label: newLabel,
    executablePath: newPath
  };
  const nextProfiles = profiles.map((profile) => (profile.id === existing.id ? updated : profile));
  await config.update('powershell.profiles', nextProfiles, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage('ForgeFlow: PowerShell profile updated.', 3000);
}
