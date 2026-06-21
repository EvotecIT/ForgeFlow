import type * as vscode from 'vscode';
import type { ProjectsViewProvider } from '../../views/projectsView';

export interface InitialProjectsRefreshScheduler {
  request(): Promise<void>;
  registerOnVisible(context: vscode.ExtensionContext, ...views: Array<vscode.TreeView<unknown>>): void;
}

export function createInitialProjectsRefreshScheduler(
  projectsProvider: ProjectsViewProvider
): InitialProjectsRefreshScheduler {
  let inFlight: Promise<void> | undefined;
  const request = (): Promise<void> => {
    if (!inFlight) {
      inFlight = new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      })
        .then(() => projectsProvider.refresh())
        .finally(() => {
          inFlight = undefined;
        });
    }
    return inFlight;
  };

  return {
    request,
    registerOnVisible(context, ...views) {
      for (const view of views) {
        context.subscriptions.push(
          view.onDidChangeVisibility((event) => {
            if (event.visible) {
              void request();
            }
          })
        );
      }
    }
  };
}
