import type { StateStore } from './stateStore';
import { getScopedValue, setScopedValue } from './filterScope';
import type { Project, ProjectIdentity } from '../models/project';
import type { ProjectSortMode, SortDirection } from '../util/config';
import type { RunPreset } from '../models/run';

const PROJECTS_KEY = 'forgeflow.projects.items.v1';
const FAVORITES_KEY = 'forgeflow.projects.favorites.v1';
const WORKSPACE_OVERRIDES_KEY = 'forgeflow.projects.workspaceOverrides.v1';
const FILTER_KEY = 'forgeflow.projects.filter.v1';
const FAVORITES_ONLY_KEY = 'forgeflow.projects.favoritesOnly.v1';
const SCAN_META_KEY = 'forgeflow.projects.scanMeta.v1';
const SORT_ORDER_KEY = 'forgeflow.projects.sortOrder.v1';

interface ProjectWorkspaceOverride {
  lastOpened?: number;
  lastActivity?: number;
  preferredRunProfileId?: string;
  preferredRunTarget?: 'integrated' | 'external' | 'externalAdmin';
  preferredRunWorkingDirectory?: string;
}

export interface ProjectScanMeta {
  roots: string[];
  maxDepth: number;
  fetchedAt: number;
}

export interface ProjectSortOrder {
  mode: ProjectSortMode;
  direction: SortDirection;
  ids: string[];
  savedAt: number;
}

export class ProjectsStore {
  public constructor(private readonly state: StateStore) {}

  public list(): Project[] {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    return projects.map((project) => ({
      ...project,
      lastOpened: overrides[project.id]?.lastOpened ?? project.lastOpened,
      lastActivity: overrides[project.id]?.lastActivity ?? project.lastActivity,
      preferredRunProfileId: overrides[project.id]?.preferredRunProfileId ?? project.preferredRunProfileId,
      preferredRunTarget: overrides[project.id]?.preferredRunTarget ?? project.preferredRunTarget,
      preferredRunWorkingDirectory: overrides[project.id]?.preferredRunWorkingDirectory ?? project.preferredRunWorkingDirectory,
      entryPointOverrides: project.entryPointOverrides ?? [],
      pinnedItems: project.pinnedItems ?? [],
      runPresets: project.runPresets ?? []
    }));
  }

  public async saveProjects(projects: Project[]): Promise<void> {
    await this.state.setGlobal(PROJECTS_KEY, projects);
  }

  public getFavoriteIds(): string[] {
    return this.state.getGlobal<string[]>(FAVORITES_KEY, []);
  }

  public getFilter(): string {
    return getScopedValue(this.state, FILTER_KEY, '');
  }

  public async setFilter(value: string): Promise<void> {
    await setScopedValue(this.state, FILTER_KEY, value);
  }

  public getFavoritesOnly(): boolean {
    return this.state.getWorkspace<boolean>(FAVORITES_ONLY_KEY, false);
  }

  public async setFavoritesOnly(value: boolean): Promise<void> {
    await this.state.setWorkspace(FAVORITES_ONLY_KEY, value);
  }

  public getScanMeta(): ProjectScanMeta | undefined {
    return this.state.getGlobal<ProjectScanMeta | undefined>(SCAN_META_KEY, undefined);
  }

  public async setScanMeta(meta: ProjectScanMeta): Promise<void> {
    await this.state.setGlobal(SCAN_META_KEY, meta);
  }

  public getSortOrder(): ProjectSortOrder | undefined {
    return this.state.getGlobal<ProjectSortOrder | undefined>(SORT_ORDER_KEY, undefined);
  }

  public async setSortOrder(order: ProjectSortOrder): Promise<void> {
    await this.state.setGlobal(SORT_ORDER_KEY, order);
  }

  public async addFavorite(projectId: string): Promise<void> {
    const favorites = this.getFavoriteIds();
    if (!favorites.includes(projectId)) {
      favorites.push(projectId);
      await this.state.setGlobal(FAVORITES_KEY, favorites);
    }
  }

  public async removeFavorite(projectId: string): Promise<void> {
    const favorites = this.getFavoriteIds().filter((id) => id !== projectId);
    await this.state.setGlobal(FAVORITES_KEY, favorites);
  }

  public async moveFavorite(projectId: string, direction: 'up' | 'down'): Promise<void> {
    const favorites = this.getFavoriteIds();
    const index = favorites.indexOf(projectId);
    if (index === -1) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= favorites.length) {
      return;
    }
    favorites.splice(index, 1);
    favorites.splice(targetIndex, 0, projectId);
    await this.state.setGlobal(FAVORITES_KEY, favorites);
  }

  public async updateProject(project: Project): Promise<void> {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const index = projects.findIndex((item) => item.id === project.id);
    if (index === -1) {
      projects.push(project);
    } else {
      projects[index] = project;
    }
    await this.state.setGlobal(PROJECTS_KEY, projects);
  }

  public async updateLastOpened(projectId: string, timestamp: number): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], lastOpened: timestamp };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
  }

  public async updateLastActivity(projectId: string, timestamp: number): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], lastActivity: timestamp };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
  }

  public async updatePinnedItems(projectId: string, pinnedItems: string[]): Promise<void> {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const index = projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      return;
    }
    const existing = projects[index];
    if (!existing) {
      return;
    }
    projects[index] = { ...existing, pinnedItems };
    await this.state.setGlobal(PROJECTS_KEY, projects);
  }

  public async updateEntryPointOverrides(projectId: string, entryPointOverrides: string[]): Promise<void> {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const index = projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      return;
    }
    const existing = projects[index];
    if (!existing) {
      return;
    }
    projects[index] = { ...existing, entryPointOverrides };
    await this.state.setGlobal(PROJECTS_KEY, projects);
  }

  public async updatePreferredProfile(projectId: string, profileId?: string): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], preferredRunProfileId: profileId };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
  }

  public async updatePreferredRunTarget(projectId: string, target?: 'integrated' | 'external' | 'externalAdmin'): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], preferredRunTarget: target };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
  }

  public async updatePreferredRunWorkingDirectory(projectId: string, workingDirectory?: string): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], preferredRunWorkingDirectory: workingDirectory };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
  }

  public async updateRunPresets(projectId: string, presets: RunPreset[]): Promise<void> {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const index = projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      return;
    }
    const existing = projects[index];
    if (!existing) {
      return;
    }
    projects[index] = { ...existing, runPresets: presets };
    await this.state.setGlobal(PROJECTS_KEY, projects);
  }

  public async updateIdentity(projectId: string, identity: ProjectIdentity): Promise<void> {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const index = projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      return;
    }
    const existing = projects[index];
    if (!existing) {
      return;
    }
    projects[index] = { ...existing, identity };
    await this.state.setGlobal(PROJECTS_KEY, projects);
  }
}
