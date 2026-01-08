import type { StateStore } from '../store/stateStore';

const DASHBOARD_FILTER_KEY = 'forgeflow.dashboard.filter.v1';

export class DashboardFilterStore {
  public constructor(private readonly state: StateStore) {}

  public getFilter(): string {
    return this.state.getWorkspace<string>(DASHBOARD_FILTER_KEY, '');
  }

  public async setFilter(value: string): Promise<void> {
    await this.state.setWorkspace(DASHBOARD_FILTER_KEY, value);
  }
}
