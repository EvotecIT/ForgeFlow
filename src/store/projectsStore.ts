import type { StateStore } from './stateStore';
import type { Project, ProjectIdentity } from '../models/project';

const PROJECTS_KEY = 'forgeflow.projects.items.v1';
const FAVORITES_KEY = 'forgeflow.projects.favorites.v1';
const WORKSPACE_OVERRIDES_KEY = 'forgeflow.projects.workspaceOverrides.v1';

interface ProjectWorkspaceOverride {
  lastOpened?: number;
  preferredRunProfileId?: string;
}

export class ProjectsStore {
  public constructor(private readonly state: StateStore) {}

  public list(): Project[] {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    return projects.map((project) => ({
      ...project,
      lastOpened: overrides[project.id]?.lastOpened ?? project.lastOpened,
      preferredRunProfileId: overrides[project.id]?.preferredRunProfileId ?? project.preferredRunProfileId
    }));
  }

  public async saveProjects(projects: Project[]): Promise<void> {
    await this.state.setGlobal(PROJECTS_KEY, projects);
  }

  public getFavoriteIds(): string[] {
    return this.state.getGlobal<string[]>(FAVORITES_KEY, []);
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

  public async updatePinnedItems(projectId: string, pinnedItems: string[]): Promise<void> {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const index = projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      return;
    }
    projects[index] = { ...projects[index], pinnedItems };
    await this.state.setGlobal(PROJECTS_KEY, projects);
  }

  public async updatePreferredProfile(projectId: string, profileId?: string): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], preferredRunProfileId: profileId };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
  }

  public async updateIdentity(projectId: string, identity: ProjectIdentity): Promise<void> {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const index = projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      return;
    }
    projects[index] = { ...projects[index], identity };
    await this.state.setGlobal(PROJECTS_KEY, projects);
  }
}
