import type { StateStore } from './stateStore';
import type { RunHistoryEntry } from '../models/run';
import * as vscode from 'vscode';

const RUN_HISTORY_KEY = 'forgeflow.run.history.v1';

export class RunHistoryStore implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  public constructor(private readonly state: StateStore) {}

  public list(): RunHistoryEntry[] {
    return this.state.getGlobal<RunHistoryEntry[]>(RUN_HISTORY_KEY, []);
  }

  public async add(entry: RunHistoryEntry, maxItems: number): Promise<void> {
    const items = this.list();
    const signature = buildSignature(entry);
    const filtered = items.filter((item) => buildSignature(item) !== signature);
    filtered.unshift(entry);
    const limited = filtered.slice(0, Math.max(1, maxItems));
    await this.state.setGlobal(RUN_HISTORY_KEY, limited);
    this.onDidChangeEmitter.fire();
  }

  public async clear(): Promise<void> {
    await this.state.setGlobal<RunHistoryEntry[]>(RUN_HISTORY_KEY, []);
    this.onDidChangeEmitter.fire();
  }

  public async remove(id: string): Promise<void> {
    const items = this.list().filter((entry) => entry.id !== id);
    await this.state.setGlobal(RUN_HISTORY_KEY, items);
    this.onDidChangeEmitter.fire();
  }

  public async clearForProject(projectId: string): Promise<void> {
    const items = this.list().filter((entry) => entry.projectId !== projectId);
    await this.state.setGlobal(RUN_HISTORY_KEY, items);
    this.onDidChangeEmitter.fire();
  }

  public listForProject(
    projectId: string,
    maxItems: number,
    sortMode: 'time' | 'label' | 'type' = 'time'
  ): RunHistoryEntry[] {
    const items = this.list().filter((entry) => entry.projectId === projectId);
    items.sort((a, b) => compareHistoryEntries(a, b, sortMode));
    return items.slice(0, Math.max(1, maxItems));
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

function buildSignature(entry: RunHistoryEntry): string {
  const signature = [
    entry.kind,
    entry.filePath,
    entry.command,
    entry.workingDirectory,
    entry.projectId,
    entry.profileId,
    entry.target,
    entry.taskName,
    entry.taskSource
  ].filter(Boolean).join('|');
  return process.platform === 'win32' ? signature.toLowerCase() : signature;
}

function compareHistoryEntries(
  a: RunHistoryEntry,
  b: RunHistoryEntry,
  sortMode: 'time' | 'label' | 'type'
): number {
  if (sortMode === 'label') {
    const labelCompare = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    return labelCompare !== 0 ? labelCompare : b.timestamp - a.timestamp;
  }
  if (sortMode === 'type') {
    const typeCompare = a.kind.localeCompare(b.kind);
    if (typeCompare !== 0) {
      return typeCompare;
    }
    const labelCompare = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    return labelCompare !== 0 ? labelCompare : b.timestamp - a.timestamp;
  }
  return b.timestamp - a.timestamp;
}
