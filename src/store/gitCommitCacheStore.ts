import type { StateStore } from './stateStore';

const CACHE_KEY = 'forgeflow.projects.gitCommitCache.v1';
const CACHE_REVISION_KEY = 'forgeflow.projects.gitCommitCache.revision.v1';

export interface GitCommitCacheEntry {
  projectId: string;
  path?: string;
  lastCommit?: number;
  headMtime?: number;
  headHash?: string;
  fetchedAt: number;
}

export type GitCommitCache = Record<string, GitCommitCacheEntry>;

export class GitCommitCacheStore {
  public constructor(private readonly state: StateStore) {}

  public getAll(): GitCommitCache {
    return this.state.getGlobal<GitCommitCache>(CACHE_KEY, {});
  }

  public async saveAll(cache: GitCommitCache): Promise<void> {
    await this.state.setGlobal(CACHE_KEY, cache);
  }

  public async upsertEntry(entry: GitCommitCacheEntry): Promise<void> {
    await this.updateCache((cache) => {
      const existing = cache[entry.projectId];
      const chosen = chooseNewer(existing, entry);
      return { ...cache, [entry.projectId]: chosen };
    });
  }

  public async upsertEntries(entries: GitCommitCacheEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    await this.updateCache((cache) => {
      const next = { ...cache };
      for (const entry of entries) {
        const existing = next[entry.projectId];
        next[entry.projectId] = chooseNewer(existing, entry);
      }
      return next;
    });
  }

  private async updateCache(
    mutate: (cache: GitCommitCache) => GitCommitCache
  ): Promise<void> {
    await this.state.updateGlobalWithRetry(
      CACHE_KEY,
      {},
      (current) => mutate(current),
      { revisionKey: CACHE_REVISION_KEY }
    );
  }
}

function chooseNewer(
  existing: GitCommitCacheEntry | undefined,
  incoming: GitCommitCacheEntry
): GitCommitCacheEntry {
  if (!existing) {
    return incoming;
  }
  if (incoming.fetchedAt >= existing.fetchedAt) {
    return incoming;
  }
  return existing;
}
