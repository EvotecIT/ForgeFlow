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
    const first = scheduler.request();
    await waitForTimers();
    const second = scheduler.request();
    await waitForTimers();

    assert.equal(refreshCalls, 1);
    assert.equal(second, first);
    completeRefresh?.();
    await first;
    await waitForTimers();
    const third = scheduler.request();
    await waitForTimers();

    assert.equal(refreshCalls, 2);
    completeRefresh?.();
    await third;
  });
});

async function waitForTimers(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
