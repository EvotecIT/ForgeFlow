import type { StateStore } from '../store/stateStore';
import type { GitProjectSummary } from './gitSummary';

const SELECTED_PROJECT_KEY = 'forgeflow.git.selectedProject.v1';
const SUMMARY_KEY = 'forgeflow.git.summary.v1';
const PROJECT_SETTINGS_KEY = 'forgeflow.git.projectSettings.v1';

export interface GitProjectSettings {
  staleDays?: number;
  defaultBranch?: string;
}

export class GitStore {
  public constructor(private readonly state: StateStore) {}

  public getSelectedProjectId(): string | undefined {
    return this.state.getWorkspace<string | undefined>(SELECTED_PROJECT_KEY, undefined);
  }

  public async setSelectedProjectId(projectId?: string): Promise<void> {
    await this.state.setWorkspace(SELECTED_PROJECT_KEY, projectId ?? undefined);
  }

  public getSummary(projectId: string): GitProjectSummary | undefined {
    const summaries = this.state.getWorkspace<Record<string, GitProjectSummary>>(SUMMARY_KEY, {});
    return summaries[projectId];
  }

  public getSummaries(): Record<string, GitProjectSummary> {
    return this.state.getWorkspace<Record<string, GitProjectSummary>>(SUMMARY_KEY, {});
  }

  public async setSummary(projectId: string, summary: GitProjectSummary): Promise<void> {
    const summaries = this.state.getWorkspace<Record<string, GitProjectSummary>>(SUMMARY_KEY, {});
    summaries[projectId] = summary;
    await this.state.setWorkspace(SUMMARY_KEY, summaries);
  }

  public async setSummaries(summaries: Record<string, GitProjectSummary>): Promise<void> {
    await this.state.setWorkspace(SUMMARY_KEY, summaries);
  }

  public getProjectSettings(projectId: string): GitProjectSettings | undefined {
    const settings = this.state.getWorkspace<Record<string, GitProjectSettings>>(PROJECT_SETTINGS_KEY, {});
    return settings[projectId];
  }

  public getProjectSettingsMap(): Record<string, GitProjectSettings> {
    return this.state.getWorkspace<Record<string, GitProjectSettings>>(PROJECT_SETTINGS_KEY, {});
  }

  public async setProjectSettings(projectId: string, settings: GitProjectSettings): Promise<void> {
    const map = this.state.getWorkspace<Record<string, GitProjectSettings>>(PROJECT_SETTINGS_KEY, {});
    map[projectId] = settings;
    await this.state.setWorkspace(PROJECT_SETTINGS_KEY, map);
  }

  public async clearProjectSettings(projectId: string): Promise<void> {
    const map = this.state.getWorkspace<Record<string, GitProjectSettings>>(PROJECT_SETTINGS_KEY, {});
    delete map[projectId];
    await this.state.setWorkspace(PROJECT_SETTINGS_KEY, map);
  }
}
