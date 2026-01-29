import * as vscode from 'vscode';
import type { StateStore } from './stateStore';

export type FilterScope = 'workspace' | 'global';

const FILTERS_REVISION_KEY = 'forgeflow.filters.revision.v1';

export function getFilterScope(): FilterScope {
  const scope = vscode.workspace.getConfiguration('forgeflow').get<FilterScope>('filters.scope', 'workspace');
  return scope === 'global' ? 'global' : 'workspace';
}

export function getFiltersRevision(state: StateStore): string {
  return state.getGlobal<string>(FILTERS_REVISION_KEY, '0');
}

export function getScopedValue<T>(state: StateStore, key: string, defaultValue: T): T {
  return getFilterScope() === 'global'
    ? state.getGlobal<T>(key, defaultValue)
    : state.getWorkspace<T>(key, defaultValue);
}

export async function setScopedValue<T>(state: StateStore, key: string, value: T): Promise<void> {
  if (getFilterScope() === 'global') {
    await state.setGlobal(key, value);
    await bumpFiltersRevision(state);
  } else {
    await state.setWorkspace(key, value);
  }
}

async function bumpFiltersRevision(state: StateStore): Promise<void> {
  await state.setGlobal(FILTERS_REVISION_KEY, createRevisionStamp());
}

function createRevisionStamp(): string {
  const base = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}
