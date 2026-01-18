import type { StateStore } from '../store/stateStore';
import { getScopedValue, setScopedValue } from '../store/filterScope';

const DASHBOARD_FILTER_KEY = 'forgeflow.dashboard.filter.v1';

export class DashboardFilterStore {
  public constructor(private readonly state: StateStore) {}

  public getFilter(): string {
    return getScopedValue(this.state, DASHBOARD_FILTER_KEY, '');
  }

  public async setFilter(value: string): Promise<void> {
    await setScopedValue(this.state, DASHBOARD_FILTER_KEY, value);
  }
}
