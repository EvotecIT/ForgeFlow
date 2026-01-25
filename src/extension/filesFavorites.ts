import * as vscode from 'vscode';
import type { FilesViewProvider } from '../views/filesView';
import { getForgeFlowSettings } from '../util/config';

export async function configureFavoritesViewMode(provider: FilesViewProvider): Promise<void> {
  const settings = getForgeFlowSettings();
  const options: Array<{ label: string; value: 'workspace' | 'all' | 'pinned' }> = [
    { label: 'Workspace (scoped)', value: 'workspace' },
    { label: 'All favorites', value: 'all' },
    { label: 'Pinned in workspace', value: 'pinned' }
  ];
  const pick = await vscode.window.showQuickPick(
    options.map((option) => ({ ...option, picked: option.value === settings.filesFavoritesViewMode })),
    { placeHolder: 'Select favorites view mode' }
  );
  if (!pick) {
    return;
  }
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('files.favorites.viewMode', pick.value, vscode.ConfigurationTarget.Global);
  provider.refresh();
}
