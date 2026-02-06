import { strict as assert } from 'assert';
import { ProjectsStore } from '../../src/store/projectsStore';

class FakeStateStore {
  private readonly globalState = new Map<string, unknown>();
  private readonly workspaceState = new Map<string, unknown>();

  public getGlobal<T>(key: string, defaultValue: T): T {
    return (this.globalState.get(key) as T) ?? defaultValue;
  }

  public async setGlobal<T>(key: string, value: T): Promise<void> {
    this.globalState.set(key, value);
  }

  public getWorkspace<T>(key: string, defaultValue: T): T {
    return (this.workspaceState.get(key) as T) ?? defaultValue;
  }

  public async setWorkspace<T>(key: string, value: T): Promise<void> {
    this.workspaceState.set(key, value);
  }

  public async updateGlobalWithRetry<T>(
    key: string,
    defaultValue: T,
    mutate: (current: T) => T
  ): Promise<T> {
    const current = this.getGlobal<T>(key, defaultValue);
    const next = mutate(clone(current));
    await this.setGlobal(key, next);
    return next;
  }

  public async updateWorkspaceWithRetry<T>(
    key: string,
    defaultValue: T,
    mutate: (current: T) => T
  ): Promise<T> {
    const current = this.getWorkspace<T>(key, defaultValue);
    const next = mutate(clone(current));
    await this.setWorkspace(key, next);
    return next;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

describe('ProjectsStore', () => {
  it('bumps workspace revision when favoritesOnly changes', async () => {
    const state = new FakeStateStore();
    const store = new ProjectsStore(state as never);
    const before = store.getWorkspaceRevision();

    await store.setFavoritesOnly(true);

    const after = store.getWorkspaceRevision();
    assert.equal(store.getFavoritesOnly(), true);
    assert.notEqual(after, before);
  });

  it('does not acquire scan lock when held by another owner', async () => {
    const state = new FakeStateStore();
    await state.setGlobal('forgeflow.projects.scanLock.v1', {
      owner: 'owner-a',
      token: 'token-a',
      expiresAt: Date.now() + 60_000
    });
    const store = new ProjectsStore(state as never);

    const acquired = await store.tryAcquireScanLock('owner-b', 30_000);

    assert.equal(acquired, false);
  });

  it('acquires scan lock when existing lock is expired', async () => {
    const state = new FakeStateStore();
    await state.setGlobal('forgeflow.projects.scanLock.v1', {
      owner: 'owner-a',
      token: 'token-a',
      expiresAt: Date.now() - 1
    });
    const store = new ProjectsStore(state as never);

    const acquired = await store.tryAcquireScanLock('owner-b', 30_000);

    assert.equal(acquired, true);
    const lock = store.getScanLock();
    assert.ok(lock);
    assert.equal(lock?.owner, 'owner-b');
    assert.equal(typeof lock?.token, 'string');
    assert.ok((lock?.token?.length ?? 0) > 0);
  });

  it('releases scan lock only for the lock owner', async () => {
    const state = new FakeStateStore();
    const store = new ProjectsStore(state as never);
    const acquired = await store.tryAcquireScanLock('owner-a', 30_000);
    assert.equal(acquired, true);

    await store.releaseScanLock('owner-b');
    assert.ok(store.getScanLock());

    await store.releaseScanLock('owner-a');
    assert.equal(store.getScanLock(), undefined);
  });
});
