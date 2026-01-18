import { strict as assert } from 'assert';
import { RunHistoryStore } from '../../src/store/runHistoryStore';
import type { RunHistoryEntry } from '../../src/models/run';

class FakeStateStore {
  private readonly state = new Map<string, unknown>();

  public getGlobal<T>(key: string, defaultValue: T): T {
    return (this.state.get(key) as T) ?? defaultValue;
  }

  public async setGlobal<T>(key: string, value: T): Promise<void> {
    this.state.set(key, value);
  }
}

function makeEntry(overrides: Partial<RunHistoryEntry> = {}): RunHistoryEntry {
  return {
    id: overrides.id ?? 'id',
    kind: overrides.kind ?? 'powershell',
    label: overrides.label ?? 'Run',
    timestamp: overrides.timestamp ?? Date.now(),
    filePath: overrides.filePath ?? '/tmp/test.ps1',
    command: overrides.command,
    workingDirectory: overrides.workingDirectory,
    projectId: overrides.projectId,
    profileId: overrides.profileId,
    target: overrides.target,
    taskName: overrides.taskName,
    taskSource: overrides.taskSource
  };
}

describe('RunHistoryStore', () => {
  it('deduplicates by signature and keeps the newest entry', async () => {
    const store = new RunHistoryStore(new FakeStateStore() as never);
    const first = makeEntry({ id: 'a', timestamp: 1, projectId: 'p1' });
    const second = makeEntry({ id: 'b', timestamp: 2, projectId: 'p1' });

    await store.add(first, 10);
    await store.add(second, 10);

    const entries = store.list();
    assert.equal(entries.length, 1);
    assert.ok(entries[0]);
    assert.equal(entries[0]!.id, 'b');
  });

  it('sorts per-project history by time', async () => {
    const store = new RunHistoryStore(new FakeStateStore() as never);
    await store.add(makeEntry({ id: 'a', timestamp: 1, projectId: 'p1', label: 'B', filePath: '/tmp/a.ps1' }), 10);
    await store.add(makeEntry({ id: 'b', timestamp: 3, projectId: 'p1', label: 'A', filePath: '/tmp/b.ps1' }), 10);
    await store.add(makeEntry({ id: 'c', timestamp: 2, projectId: 'p1', label: 'C', filePath: '/tmp/c.ps1' }), 10);

    const entries = store.listForProject('p1', 10, 'time');
    assert.deepEqual(entries.map((entry) => entry.id), ['b', 'c', 'a']);
  });

  it('sorts per-project history by label', async () => {
    const store = new RunHistoryStore(new FakeStateStore() as never);
    await store.add(makeEntry({ id: 'a', timestamp: 1, projectId: 'p1', label: 'Zulu', filePath: '/tmp/a.ps1' }), 10);
    await store.add(makeEntry({ id: 'b', timestamp: 2, projectId: 'p1', label: 'alpha', filePath: '/tmp/b.ps1' }), 10);
    await store.add(makeEntry({ id: 'c', timestamp: 3, projectId: 'p1', label: 'Beta', filePath: '/tmp/c.ps1' }), 10);

    const entries = store.listForProject('p1', 10, 'label');
    assert.deepEqual(entries.map((entry) => entry.id), ['b', 'c', 'a']);
  });

  it('sorts per-project history by type', async () => {
    const store = new RunHistoryStore(new FakeStateStore() as never);
    await store.add(makeEntry({ id: 'a', kind: 'task', projectId: 'p1', label: 'Zed', taskName: 'build' }), 10);
    await store.add(makeEntry({ id: 'b', kind: 'command', projectId: 'p1', label: 'Alpha', command: 'echo hi' }), 10);
    await store.add(makeEntry({ id: 'c', kind: 'powershell', projectId: 'p1', label: 'Beta', filePath: '/tmp/c.ps1' }), 10);

    const entries = store.listForProject('p1', 10, 'type');
    assert.deepEqual(entries.map((entry) => entry.id), ['b', 'c', 'a']);
  });

  it('limits per-project history to max items', async () => {
    const store = new RunHistoryStore(new FakeStateStore() as never);
    await store.add(makeEntry({ id: 'a', timestamp: 1, projectId: 'p1', filePath: '/tmp/a.ps1' }), 10);
    await store.add(makeEntry({ id: 'b', timestamp: 2, projectId: 'p1', filePath: '/tmp/b.ps1' }), 10);
    await store.add(makeEntry({ id: 'c', timestamp: 3, projectId: 'p1', filePath: '/tmp/c.ps1' }), 10);

    const entries = store.listForProject('p1', 2, 'time');
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((entry) => entry.id), ['c', 'b']);
  });
});
