import type { StateStore } from './stateStore';
import { getScopedValue, setScopedValue } from './filterScope';

const GIT_FILTER_KEY = 'forgeflow.git.filter.v1';

export class GitFilterStore {
  public constructor(private readonly state: StateStore) {}

  public getFilter(): string {
    return getScopedValue(this.state, GIT_FILTER_KEY, '');
  }

  public async setFilter(value: string): Promise<void> {
    await setScopedValue(this.state, GIT_FILTER_KEY, value);
  }
}
