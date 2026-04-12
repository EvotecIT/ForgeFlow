import * as path from 'path';
import * as vscode from 'vscode';
import type { FilesViewProvider } from '../../views/filesView';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { ProjectsWebviewProvider } from '../../views/projectsWebview';
import type { DashboardViewProvider } from '../../views/dashboardView';
import type { ProjectsStore } from '../../store/projectsStore';
import type { TagsStore } from '../../store/tagsStore';
import type { TagFilterStore } from '../../store/tagFilterStore';
import type { FilterPresetStore } from '../../store/filterPresetStore';
import type { Project } from '../../models/project';
import { readProjectGitWorktreeMetadata } from '../../git/worktreeMetadata';
import { buildProjectDuplicateKey } from '../../util/projectIdentity';
import { deleteFilterPreset, pickFilterPreset, saveFilterPreset } from '../filters';
import { collectSelectedProjects, extractEntry, extractPath } from '../selection';
import { findProjectByPath, resolveProjectFromTarget } from '../projectUtils';
import { openInTerminal, openPath } from '../fsActions';
import { statPath } from '../../util/fs';
import { normalizePathKey } from '../pathUtils';
import {
  addProjectToWorkspace,
  addProjectsToWorkspace,
  openProject,
  openProjectInNewWindow,
  searchProjectsQuickPick,
  switchProject
} from '../projects/actions';
import {
  applyTagPreset,
  clearProjectTags,
  deleteTagPreset,
  pickTagForFilter,
  renameProjectTag,
  saveTagPreset,
  setProjectTags
} from '../projects/tags';
import {
  configureOrRefreshScanRoots,
  configureProjectFilter,
  configureScanRoots,
  configureSortDirection,
  configureSortMode,
  toggleSortDirection
} from '../projects/settings';
import { manageEntryPoints, movePinnedItem, openProjectInVisualStudio } from '../projects/entryPoints';
import { cleanupStaleWorktrees, cleanupStaleWorktreesInPaths } from '../projects/worktrees';
import { removeWorktreeSafely, resolveWorktreeRepoRoot } from '../projects/worktreeGit';
import { pickPrimaryByPath } from '../../util/worktreePrimary';

export interface ProjectCommandDeps {
  context: vscode.ExtensionContext;
  filesProvider: FilesViewProvider;
  projectsProvider: ProjectsViewProvider;
  projectsView: vscode.TreeView<unknown>;
  projectsPanelView: vscode.TreeView<unknown>;
  projectsWebviewProvider: ProjectsWebviewProvider;
  projectsWebviewPanelProvider: ProjectsWebviewProvider;
  projectsStore: ProjectsStore;
  tagsStore: TagsStore;
  tagFilterStore: TagFilterStore;
  filterPresetStore: FilterPresetStore;
  dashboardProvider: DashboardViewProvider;
}

export function registerProjectCommands(deps: ProjectCommandDeps): void {
  const {
    context,
    filesProvider,
    projectsProvider,
    projectsView,
    projectsPanelView,
    projectsWebviewProvider,
    projectsWebviewPanelProvider,
    projectsStore,
    tagsStore,
    tagFilterStore,
    filterPresetStore,
    dashboardProvider
  } = deps;

  const resolveSelectedProject = (target?: unknown): Project | undefined => {
    const selected = collectSelectedProjects(target, projectsStore, projectsView, projectsPanelView);
    if (selected.length === 0) {
      return undefined;
    }
    if (selected.length > 1) {
      vscode.window.showWarningMessage('ForgeFlow: Select a single project for this action.');
      return undefined;
    }
    return selected[0];
  };

  const refreshProjectViews = async (): Promise<void> => {
    await projectsProvider.refresh(true);
    filesProvider.refreshWorktrees();
    await projectsWebviewProvider.refresh();
    await projectsWebviewPanelProvider.refresh();
    await dashboardProvider.refresh();
  };

  const updateSelectedFavorite = async (
    target: unknown,
    mutate: (project: Project) => Promise<void>
  ): Promise<void> => {
    const project = resolveSelectedProject(target);
    if (!project) {
      return;
    }
    await mutate(project);
    await projectsProvider.refresh();
  };

  const resolveProjectItem = (
    target: unknown,
    resolvePath: (target: unknown) => string | undefined
  ): { project: Project; itemPath: string } | undefined => {
    const itemPath = resolvePath(target);
    if (!itemPath) {
      return undefined;
    }
    const project = findProjectByPath(projectsStore.list(), itemPath);
    if (!project) {
      return undefined;
    }
    return { project, itemPath };
  };

  const refreshEntryPointViews = async (projectId: string): Promise<void> => {
    projectsProvider.invalidateEntryPointCache(projectId);
    await projectsProvider.refresh();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.projects.open', async (target?: unknown) => {
      const project = resolveSelectedProject(target);
      if (project) {
        await openProject(project, projectsStore);
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.openInNewWindow', async (target?: unknown) => {
      const project = resolveSelectedProject(target);
      if (!project) {
        return;
      }
      await openProjectInNewWindow(project, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.addToWorkspace', async (target?: unknown) => {
      const project = resolveSelectedProject(target);
      if (!project) {
        return;
      }
      await addProjectToWorkspace(project, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.addManyToWorkspace', async () => {
      await addProjectsToWorkspace(projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.openInTerminal', async (target?: unknown) => {
      const project = resolveSelectedProject(target);
      if (!project) {
        return;
      }
      await openInTerminal(project.path);
    }),
    vscode.commands.registerCommand('forgeflow.projects.openInVisualStudio', async (target?: unknown) => {
      const project = resolveSelectedProject(target);
      if (!project) {
        return;
      }
      await openProjectInVisualStudio(project, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.delete', async (target?: unknown) => {
      const project = resolveSelectedProject(target);
      if (!project) {
        return;
      }
      const existing = await statPath(project.path);
      if (existing && await isWorktreeProject(project)) {
        const removed = await removeProjectWorktree(project);
        if (!removed) {
          return;
        }
        await projectsStore.removeProject(project.id);
      } else if (!existing) {
        const removeChoice = await vscode.window.showWarningMessage(
          `ForgeFlow: Project folder not found for "${project.name}". Remove from list?`,
          'Remove',
          'Cancel'
        );
        if (removeChoice !== 'Remove') {
          return;
        }
        await projectsStore.removeProject(project.id);
      } else {
        const confirm = await vscode.window.showWarningMessage(
          `ForgeFlow: Move "${project.name}" to the Recycle Bin?`,
          { modal: true },
          'Move to Recycle Bin'
        );
        if (confirm !== 'Move to Recycle Bin') {
          return;
        }
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(project.path), { recursive: true, useTrash: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`ForgeFlow: Failed to delete project "${project.name}": ${message}`);
          return;
        }
        await projectsStore.removeProject(project.id);
      }

      await refreshProjectViews();
    }),
    vscode.commands.registerCommand('forgeflow.projects.switch', async () => {
      await switchProject(projectsStore, tagsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.refresh', async () => {
      await projectsProvider.refresh(true);
    }),
    vscode.commands.registerCommand('forgeflow.projects.cleanupWorktrees', async (target?: unknown) => {
      const scopedPaths = await resolveCleanupWorktreePaths(target, projectsStore, resolveSelectedProject);
      if (target !== undefined) {
        if (!scopedPaths || scopedPaths.length === 0) {
          vscode.window.showInformationMessage('ForgeFlow: No linked git worktrees found for the selected project.');
          return;
        }
        await cleanupStaleWorktreesInPaths(scopedPaths, projectsProvider, filesProvider);
        return;
      }
      await cleanupStaleWorktrees(projectsProvider, filesProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.debugWorktreeGrouping', async (target?: unknown) => {
      await debugWorktreeGrouping(target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.configureOrRefresh', async () => {
      await configureOrRefreshScanRoots(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.configureScanRoots', async () => {
      await configureScanRoots(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.setSortMode', async () => {
      await configureSortMode(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.setSortDirection', async () => {
      await configureSortDirection(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.toggleSortDirection', async () => {
      await toggleSortDirection(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.filter', async () => {
      await configureProjectFilter(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.search', async () => {
      await searchProjectsQuickPick(projectsStore, tagsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.focusFilter', async () => {
      await configureProjectFilter(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.web.focusFilter', async () => {
      await projectsWebviewProvider.focusFilter();
      await projectsWebviewPanelProvider.focusFilter();
    }),
    vscode.commands.registerCommand('forgeflow.projects.saveFilterPreset', async () => {
      await saveFilterPreset('projects', projectsProvider.getFilter(), filterPresetStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.applyFilterPreset', async () => {
      const preset = await pickFilterPreset('projects', filterPresetStore);
      if (!preset) {
        return;
      }
      projectsProvider.setFilter(preset.value);
    }),
    vscode.commands.registerCommand('forgeflow.projects.deleteFilterPreset', async () => {
      await deleteFilterPreset('projects', filterPresetStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.clearFilter', async () => {
      projectsProvider.setFilter('');
    }),
    vscode.commands.registerCommand('forgeflow.projects.toggleFavoritesOnly', async () => {
      await projectsProvider.toggleFavoritesOnly();
    }),
    vscode.commands.registerCommand('forgeflow.projects.loadMore', async () => {
      projectsProvider.loadMore();
    }),
    vscode.commands.registerCommand('forgeflow.projects.pinFavorite', async (target?: unknown) => {
      await updateSelectedFavorite(target, async (project) => {
        await projectsStore.addFavorite(project.id);
      });
    }),
    vscode.commands.registerCommand('forgeflow.projects.unpinFavorite', async (target?: unknown) => {
      await updateSelectedFavorite(target, async (project) => {
        await projectsStore.removeFavorite(project.id);
      });
    }),
    vscode.commands.registerCommand('forgeflow.projects.setTags', async (target?: unknown) => {
      await setProjectTags(target, projectsStore, tagsStore, projectsProvider, dashboardProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.clearTags', async (target?: unknown) => {
      await clearProjectTags(target, projectsStore, tagsStore, projectsProvider, dashboardProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.renameTag', async () => {
      await renameProjectTag(tagsStore, projectsProvider, dashboardProvider);
    }),
    vscode.commands.registerCommand('forgeflow.tags.toggleFilter', async (tag?: unknown) => {
      const targetTag = typeof tag === 'string' ? tag : await pickTagForFilter(tagsStore);
      if (!targetTag) {
        return;
      }
      await projectsProvider.toggleTagFilter(targetTag);
      await dashboardProvider.applyTagFilter(projectsProvider.getTagFilter(), false);
    }),
    vscode.commands.registerCommand('forgeflow.tags.clearFilter', async () => {
      await projectsProvider.setTagFilter([]);
      await dashboardProvider.applyTagFilter([], false);
    }),
    vscode.commands.registerCommand('forgeflow.tags.savePreset', async () => {
      await saveTagPreset(tagFilterStore, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.tags.applyPreset', async () => {
      const applied = await applyTagPreset(tagFilterStore);
      if (applied) {
        await projectsProvider.setTagFilter(applied.tags);
        await dashboardProvider.applyTagFilter(applied.tags, false);
      }
    }),
    vscode.commands.registerCommand('forgeflow.tags.deletePreset', async () => {
      await deleteTagPreset(tagFilterStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.moveFavoriteUp', async (target?: unknown) => {
      await updateSelectedFavorite(target, async (project) => {
        await projectsStore.moveFavorite(project.id, 'up');
      });
    }),
    vscode.commands.registerCommand('forgeflow.projects.moveFavoriteDown', async (target?: unknown) => {
      await updateSelectedFavorite(target, async (project) => {
        await projectsStore.moveFavorite(project.id, 'down');
      });
    }),
    vscode.commands.registerCommand('forgeflow.projects.openEntryPoint', async (target?: unknown) => {
      const entry = extractEntry(target);
      if (entry) {
        await openPath(entry.path);
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.addEntryPoint', async (target?: unknown) => {
      const selected = resolveProjectItem(target, (value) => extractPath(value));
      if (!selected) {
        return;
      }
      const { project, itemPath } = selected;
      const overrides = project.entryPointOverrides ?? [];
      if (!overrides.includes(itemPath)) {
        await projectsStore.updateEntryPointOverrides(project.id, [...overrides, itemPath]);
        await refreshEntryPointViews(project.id);
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.removeEntryPoint', async (target?: unknown) => {
      const selected = resolveProjectItem(target, (value) => extractEntry(value)?.path ?? extractPath(value));
      if (!selected) {
        return;
      }
      const { project, itemPath } = selected;
      const overrides = project.entryPointOverrides ?? [];
      if (!overrides.includes(itemPath)) {
        vscode.window.showInformationMessage('ForgeFlow: Entry point is auto-detected.');
        return;
      }
      await projectsStore.updateEntryPointOverrides(project.id, overrides.filter((item) => item !== itemPath));
      await refreshEntryPointViews(project.id);
    }),
    vscode.commands.registerCommand('forgeflow.projects.pinItem', async (target?: unknown) => {
      const selected = resolveProjectItem(target, (value) => extractEntry(value)?.path);
      if (!selected) {
        return;
      }
      const { project, itemPath } = selected;
      const pinned = project.pinnedItems.includes(itemPath)
        ? project.pinnedItems
        : [...project.pinnedItems, itemPath];
      await projectsStore.updatePinnedItems(project.id, pinned);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.projects.unpinItem', async (target?: unknown) => {
      const selected = resolveProjectItem(target, (value) => extractPath(value));
      if (!selected) {
        return;
      }
      const { project, itemPath } = selected;
      const pinned = project.pinnedItems.filter((item) => item !== itemPath);
      await projectsStore.updatePinnedItems(project.id, pinned);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.projects.movePinnedItemUp', async (target?: unknown) => {
      const itemPath = extractPath(target);
      if (!itemPath) {
        return;
      }
      await movePinnedItem(itemPath, 'up', projectsStore, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.movePinnedItemDown', async (target?: unknown) => {
      const itemPath = extractPath(target);
      if (!itemPath) {
        return;
      }
      await movePinnedItem(itemPath, 'down', projectsStore, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.manageEntryPoints', async (target?: unknown) => {
      await manageEntryPoints(target, projectsStore, projectsProvider);
    })
  );
}

async function isWorktreeProject(project: Project): Promise<boolean> {
  if (project.type !== 'git') {
    return false;
  }
  const metadata = await readProjectGitWorktreeMetadata(project.path);
  return metadata.isWorktree;
}

async function removeProjectWorktree(project: Project): Promise<boolean> {
  const metadata = await readProjectGitWorktreeMetadata(project.path);
  if (!metadata.isWorktree) {
    return false;
  }
  const confirm = await vscode.window.showWarningMessage(
    `ForgeFlow: Remove worktree "${project.name}"? This deletes the worktree folder.`,
    { modal: true },
    'Remove'
  );
  if (confirm !== 'Remove') {
    return false;
  }
  const repoRoot = metadata.commonDir
    ? path.dirname(metadata.commonDir)
    : await resolveWorktreeRepoRoot(project.path);
  const result = await removeWorktreeSafely(project.path, repoRoot);
  if (result.removed) {
    return true;
  }
  if (result.failure === 'openInWorkspace') {
    vscode.window.showWarningMessage('ForgeFlow: Cannot remove a worktree that is open in the current workspace.');
    return false;
  }
  if (result.failure === 'repoRootNotFound') {
    vscode.window.showWarningMessage('ForgeFlow: Unable to resolve repository for this worktree.');
    return false;
  }
  const message = result.message ?? 'Unknown error';
  vscode.window.showWarningMessage(`ForgeFlow: Failed to remove worktree "${project.name}": ${message}`);
  return false;
}

async function resolveCleanupWorktreePaths(
  target: unknown,
  projectsStore: ProjectsStore,
  resolveSelectedProject: (target?: unknown) => Project | undefined
): Promise<string[] | undefined> {
  const project = resolveSelectedProject(target);
  if (!project || project.type !== 'git') {
    return undefined;
  }
  const metadata = await readProjectGitWorktreeMetadata(project.path);
  if (!metadata.commonDir) {
    return undefined;
  }
  const selectedCommonDir = normalizePathKey(metadata.commonDir);
  const candidates = projectsStore.list().filter((entry) => entry.type === 'git');
  if (candidates.length === 0) {
    return undefined;
  }
  const worktreePaths: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const candidateMeta = await readProjectGitWorktreeMetadata(candidate.path);
    if (!candidateMeta.isWorktree || !candidateMeta.commonDir) {
      continue;
    }
    if (normalizePathKey(candidateMeta.commonDir) !== selectedCommonDir) {
      continue;
    }
    const key = normalizePathKey(candidate.path);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    worktreePaths.push(candidate.path);
  }
  return worktreePaths.length > 0 ? worktreePaths : undefined;
}

interface ProjectGitMetadata {
  dotGitKind: 'none' | 'directory' | 'file' | 'other';
  isWorktree: boolean;
  commonDir?: string;
  gitDirRaw?: string;
  gitDirResolved?: string;
}

async function debugWorktreeGrouping(target: unknown, projectsStore: ProjectsStore): Promise<void> {
  const selected = await resolveDebugProject(target, projectsStore);
  if (!selected) {
    return;
  }
  const projects = projectsStore.list();
  const metadataEntries = await Promise.all(projects.map(async (project) => {
    if (project.type !== 'git') {
      return [project.id, undefined] as const;
    }
    return [project.id, await readProjectGitMetadata(project.path)] as const;
  }));
  const metadataById = new Map<string, ProjectGitMetadata | undefined>(metadataEntries);
  const selectedMeta = metadataById.get(selected.id);
  const duplicateKey = buildProjectDuplicateKey(selected);
  const duplicateSiblings = duplicateKey
    ? projects.filter((project) => buildProjectDuplicateKey(project) === duplicateKey)
    : [];
  const duplicatePrimary = choosePrimaryProject(duplicateSiblings, metadataById);
  const commonDir = selectedMeta?.commonDir;
  const commonDirSiblings = commonDir
    ? projects.filter((project) => metadataById.get(project.id)?.commonDir === commonDir)
    : [];
  const commonDirPrimary = choosePrimaryProject(commonDirSiblings, metadataById);

  const payload = {
    generatedAt: new Date().toISOString(),
    selected: summarizeProject(selected, metadataById.get(selected.id)),
    duplicateGrouping: {
      key: duplicateKey,
      siblingCount: duplicateSiblings.length,
      primaryProjectId: duplicatePrimary?.id,
      siblings: duplicateSiblings.map((project) => summarizeProject(project, metadataById.get(project.id)))
    },
    commonDirGrouping: {
      commonDir,
      siblingCount: commonDirSiblings.length,
      primaryProjectId: commonDirPrimary?.id,
      siblings: commonDirSiblings.map((project) => summarizeProject(project, metadataById.get(project.id)))
    },
    notes: [
      'Primary selection prefers non-worktrees; if tied, shortest path wins.',
      'Common-dir grouping is derived from .git metadata (directory .git, or gitdir: value in file .git).'
    ]
  };

  const document = await vscode.workspace.openTextDocument({
    language: 'json',
    content: JSON.stringify(payload, null, 2)
  });
  await vscode.window.showTextDocument(document, { preview: false });
}

async function resolveDebugProject(target: unknown, projectsStore: ProjectsStore): Promise<Project | undefined> {
  const direct = resolveProjectFromTarget(target, projectsStore);
  if (direct) {
    return direct;
  }
  const projects = projectsStore.list();
  if (projects.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No projects available for worktree diagnostics.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    projects
      .map((project) => ({ label: project.name, description: project.path, project }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    { placeHolder: 'Select project to inspect worktree grouping' }
  );
  return picked?.project;
}

function choosePrimaryProject(
  projects: Project[],
  metadataById: Map<string, ProjectGitMetadata | undefined>
): Project | undefined {
  return pickPrimaryByPath(projects, (project) => Boolean(metadataById.get(project.id)?.isWorktree));
}

function summarizeProject(project: Project, metadata: ProjectGitMetadata | undefined): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    type: project.type,
    duplicateKey: buildProjectDuplicateKey(project),
    git: metadata ?? null
  };
}

async function readProjectGitMetadata(projectPath: string): Promise<ProjectGitMetadata> {
  const metadata = await readProjectGitWorktreeMetadata(projectPath);
  return {
    dotGitKind: metadata.dotGitKind,
    isWorktree: metadata.isWorktree,
    commonDir: metadata.commonDir,
    gitDirRaw: metadata.gitDirRaw,
    gitDirResolved: metadata.gitDirResolved
  };
}
