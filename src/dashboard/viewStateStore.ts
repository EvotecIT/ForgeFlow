import type { StateStore } from '../store/stateStore';

export interface DashboardViewState {
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  colWidths?: Record<string, number>;
  expandAllGroups?: boolean;
  showAllChildren?: boolean;
}

const DASHBOARD_VIEW_STATE_KEY = 'forgeflow.dashboard.viewState.v1';

export class DashboardViewStateStore {
  public constructor(private readonly state: StateStore) {}

  public getState(): DashboardViewState {
    return this.state.getWorkspace<DashboardViewState>(DASHBOARD_VIEW_STATE_KEY, {});
  }

  public async setState(state: DashboardViewState): Promise<void> {
    await this.state.setWorkspace(DASHBOARD_VIEW_STATE_KEY, state);
  }
}
