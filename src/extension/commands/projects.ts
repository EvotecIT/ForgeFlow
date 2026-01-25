import * as vscode from 'vscode';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { ProjectsWebviewProvider } from '../../views/projectsWebview';
import type { DashboardViewProvider } from '../../views/dashboardView';
import type { ProjectsStore } from '../../store/projectsStore';
import type { TagsStore } from '../../store/tagsStore';
import type { TagFilterStore } from '../../store/tagFilterStore';
import type { FilterPresetStore } from '../../store/filterPresetStore';
import { deleteFilterPreset, pickFilterPreset, saveFilterPreset } from '../filters';
import { extractEntry, extractPath, extractProject } from '../selection';
import { findProjectByPath, resolveProjectFromTarget } from '../projectUtils';
import { openInTerminal, openPath } from '../fsActions';
import {
  addProjectToWorkspace,
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

export interface ProjectCommandDeps {
  context: vscode.ExtensionContext;
  projectsProvider: ProjectsViewProvider;
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
    projectsProvider,
    projectsWebviewProvider,
    projectsWebviewPanelProvider,
    projectsStore,
    tagsStore,
    tagFilterStore,
    filterPresetStore,
    dashboardProvider
  } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.projects.open', async (target?: unknown) => {
      const project = extractProject(target);
      if (project) {
        await openProject(project, projectsStore);
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.openInNewWindow', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await openProjectInNewWindow(project, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.addToWorkspace', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await addProjectToWorkspace(project, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.openInTerminal', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await openInTerminal(project.path);
    }),
    vscode.commands.registerCommand('forgeflow.projects.openInVisualStudio', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await openProjectInVisualStudio(project, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.switch', async () => {
      await switchProject(projectsStore, tagsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.refresh', async () => {
      await projectsProvider.refresh(true);
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
      const project = extractProject(target);
      if (project) {
        await projectsStore.addFavorite(project.id);
        await projectsProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.unpinFavorite', async (target?: unknown) => {
      const project = extractProject(target);
      if (project) {
        await projectsStore.removeFavorite(project.id);
        await projectsProvider.refresh();
      }
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
      const project = extractProject(target);
      if (project) {
        await projectsStore.moveFavorite(project.id, 'up');
        await projectsProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.moveFavoriteDown', async (target?: unknown) => {
      const project = extractProject(target);
      if (project) {
        await projectsStore.moveFavorite(project.id, 'down');
        await projectsProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.openEntryPoint', async (target?: unknown) => {
      const entry = extractEntry(target);
      if (entry) {
        if (entry.kind === 'task') {
          await openPath(entry.path);
          return;
        }
        await openPath(entry.path);
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.addEntryPoint', async (target?: unknown) => {
      const itemPath = extractPath(target);
      if (!itemPath) {
        return;
      }
      const project = findProjectByPath(projectsStore.list(), itemPath);
      if (!project) {
        return;
      }
      const overrides = project.entryPointOverrides ?? [];
      if (!overrides.includes(itemPath)) {
        await projectsStore.updateEntryPointOverrides(project.id, [...overrides, itemPath]);
        projectsProvider.invalidateEntryPointCache(project.id);
        await projectsProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.removeEntryPoint', async (target?: unknown) => {
      const entry = extractEntry(target);
      const itemPath = entry?.path ?? extractPath(target);
      if (!itemPath) {
        return;
      }
      const project = findProjectByPath(projectsStore.list(), itemPath);
      if (!project) {
        return;
      }
      const overrides = project.entryPointOverrides ?? [];
      if (!overrides.includes(itemPath)) {
        vscode.window.showInformationMessage('ForgeFlow: Entry point is auto-detected.');
        return;
      }
      await projectsStore.updateEntryPointOverrides(project.id, overrides.filter((item) => item !== itemPath));
      projectsProvider.invalidateEntryPointCache(project.id);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.projects.pinItem', async (target?: unknown) => {
      const entry = extractEntry(target);
      if (!entry) {
        return;
      }
      const project = findProjectByPath(projectsStore.list(), entry.path);
      if (!project) {
        return;
      }
      const pinned = project.pinnedItems.includes(entry.path)
        ? project.pinnedItems
        : [...project.pinnedItems, entry.path];
      await projectsStore.updatePinnedItems(project.id, pinned);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.projects.unpinItem', async (target?: unknown) => {
      const itemPath = extractPath(target);
      if (!itemPath) {
        return;
      }
      const project = findProjectByPath(projectsStore.list(), itemPath);
      if (!project) {
        return;
      }
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
