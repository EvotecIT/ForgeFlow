import type { StateStore } from '../store/stateStore';
import type { GitProjectSummary } from './gitSummary';

const SELECTED_PROJECT_KEY = 'forgeflow.git.selectedProject.v1';
const SUMMARY_KEY = 'forgeflow.git.summary.v1';
const PROJECT_SETTINGS_KEY = 'forgeflow.git.projectSettings.v1';
const SUMMARY_REVISION_KEY = 'forgeflow.git.summary.revision.v1';
const SETTINGS_REVISION_KEY = 'forgeflow.git.projectSettings.revision.v1';

export interface GitProjectSettings {
  staleDays?: number;
  defaultBranch?: string;
}

export class GitStore {
  public constructor(private readonly state: StateStore) {}

  public getRevision(): string {
    const summaryRev = this.state.getWorkspace<string>(SUMMARY_REVISION_KEY, '0');
    const settingsRev = this.state.getWorkspace<string>(SETTINGS_REVISION_KEY, '0');
    return `${summaryRev}:${settingsRev}`;
  }

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
    await this.state.updateWorkspaceWithRetry(
      SUMMARY_KEY,
      {},
      (summaries) => ({ ...summaries, [projectId]: summary }),
      { revisionKey: SUMMARY_REVISION_KEY }
    );
  }

  public async setSummaries(summaries: Record<string, GitProjectSummary>): Promise<void> {
    await this.state.updateWorkspaceWithRetry(
      SUMMARY_KEY,
      {},
      () => ({ ...summaries }),
      { revisionKey: SUMMARY_REVISION_KEY }
    );
  }

  public getProjectSettings(projectId: string): GitProjectSettings | undefined {
    const settings = this.state.getWorkspace<Record<string, GitProjectSettings>>(PROJECT_SETTINGS_KEY, {});
    return settings[projectId];
  }

  public getProjectSettingsMap(): Record<string, GitProjectSettings> {
    return this.state.getWorkspace<Record<string, GitProjectSettings>>(PROJECT_SETTINGS_KEY, {});
  }

  public async setProjectSettings(projectId: string, settings: GitProjectSettings): Promise<void> {
    await this.state.updateWorkspaceWithRetry(
      PROJECT_SETTINGS_KEY,
      {},
      (map) => ({ ...map, [projectId]: settings }),
      { revisionKey: SETTINGS_REVISION_KEY }
    );
  }

  public async clearProjectSettings(projectId: string): Promise<void> {
    await this.state.updateWorkspaceWithRetry(
      PROJECT_SETTINGS_KEY,
      {},
      (map) => {
        const next = { ...map };
        delete next[projectId];
        return next;
      },
      { revisionKey: SETTINGS_REVISION_KEY }
    );
  }
}
