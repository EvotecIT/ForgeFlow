import type { StateStore } from './stateStore';
import { getScopedValue, setScopedValue } from './filterScope';
import type { Project, ProjectIdentity } from '../models/project';
import type { ProjectSortMode, SortDirection } from '../util/config';
import type { RunPreset } from '../models/run';
import { statPath } from '../util/fs';

const PROJECTS_KEY = 'forgeflow.projects.items.v1';
const FAVORITES_KEY = 'forgeflow.projects.favorites.v1';
const WORKSPACE_OVERRIDES_KEY = 'forgeflow.projects.workspaceOverrides.v1';
const WORKSPACE_REVISION_KEY = 'forgeflow.projects.workspaceRevision.v1';
const FILTER_KEY = 'forgeflow.projects.filter.v1';
const FAVORITES_ONLY_KEY = 'forgeflow.projects.favoritesOnly.v1';
const SCAN_META_KEY = 'forgeflow.projects.scanMeta.v1';
const SCAN_ROOTS_META_KEY = 'forgeflow.projects.scanRootsMeta.v1';
const SCAN_STATS_KEY = 'forgeflow.projects.scanStats.v1';
const SORT_ORDER_KEY = 'forgeflow.projects.sortOrder.v1';
const REVISION_KEY = 'forgeflow.projects.revision.v1';
const SCAN_LOCK_KEY = 'forgeflow.projects.scanLock.v1';

interface ProjectWorkspaceOverride {
  lastOpened?: number;
  lastActivity?: number;
  preferredRunProfileId?: string;
  preferredRunTarget?: 'integrated' | 'external' | 'externalAdmin';
  preferredRunWorkingDirectory?: string;
}

interface ProjectScanLock {
  owner: string;
  expiresAt: number;
}

export interface ProjectScanMeta {
  roots: string[];
  maxDepth: number;
  fetchedAt: number;
}

export interface ProjectScanRootMeta {
  maxDepth: number;
  fetchedAt: number;
  rootMtime?: number;
}

export interface ProjectScanStats {
  scannedAt: number;
  durationMs: number;
  rootsCount: number;
  scannedRootsCount: number;
}

export interface ProjectSortOrder {
  mode: ProjectSortMode;
  direction: SortDirection;
  ids: string[];
  savedAt: number;
}

export class ProjectsStore {
  public constructor(private readonly state: StateStore) {}

  public getRevision(): string {
    return this.state.getGlobal<string>(REVISION_KEY, '0');
  }

  public getWorkspaceRevision(): string {
    return this.state.getWorkspace<string>(WORKSPACE_REVISION_KEY, '0');
  }

  public getScanLock(): ProjectScanLock | undefined {
    return this.state.getGlobal<ProjectScanLock | undefined>(SCAN_LOCK_KEY, undefined);
  }

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
    await this.saveAllProjects(projects);
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

  public getScanRootsMeta(): Record<string, ProjectScanRootMeta> {
    return this.state.getGlobal<Record<string, ProjectScanRootMeta>>(SCAN_ROOTS_META_KEY, {});
  }

  public async updateScanRootsMeta(roots: string[], maxDepth: number, fetchedAt: number): Promise<void> {
    const mtimes = new Map<string, number | undefined>();
    for (const root of roots) {
      const stat = await statPath(root);
      mtimes.set(normalizeRootKey(root), stat?.mtime);
    }
    await this.state.updateGlobalWithRetry<Record<string, ProjectScanRootMeta>>(
      SCAN_ROOTS_META_KEY,
      {},
      (meta) => {
        const next = { ...meta };
        for (const root of roots) {
          const key = normalizeRootKey(root);
          next[key] = { maxDepth, fetchedAt, rootMtime: mtimes.get(key) };
        }
        return next;
      }
    );
  }

  public getScanStats(): ProjectScanStats | undefined {
    return this.state.getGlobal<ProjectScanStats | undefined>(SCAN_STATS_KEY, undefined);
  }

  public async setScanStats(stats: ProjectScanStats): Promise<void> {
    await this.state.setGlobal(SCAN_STATS_KEY, stats);
  }

  public getSortOrder(): ProjectSortOrder | undefined {
    return this.state.getGlobal<ProjectSortOrder | undefined>(SORT_ORDER_KEY, undefined);
  }

  public async setSortOrder(order: ProjectSortOrder): Promise<void> {
    await this.state.setGlobal(SORT_ORDER_KEY, order);
    await this.bumpRevision();
  }

  public async addFavorite(projectId: string): Promise<void> {
    const favorites = this.getFavoriteIds();
    if (!favorites.includes(projectId)) {
      favorites.push(projectId);
      await this.state.setGlobal(FAVORITES_KEY, favorites);
      await this.bumpRevision();
    }
  }

  public async removeFavorite(projectId: string): Promise<void> {
    const favorites = this.getFavoriteIds().filter((id) => id !== projectId);
    await this.state.setGlobal(FAVORITES_KEY, favorites);
    await this.bumpRevision();
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
    await this.bumpRevision();
  }

  public async updateProject(project: Project): Promise<void> {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const index = projects.findIndex((item) => item.id === project.id);
    const sanitized = this.sanitizeProject(project);
    if (index === -1) {
      projects.push(sanitized);
    } else {
      projects[index] = sanitized;
    }
    await this.saveAllProjects(projects);
  }

  public async updateLastOpened(projectId: string, timestamp: number): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], lastOpened: timestamp };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
    await this.bumpWorkspaceRevision();
  }

  public async updateLastActivity(projectId: string, timestamp: number): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], lastActivity: timestamp };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
    await this.bumpWorkspaceRevision();
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
    projects[index] = this.sanitizeProject({ ...existing, pinnedItems });
    await this.saveAllProjects(projects);
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
    projects[index] = this.sanitizeProject({ ...existing, entryPointOverrides });
    await this.saveAllProjects(projects);
  }

  public async updatePreferredProfile(projectId: string, profileId?: string): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], preferredRunProfileId: profileId };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
    await this.bumpWorkspaceRevision();
  }

  public async updatePreferredRunTarget(projectId: string, target?: 'integrated' | 'external' | 'externalAdmin'): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], preferredRunTarget: target };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
    await this.bumpWorkspaceRevision();
  }

  public async updatePreferredRunWorkingDirectory(projectId: string, workingDirectory?: string): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    overrides[projectId] = { ...overrides[projectId], preferredRunWorkingDirectory: workingDirectory };
    await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
    await this.bumpWorkspaceRevision();
  }

  public async removeProject(projectId: string): Promise<void> {
    const projects = this.state.getGlobal<Project[]>(PROJECTS_KEY, []);
    const next = projects.filter((project) => project.id !== projectId);
    if (next.length !== projects.length) {
      await this.saveAllProjects(next);
    }
    const favorites = this.getFavoriteIds();
    if (favorites.includes(projectId)) {
      await this.state.setGlobal(
        FAVORITES_KEY,
        favorites.filter((id) => id !== projectId)
      );
      await this.bumpRevision();
    }
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    if (projectId in overrides) {
      delete overrides[projectId];
      await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
      await this.bumpWorkspaceRevision();
    }
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
    projects[index] = this.sanitizeProject({ ...existing, runPresets: presets });
    await this.saveAllProjects(projects);
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
    projects[index] = this.sanitizeProject({ ...existing, identity });
    await this.saveAllProjects(projects);
  }

  public async tryAcquireScanLock(owner: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const lock = this.state.getGlobal<ProjectScanLock | undefined>(SCAN_LOCK_KEY, undefined);
    if (!lock || lock.expiresAt <= now || lock.owner === owner) {
      const next: ProjectScanLock = {
        owner,
        expiresAt: now + Math.max(1_000, ttlMs)
      };
      await this.state.setGlobal(SCAN_LOCK_KEY, next);
      const stored = this.state.getGlobal<ProjectScanLock | undefined>(SCAN_LOCK_KEY, undefined);
      return stored?.owner === owner;
    }
    return false;
  }

  public async releaseScanLock(owner: string): Promise<void> {
    const lock = this.state.getGlobal<ProjectScanLock | undefined>(SCAN_LOCK_KEY, undefined);
    if (!lock || lock.owner !== owner) {
      return;
    }
    await this.state.setGlobal<ProjectScanLock | undefined>(SCAN_LOCK_KEY, undefined);
  }

  private sanitizeProject(project: Project): Project {
    const sanitized = { ...project };
    delete sanitized.lastOpened;
    delete sanitized.lastActivity;
    delete sanitized.preferredRunProfileId;
    delete sanitized.preferredRunTarget;
    delete sanitized.preferredRunWorkingDirectory;
    return sanitized;
  }

  private async saveAllProjects(projects: Project[]): Promise<void> {
    const overrides = this.state.getWorkspace<Record<string, ProjectWorkspaceOverride>>(WORKSPACE_OVERRIDES_KEY, {});
    let overridesChanged = false;
    for (const project of projects) {
      const current = overrides[project.id] ?? {};
      let next = current;
      let changed = false;
      if (project.lastOpened !== undefined && project.lastOpened !== current.lastOpened) {
        next = { ...next, lastOpened: project.lastOpened };
        changed = true;
      }
      if (project.lastActivity !== undefined && project.lastActivity !== current.lastActivity) {
        next = { ...next, lastActivity: project.lastActivity };
        changed = true;
      }
      if (project.preferredRunProfileId !== undefined && project.preferredRunProfileId !== current.preferredRunProfileId) {
        next = { ...next, preferredRunProfileId: project.preferredRunProfileId };
        changed = true;
      }
      if (project.preferredRunTarget !== undefined && project.preferredRunTarget !== current.preferredRunTarget) {
        next = { ...next, preferredRunTarget: project.preferredRunTarget };
        changed = true;
      }
      if (
        project.preferredRunWorkingDirectory !== undefined
        && project.preferredRunWorkingDirectory !== current.preferredRunWorkingDirectory
      ) {
        next = { ...next, preferredRunWorkingDirectory: project.preferredRunWorkingDirectory };
        changed = true;
      }
      if (changed) {
        overrides[project.id] = next;
        overridesChanged = true;
      }
    }
    const sanitized = projects.map((project) => this.sanitizeProject(project));
    await this.state.setGlobal(PROJECTS_KEY, sanitized);
    if (overridesChanged) {
      await this.state.setWorkspace(WORKSPACE_OVERRIDES_KEY, overrides);
      await this.bumpWorkspaceRevision();
    }
    await this.bumpRevision();
  }

  private async bumpRevision(): Promise<void> {
    await this.state.setGlobal(REVISION_KEY, createRevisionStamp());
  }

  private async bumpWorkspaceRevision(): Promise<void> {
    await this.state.setWorkspace(WORKSPACE_REVISION_KEY, createRevisionStamp());
  }
}

function createRevisionStamp(): string {
  const base = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

function normalizeRootKey(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
