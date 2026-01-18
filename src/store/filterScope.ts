import * as vscode from 'vscode';
import type { StateStore } from './stateStore';

export type FilterScope = 'workspace' | 'global';

export function getFilterScope(): FilterScope {
  const scope = vscode.workspace.getConfiguration('forgeflow').get<FilterScope>('filters.scope', 'workspace');
  return scope === 'global' ? 'global' : 'workspace';
}

export function getScopedValue<T>(state: StateStore, key: string, defaultValue: T): T {
  return getFilterScope() === 'global'
    ? state.getGlobal<T>(key, defaultValue)
    : state.getWorkspace<T>(key, defaultValue);
}

export async function setScopedValue<T>(state: StateStore, key: string, value: T): Promise<void> {
  if (getFilterScope() === 'global') {
    await state.setGlobal(key, value);
  } else {
    await state.setWorkspace(key, value);
  }
}
