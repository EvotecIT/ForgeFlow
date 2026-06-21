import type { StateStore } from './stateStore';
import * as vscode from 'vscode';

const LAYOUT_KEY = 'forgeflow.layout.mode.v1';
const CONFIG_KEY = 'layout.mode';

export type LayoutMode = 'compact' | 'expanded';

export class LayoutStore {
  public constructor(private readonly state: StateStore) {}

  public getMode(): LayoutMode {
    const configured = getConfiguredMode(vscode.workspace.getConfiguration('forgeflow'));
    if (isLayoutMode(configured)) {
      return configured;
    }
    return this.state.getGlobal<LayoutMode>(LAYOUT_KEY, 'compact');
  }

  public async setMode(mode: LayoutMode): Promise<void> {
    await vscode.workspace.getConfiguration('forgeflow').update(CONFIG_KEY, mode, vscode.ConfigurationTarget.Global);
    await this.state.setGlobal(LAYOUT_KEY, mode);
  }

  public async syncConfiguration(): Promise<void> {
    const config = vscode.workspace.getConfiguration('forgeflow');
    const configured = getConfiguredMode(config);
    if (isLayoutMode(configured)) {
      return;
    }
    const stored = this.state.getGlobal<LayoutMode>(LAYOUT_KEY, 'compact');
    if (stored !== 'compact') {
      await config.update(CONFIG_KEY, stored, vscode.ConfigurationTarget.Global);
    }
  }
}

function isLayoutMode(value: unknown): value is LayoutMode {
  return value === 'compact' || value === 'expanded';
}

function getConfiguredMode(config: vscode.WorkspaceConfiguration): LayoutMode | undefined {
  const inspected = config.inspect<LayoutMode>(CONFIG_KEY);
  const configured = inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue;
  return isLayoutMode(configured) ? configured : undefined;
}
