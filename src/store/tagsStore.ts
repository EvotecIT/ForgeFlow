import type { StateStore } from './stateStore';

const TAGS_KEY = 'forgeflow.projects.tags.v1';
const TAGS_REVISION_KEY = 'forgeflow.projects.tags.revision.v1';

export interface ProjectTags {
  tags: string[];
}

export type ProjectTagsMap = Record<string, ProjectTags>;

export class TagsStore {
  public constructor(private readonly state: StateStore) {}

  public getRevision(): string {
    return this.state.getGlobal<string>(TAGS_REVISION_KEY, '0');
  }

  public getAll(): ProjectTagsMap {
    return this.state.getGlobal<ProjectTagsMap>(TAGS_KEY, {});
  }

  public getTags(projectId: string): string[] {
    return this.getAll()[projectId]?.tags ?? [];
  }

  public async setTags(projectId: string, tags: string[]): Promise<void> {
    const map = this.getAll();
    if (tags.length === 0) {
      delete map[projectId];
    } else {
      map[projectId] = { tags };
    }
    await this.state.setGlobal(TAGS_KEY, map);
    await this.bumpRevision();
  }

  public async renameTag(oldTag: string, newTag: string): Promise<void> {
    const map = this.getAll();
    const oldLower = oldTag.toLowerCase();
    const touched = new Set<string>();

    Object.entries(map).forEach(([projectId, entry]) => {
      const next = entry.tags.map((tag) => (tag.toLowerCase() === oldLower ? newTag : tag));
      const deduped = Array.from(new Map(next.map((tag) => [tag.toLowerCase(), tag])).values());
      if (deduped.join('|') !== entry.tags.join('|')) {
        map[projectId] = { tags: deduped };
        touched.add(projectId);
      }
    });

    if (touched.size > 0) {
      await this.state.setGlobal(TAGS_KEY, map);
      await this.bumpRevision();
    }
  }

  public async removeTag(tag: string): Promise<void> {
    const map = this.getAll();
    const target = tag.toLowerCase();
    const touched = new Set<string>();

    Object.entries(map).forEach(([projectId, entry]) => {
      const next = entry.tags.filter((item) => item.toLowerCase() !== target);
      if (next.length !== entry.tags.length) {
        if (next.length === 0) {
          delete map[projectId];
        } else {
          map[projectId] = { tags: next };
        }
        touched.add(projectId);
      }
    });

    if (touched.size > 0) {
      await this.state.setGlobal(TAGS_KEY, map);
      await this.bumpRevision();
    }
  }

  private async bumpRevision(): Promise<void> {
    await this.state.setGlobal(TAGS_REVISION_KEY, createRevisionStamp());
  }
}

function createRevisionStamp(): string {
  const base = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}
