import type { StateStore } from './stateStore';

export type FavoriteKind = 'file' | 'folder';

export interface FavoriteItem {
  path: string;
  kind: FavoriteKind;
  profileOverrideId?: string;
}

const FAVORITES_KEY = 'forgeflow.files.favorites.v1';
const WORKSPACE_PINNED_KEY = 'forgeflow.files.favorites.workspacePinned.v1';
const FAVORITES_REVISION_KEY = 'forgeflow.files.favorites.revision.v1';

export class FavoritesStore {
  public constructor(private readonly state: StateStore) {}

  public getRevision(): string {
    return this.state.getGlobal<string>(FAVORITES_REVISION_KEY, '0');
  }

  public list(): FavoriteItem[] {
    return this.state.getGlobal<FavoriteItem[]>(FAVORITES_KEY, []);
  }

  public listWorkspacePinned(): string[] {
    return this.state.getWorkspace<string[]>(WORKSPACE_PINNED_KEY, []);
  }

  public async setWorkspacePinned(paths: string[]): Promise<void> {
    await this.state.setWorkspace(WORKSPACE_PINNED_KEY, paths);
  }

  public async add(item: FavoriteItem): Promise<void> {
    await this.updateFavorites((items) => {
      if (items.some((existing) => existing.path === item.path)) {
        return items;
      }
      return [...items, item];
    });
  }

  public async remove(path: string): Promise<void> {
    await this.updateFavorites((items) => items.filter((item) => item.path !== path));
    await this.unpinFromWorkspace(path);
  }

  public async move(path: string, direction: 'up' | 'down'): Promise<void> {
    await this.updateFavorites((items) => {
      const index = items.findIndex((item) => item.path === path);
      if (index === -1) {
        return items;
      }
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) {
        return items;
      }
      const next = [...items];
      const [item] = next.splice(index, 1);
      if (!item) {
        return items;
      }
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  public async updateProfileOverride(path: string, profileId?: string): Promise<void> {
    await this.updateFavorites((items) => {
      const index = items.findIndex((item) => item.path === path);
      if (index === -1) {
        return items;
      }
      const existing = items[index];
      if (!existing) {
        return items;
      }
      const next = [...items];
      next[index] = { ...existing, profileOverrideId: profileId };
      return next;
    });
  }

  public async pinToWorkspace(path: string): Promise<void> {
    const pinned = this.listWorkspacePinned();
    if (!pinned.includes(path)) {
      pinned.push(path);
      await this.setWorkspacePinned(pinned);
    }
  }

  public async unpinFromWorkspace(path: string): Promise<void> {
    const pinned = this.listWorkspacePinned().filter((item) => item !== path);
    await this.setWorkspacePinned(pinned);
  }

  private async updateFavorites(
    mutate: (items: FavoriteItem[]) => FavoriteItem[]
  ): Promise<void> {
    await this.state.updateGlobalWithRetry(
      FAVORITES_KEY,
      [],
      (current) => mutate(current),
      { revisionKey: FAVORITES_REVISION_KEY }
    );
  }
}
