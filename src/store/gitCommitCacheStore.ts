import type { StateStore } from './stateStore';

const CACHE_KEY = 'forgeflow.projects.gitCommitCache.v1';

export interface GitCommitCacheEntry {
  projectId: string;
  path?: string;
  lastCommit?: number;
  headMtime?: number;
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
}
