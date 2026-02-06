import { strict as assert } from 'assert';
import { DashboardCache } from '../../src/dashboard/cache';

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
}

describe('DashboardCache', () => {
  it('stores and loads cache from workspace scope', async () => {
    const state = new FakeStateStore();
    const cache = new DashboardCache(state as never);
    const rows = [{ repo: 'repo-a' }] as never;

    await cache.save(rows, 123);

    const loaded = cache.load();
    assert.ok(loaded);
    assert.equal(loaded?.updatedAt, 123);
    assert.equal(Array.isArray(loaded?.rows), true);
    assert.equal((loaded?.rows?.length ?? 0), 1);

    const globalValue = state.getGlobal('forgeflow.dashboard.cache.v1', undefined);
    assert.equal(globalValue, undefined);
  });
});
