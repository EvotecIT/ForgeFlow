import type { TextDocument } from 'vscode';
import type { ProjectsStore } from '../../store/projectsStore';
import type { ProjectsViewProvider } from '../../views/projectsView';
import { getForgeFlowSettings } from '../../util/config';
import { findProjectByPath } from '../projectUtils';

export async function touchProjectActivity(
  document: TextDocument,
  store: ProjectsStore,
  provider: ProjectsViewProvider
): Promise<void> {
  if (document.uri.scheme !== 'file') {
    return;
  }
  const project = findProjectByPath(store.list(), document.uri.fsPath);
  if (!project) {
    return;
  }
  await store.updateLastActivity(project.id, Date.now());
  const settings = getForgeFlowSettings();
  if (settings.projectSortMode === 'lastActive') {
    await provider.refresh();
  }
}
