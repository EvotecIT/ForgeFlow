import type { DashboardRow } from './dashboardService';
import type { StateStore } from '../store/stateStore';

const DASHBOARD_CACHE_KEY = 'forgeflow.dashboard.cache.v1';

export interface DashboardCacheData {
  updatedAt: number;
  rows: DashboardRow[];
}

export class DashboardCache {
  public constructor(private readonly state: StateStore) {}

  public load(): DashboardCacheData | undefined {
    return this.state.getWorkspace<DashboardCacheData | undefined>(DASHBOARD_CACHE_KEY, undefined);
  }

  public async save(rows: DashboardRow[], updatedAt: number): Promise<void> {
    await this.state.setWorkspace(DASHBOARD_CACHE_KEY, { rows, updatedAt });
  }
}
