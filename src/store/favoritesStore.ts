import type { StateStore } from './stateStore';

export type FavoriteKind = 'file' | 'folder';

export interface FavoriteItem {
  path: string;
  kind: FavoriteKind;
  profileOverrideId?: string;
}

const FAVORITES_KEY = 'forgeflow.files.favorites.v1';

export class FavoritesStore {
  public constructor(private readonly state: StateStore) {}

  public list(): FavoriteItem[] {
    return this.state.getGlobal<FavoriteItem[]>(FAVORITES_KEY, []);
  }

  public async add(item: FavoriteItem): Promise<void> {
    const items = this.list();
    if (items.some((existing) => existing.path === item.path)) {
      return;
    }
    items.push(item);
    await this.state.setGlobal(FAVORITES_KEY, items);
  }

  public async remove(path: string): Promise<void> {
    const items = this.list().filter((item) => item.path !== path);
    await this.state.setGlobal(FAVORITES_KEY, items);
  }

  public async move(path: string, direction: 'up' | 'down'): Promise<void> {
    const items = this.list();
    const index = items.findIndex((item) => item.path === path);
    if (index === -1) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) {
      return;
    }
    const [item] = items.splice(index, 1);
    if (!item) {
      return;
    }
    items.splice(targetIndex, 0, item);
    await this.state.setGlobal(FAVORITES_KEY, items);
  }

  public async updateProfileOverride(path: string, profileId?: string): Promise<void> {
    const items = this.list();
    const index = items.findIndex((item) => item.path === path);
    if (index === -1) {
      return;
    }
    const existing = items[index];
    if (!existing) {
      return;
    }
    items[index] = { ...existing, profileOverrideId: profileId };
    await this.state.setGlobal(FAVORITES_KEY, items);
  }
}
