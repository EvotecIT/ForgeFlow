import type * as vscode from 'vscode';

export class StateStore {
  public constructor(private readonly context: vscode.ExtensionContext) {}

  public getGlobal<T>(key: string, defaultValue: T): T {
    const value = this.context.globalState.get<T>(key);
    return value ?? defaultValue;
  }

  public async setGlobal<T>(key: string, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  public getWorkspace<T>(key: string, defaultValue: T): T {
    const value = this.context.workspaceState.get<T>(key);
    return value ?? defaultValue;
  }

  public async setWorkspace<T>(key: string, value: T): Promise<void> {
    await this.context.workspaceState.update(key, value);
  }
}
