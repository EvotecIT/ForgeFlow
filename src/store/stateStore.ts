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

  public async updateGlobalWithRetry<T>(
    key: string,
    defaultValue: T,
    mutate: (current: T) => T,
    options?: { attempts?: number; revisionKey?: string }
  ): Promise<T> {
    const attempts = Math.max(1, options?.attempts ?? 3);
    const revisionKey = options?.revisionKey;
    let lastValue = this.getGlobal<T>(key, defaultValue);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = this.getGlobal<T>(key, defaultValue);
      const next = mutate(cloneValue(current));
      lastValue = next;
      await this.setGlobal(key, next);
      if (!revisionKey) {
        return next;
      }
      const revision = createRevisionStamp();
      await this.setGlobal(revisionKey, revision);
      const stored = this.getGlobal<string>(revisionKey, '');
      if (stored === revision) {
        return next;
      }
    }
    return lastValue;
  }

  public async updateWorkspaceWithRetry<T>(
    key: string,
    defaultValue: T,
    mutate: (current: T) => T,
    options?: { attempts?: number; revisionKey?: string }
  ): Promise<T> {
    const attempts = Math.max(1, options?.attempts ?? 3);
    const revisionKey = options?.revisionKey;
    let lastValue = this.getWorkspace<T>(key, defaultValue);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = this.getWorkspace<T>(key, defaultValue);
      const next = mutate(cloneValue(current));
      lastValue = next;
      await this.setWorkspace(key, next);
      if (!revisionKey) {
        return next;
      }
      const revision = createRevisionStamp();
      await this.setWorkspace(revisionKey, revision);
      const stored = this.getWorkspace<string>(revisionKey, '');
      if (stored === revision) {
        return next;
      }
    }
    return lastValue;
  }
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return [...value] as unknown as T;
  }
  if (value && typeof value === 'object') {
    return { ...(value as Record<string, unknown>) } as T;
  }
  return value;
}

function createRevisionStamp(): string {
  const base = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}
