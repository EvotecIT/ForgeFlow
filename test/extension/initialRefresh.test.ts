import { strict as assert } from 'assert';
import { createInitialProjectsRefreshScheduler } from '../../src/extension/projects/initialRefresh';
import type { ProjectsViewProvider } from '../../src/views/projectsView';

describe('InitialProjectsRefreshScheduler', () => {
  it('keeps close initial refresh requests coalesced until the project scan finishes', async () => {
    let refreshCalls = 0;
    let completeRefresh: (() => void) | undefined;
    const projectsProvider = {
      refresh: async () => {
        refreshCalls += 1;
        await new Promise<void>((resolve) => {
          completeRefresh = resolve;
        });
      }
    } as unknown as ProjectsViewProvider;

    const scheduler = createInitialProjectsRefreshScheduler(projectsProvider);
    scheduler.request();
    await waitForTimers();
    scheduler.request();
    await waitForTimers();

    assert.equal(refreshCalls, 1);
    completeRefresh?.();
    await waitForTimers();
    scheduler.request();
    await waitForTimers();

    assert.equal(refreshCalls, 2);
    completeRefresh?.();
  });
});

async function waitForTimers(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
