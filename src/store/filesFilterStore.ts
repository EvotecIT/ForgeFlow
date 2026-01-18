import type { StateStore } from './stateStore';
import { getScopedValue, setScopedValue } from './filterScope';

const FILES_FILTER_KEY = 'forgeflow.files.filter.v1';

export class FilesFilterStore {
  public constructor(private readonly state: StateStore) {}

  public getFilter(): string {
    return getScopedValue(this.state, FILES_FILTER_KEY, '');
  }

  public async setFilter(value: string): Promise<void> {
    await setScopedValue(this.state, FILES_FILTER_KEY, value);
  }
}
