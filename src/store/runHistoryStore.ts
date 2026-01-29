import type { StateStore } from './stateStore';
import type { RunHistoryEntry } from '../models/run';
import * as vscode from 'vscode';

const RUN_HISTORY_KEY = 'forgeflow.run.history.v1';
const RUN_HISTORY_REVISION_KEY = 'forgeflow.run.history.revision.v1';

export class RunHistoryStore implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  public constructor(private readonly state: StateStore) {}

  public getRevision(): string {
    return this.state.getGlobal<string>(RUN_HISTORY_REVISION_KEY, '0');
  }

  public list(): RunHistoryEntry[] {
    return this.state.getGlobal<RunHistoryEntry[]>(RUN_HISTORY_KEY, []);
  }

  public async add(entry: RunHistoryEntry, maxItems: number): Promise<void> {
    await this.updateHistory((items) => {
      const signature = buildSignature(entry);
      const filtered = items.filter((item) => buildSignature(item) !== signature);
      filtered.unshift(entry);
      return filtered.slice(0, Math.max(1, maxItems));
    });
  }

  public async clear(): Promise<void> {
    await this.updateHistory(() => []);
  }

  public async remove(id: string): Promise<void> {
    await this.updateHistory((items) => items.filter((entry) => entry.id !== id));
  }

  public async clearForProject(projectId: string): Promise<void> {
    await this.updateHistory((items) => items.filter((entry) => entry.projectId !== projectId));
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

  private async updateHistory(
    mutate: (items: RunHistoryEntry[]) => RunHistoryEntry[]
  ): Promise<void> {
    await this.state.updateGlobalWithRetry(
      RUN_HISTORY_KEY,
      [],
      (current) => mutate(current),
      { revisionKey: RUN_HISTORY_REVISION_KEY }
    );
    this.onDidChangeEmitter.fire();
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
