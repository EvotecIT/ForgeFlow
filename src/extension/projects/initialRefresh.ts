import type * as vscode from 'vscode';
import type { ProjectsViewProvider } from '../../views/projectsView';

export interface InitialProjectsRefreshScheduler {
  request(): void;
  registerOnVisible(context: vscode.ExtensionContext, ...views: Array<vscode.TreeView<unknown>>): void;
}

export function createInitialProjectsRefreshScheduler(
  projectsProvider: ProjectsViewProvider
): InitialProjectsRefreshScheduler {
  let inFlight = false;
  const request = (): void => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    setTimeout(() => {
      void projectsProvider.refresh().finally(() => {
        inFlight = false;
      });
    }, 0);
  };

  return {
    request,
    registerOnVisible(context, ...views) {
      for (const view of views) {
        context.subscriptions.push(
          view.onDidChangeVisibility((event) => {
            if (event.visible) {
              request();
            }
          })
        );
      }
    }
  };
}
